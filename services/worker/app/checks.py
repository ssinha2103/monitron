from __future__ import annotations

import asyncio
import random
import smtplib
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from email.message import EmailMessage
from loguru import logger
from sqlmodel import Session, func, select

from app.config import settings
from app.db import ensure_schema, get_session
from app.models import Monitor, MonitorCheck, User


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def determine_failure_retry_interval(consecutive_failures: int, default_interval: float) -> float:
    """
    Calculate the next retry interval for a monitor that is currently failing.
    """
    if consecutive_failures <= 0:
        return default_interval

    remaining = consecutive_failures
    for stage in settings.failure_retry_stages:
        attempts = stage.attempts
        if attempts is None or remaining <= attempts:
            return max(stage.interval_seconds, 1.0)
        remaining -= attempts

    return default_interval


def schedule_next_run(monitor: Monitor, outcome: str) -> datetime:
    interval_seconds: float = monitor.interval_seconds
    if outcome == "down":
        interval_seconds = determine_failure_retry_interval(
            monitor.consecutive_failures, monitor.interval_seconds
        )

    base = utcnow() + timedelta(seconds=interval_seconds)
    jitter = random.uniform(-settings.jitter_seconds, settings.jitter_seconds)
    return base + timedelta(seconds=jitter)


@dataclass(frozen=True)
class MonitorSnapshot:
    id: int
    method: str
    url: str
    timeout_seconds: int
    interval_seconds: int


@dataclass(frozen=True)
class CheckResult:
    outcome: str
    completed_at: datetime
    status_code: Optional[int]
    latency_ms: Optional[int]
    error_message: Optional[str]


def load_monitor_snapshot(monitor_id: int) -> MonitorSnapshot | None:
    with get_session() as session:
        monitor = session.get(Monitor, monitor_id)
        if not monitor:
            logger.warning("Monitor {} not found when preparing snapshot", monitor_id)
            return None
        if not monitor.enabled:
            logger.info("Monitor {} is disabled; skipping check dispatch", monitor_id)
            return None
        return MonitorSnapshot(
            id=monitor.id,
            method=monitor.method,
            url=monitor.url,
            timeout_seconds=monitor.timeout_seconds,
            interval_seconds=monitor.interval_seconds,
        )


async def run_http_check(snapshot: MonitorSnapshot) -> CheckResult:
    """
    Execute the external HTTP check asynchronously and capture timing metadata.
    """
    start = time.perf_counter()
    status_code: Optional[int] = None
    latency_ms: Optional[int] = None
    outcome = "down"
    error_message: Optional[str] = None

    timeout = httpx.Timeout(timeout=snapshot.timeout_seconds)
    headers = {"User-Agent": settings.user_agent}

    try:
        async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
            response = await client.request(snapshot.method, snapshot.url)
        status_code = response.status_code
        latency_ms = int((time.perf_counter() - start) * 1000)
        outcome = "up" if 200 <= response.status_code < 400 else "down"
        if outcome == "up":
            logger.info(
                "Monitor {} responded {} in {}ms",
                snapshot.id,
                response.status_code,
                latency_ms,
            )
        else:
            logger.warning(
                "Monitor {} returned non-success status {}",
                snapshot.id,
                response.status_code,
            )
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        logger.error("Monitor {} request error: {}", snapshot.id, exc)
        error_message = str(exc)

    return CheckResult(
        outcome=outcome,
        completed_at=utcnow(),
        status_code=status_code,
        latency_ms=latency_ms,
        error_message=error_message,
    )


def persist_check_result(snapshot: MonitorSnapshot, result: CheckResult) -> None:
    with get_session() as session:
        db_monitor = session.get(Monitor, snapshot.id)
        if not db_monitor:
            logger.error("Monitor {} disappeared before update", snapshot.id)
            return

        db_monitor.last_checked_at = result.completed_at
        db_monitor.last_status_code = result.status_code
        db_monitor.last_latency_ms = result.latency_ms
        db_monitor.last_outcome = result.outcome
        db_monitor.updated_at = utcnow()

        if result.outcome == "up":
            db_monitor.consecutive_failures = 0
        else:
            db_monitor.consecutive_failures += 1

        db_monitor.next_run_at = schedule_next_run(db_monitor, result.outcome)

        check_entry = MonitorCheck(
            monitor_id=db_monitor.id,
            occurred_at=result.completed_at,
            outcome=result.outcome,
            status_code=result.status_code,
            latency_ms=result.latency_ms,
            error_message=result.error_message,
        )

        session.add(check_entry)
        session.add(db_monitor)
        session.commit()

        if result.outcome == "down":
            maybe_send_sustained_down_alert(session, db_monitor, result)


def maybe_send_sustained_down_alert(
    session: Session, monitor: Monitor, result: CheckResult
) -> None:
    """
    Dispatch an email alert when sustained downtime crosses the configured threshold.
    """
    threshold = settings.sustained_down_threshold
    window_minutes = settings.sustained_down_window_minutes

    if threshold <= 0 or window_minutes <= 0:
        return
    if not monitor.id or not monitor.owner_id:
        return
    if not settings.smtp_host or not settings.alert_email_from:
        logger.debug(
            "Skipping alert for monitor {} because SMTP is not configured", monitor.id
        )
        return

    window_start = utcnow() - timedelta(minutes=window_minutes)

    down_checks_stmt = (
        select(func.count(MonitorCheck.id))
        .where(MonitorCheck.monitor_id == monitor.id)
        .where(MonitorCheck.outcome == "down")
        .where(MonitorCheck.occurred_at >= window_start)
    )
    down_checks = int(session.exec(down_checks_stmt).one())

    if down_checks != threshold:
        return

    recipient = lookup_owner_email(session, monitor.owner_id)
    if not recipient:
        logger.warning(
            "Monitor {} exceeded failure threshold but owner email is unavailable",
            monitor.id,
        )
        return

    send_sustained_downtime_email(monitor, result, recipient, down_checks, window_minutes)


def lookup_owner_email(session: Session, owner_id: Optional[int]) -> Optional[str]:
    if not owner_id:
        return None
    owner = session.get(User, owner_id)
    if not owner:
        return None
    email = getattr(owner, "email", None)
    return email


def send_sustained_downtime_email(
    monitor: Monitor,
    result: CheckResult,
    recipient: str,
    down_checks: int,
    window_minutes: int,
) -> bool:
    message = EmailMessage()
    message["Subject"] = f"[Monitron] Monitor '{monitor.name}' appears down"
    message["From"] = settings.alert_email_from
    message["To"] = recipient

    latest_status = (
        f"{result.status_code} ({result.outcome})" if result.status_code else result.outcome
    )
    error_line = f"\nLast error: {result.error_message}" if result.error_message else ""

    message.set_content(
        (
            f"Hello,\n\n"
            f"We detected {down_checks} failed checks for '{monitor.name}' "
            f"within the last {window_minutes} minutes.\n"
            f"URL: {monitor.url}\n"
            f"Latest status: {latest_status}{error_line}\n\n"
            "We'll keep probing on an accelerated schedule until the service recovers.\n"
            "— Monitron"
        )
    )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout
            ) as smtp:
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(
                settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout
            ) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls()
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error(
            "Failed to dispatch sustained downtime alert for monitor {}: {}",
            monitor.id,
            exc,
        )
        return False

    logger.info(
        "Dispatched sustained downtime alert for monitor {} to {}",
        monitor.id,
        recipient,
    )
    return True


async def execute_monitor_check(monitor_id: int) -> None:
    snapshot = load_monitor_snapshot(monitor_id)
    if not snapshot:
        return

    result = await run_http_check(snapshot)
    persist_check_result(snapshot, result)


def run_monitor_check_sync(monitor_id: int) -> None:
    ensure_schema()
    asyncio.run(execute_monitor_check(monitor_id))
