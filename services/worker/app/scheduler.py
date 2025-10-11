from __future__ import annotations

import asyncio
import time
from datetime import timedelta
from typing import Iterable, List

from loguru import logger
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.config import settings
from app.db import engine, ensure_schema
from app.models import Monitor
from app.tasks import check_monitor_task
from app.checks import utcnow


def claim_due_monitors(session: Session, limit: int) -> List[int]:
    now = utcnow()
    claim_until = now + timedelta(seconds=settings.scheduler_claim_seconds)

    statement = (
        select(Monitor)
        .where(Monitor.enabled.is_(True))
        .where(Monitor.next_run_at <= now)
        .order_by(Monitor.next_run_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )

    monitors: Iterable[Monitor] = session.exec(statement).all()

    claimed_ids: List[int] = []
    for monitor in monitors:
        if monitor.id is None:
            continue
        monitor.next_run_at = claim_until
        monitor.updated_at = now
        session.add(monitor)
        claimed_ids.append(monitor.id)

    if claimed_ids:
        session.commit()
    else:
        session.rollback()

    return claimed_ids


async def dispatch_due_checks() -> None:
    poll_interval = settings.scheduler_poll_interval
    fetch_limit = settings.max_concurrency * 4

    logger.info(
        "Starting scheduler loop with poll interval {}s and limit {}",
        poll_interval,
        fetch_limit,
    )

    while True:
        iteration_start = time.perf_counter()
        with Session(engine) as session:
            claimed_ids = claim_due_monitors(session, fetch_limit)

        if claimed_ids:
            logger.debug("Dispatching {} monitor checks", len(claimed_ids))
            for monitor_id in claimed_ids:
                check_monitor_task.apply_async(args=(monitor_id,))
        else:
            logger.trace("No monitors due this cycle")

        elapsed = time.perf_counter() - iteration_start
        sleep_for = max(0.0, poll_interval - elapsed)
        await asyncio.sleep(sleep_for)


def main() -> None:
    logger.info("Launching monitor scheduler (Celery broker: {})", settings.redis_url)
    # Ensure Celery is initialised early to surface broker issues immediately.
    try:
        celery_app.control.ping(timeout=0.5)  # Soft check; empty list if no workers yet.
    except Exception as exc:  # pragma: no cover - purely defensive logging
        logger.warning("Celery broker ping failed during scheduler startup: {}", exc)
    ensure_schema()
    asyncio.run(dispatch_due_checks())


if __name__ == "__main__":
    main()
