import asyncio
import random
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx
from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.db import engine, get_session
from app.models import Monitor, MonitorCheck


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_due_monitors(session: Session, limit: int = 50) -> List[Monitor]:
    statement = (
        select(Monitor)
        .where(Monitor.enabled.is_(True))
        .where(Monitor.next_run_at.is_not(None))
        .where(Monitor.next_run_at <= utcnow())
        .order_by(Monitor.next_run_at)
        .limit(limit)
    )
    results = session.exec(statement).all()
    return list(results)


def schedule_next_run(monitor: Monitor) -> datetime:
    base = utcnow() + timedelta(seconds=monitor.interval_seconds)
    jitter = random.uniform(-settings.jitter_seconds, settings.jitter_seconds)
    return base + timedelta(seconds=jitter)


async def perform_check(monitor: Monitor) -> None:
    start = time.perf_counter()
    status_code: Optional[int] = None
    latency_ms: Optional[int] = None
    outcome = "down"
    error_message: Optional[str] = None

    timeout = httpx.Timeout(timeout=monitor.timeout_seconds)

    try:
        async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": settings.user_agent}) as client:
            response = await client.request(monitor.method, monitor.url)
        status_code = response.status_code
        latency_ms = int((time.perf_counter() - start) * 1000)
        outcome = "up" if 200 <= response.status_code < 400 else "down"
        if outcome == "up":
            logger.info(
                "Monitor {} responded {} in {}ms",
                monitor.id,
                response.status_code,
                latency_ms,
            )
        else:
            logger.warning(
                "Monitor {} returned non-success status {}",
                monitor.id,
                response.status_code,
            )
    except httpx.RequestError as exc:
        logger.error("Monitor {} request error: {}", monitor.id, exc)
        error_message = str(exc)

    update_monitor_state(monitor.id, status_code, latency_ms, outcome, error_message)


def update_monitor_state(
    monitor_id: int,
    status_code: Optional[int],
    latency_ms: Optional[int],
    outcome: str,
    error_message: Optional[str],
) -> None:
    with get_session() as session:
        db_monitor = session.get(Monitor, monitor_id)
        if not db_monitor:
            logger.error("Monitor {} disappeared before update", monitor_id)
            return

        db_monitor.last_checked_at = utcnow()
        db_monitor.last_status_code = status_code
        db_monitor.last_latency_ms = latency_ms
        db_monitor.last_outcome = outcome
        db_monitor.updated_at = utcnow()

        if outcome == "up":
            db_monitor.consecutive_failures = 0
        else:
            db_monitor.consecutive_failures += 1

        if db_monitor.enabled:
            db_monitor.next_run_at = schedule_next_run(db_monitor)
        else:
            db_monitor.next_run_at = None
        check_entry = MonitorCheck(
            monitor_id=db_monitor.id,
            occurred_at=utcnow(),
            outcome=outcome,
            status_code=status_code,
            latency_ms=latency_ms,
            error_message=error_message,
        )

        session.add(db_monitor)
        session.add(check_entry)
        session.commit()


async def worker_loop() -> None:
    concurrency = settings.max_concurrency
    semaphore = asyncio.Semaphore(concurrency)

    while True:
        start_iteration = time.perf_counter()
        with Session(engine) as session:
            due_monitors = get_due_monitors(session)

        if not due_monitors:
            await asyncio.sleep(settings.loop_interval)
            continue

        async def run_with_semaphore(monitor: Monitor) -> None:
            async with semaphore:
                await perform_check(monitor)

        await asyncio.gather(*(run_with_semaphore(m) for m in due_monitors))

        elapsed = time.perf_counter() - start_iteration
        await asyncio.sleep(max(0.0, settings.loop_interval - elapsed))


def main() -> None:
    logger.info("Starting monitor worker loop")
    asyncio.run(worker_loop())


if __name__ == "__main__":
    main()
