from celery import Task

from app.celery_app import celery_app
from app.checks import run_monitor_check_sync


@celery_app.task(name="worker.check-monitor", bind=True)
def check_monitor_task(self: Task, monitor_id: int) -> None:
    """
    Entry-point Celery task that runs a single monitor check asynchronously.
    """
    run_monitor_check_sync(monitor_id)
