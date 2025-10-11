from celery import Celery

from app.config import settings

# Central Celery application instance used by both the scheduler and workers.
celery_app = Celery(
    "monitron-worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_default_queue=settings.celery_queue,
    task_acks_late=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)
