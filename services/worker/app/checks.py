from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from loguru import logger

from app.config import settings
from app.db import ensure_schema, get_session
from app.models import Monitor, MonitorCheck


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def schedule_next_run(monitor: Monitor) -> datetime:
    base = utcnow() + timedelta(seconds=monitor.interval_seconds)
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

        db_monitor.next_run_at = schedule_next_run(db_monitor)

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


async def execute_monitor_check(monitor_id: int) -> None:
    snapshot = load_monitor_snapshot(monitor_id)
    if not snapshot:
        return

    result = await run_http_check(snapshot)
    persist_check_result(snapshot, result)


def run_monitor_check_sync(monitor_id: int) -> None:
    ensure_schema()
    asyncio.run(execute_monitor_check(monitor_id))
