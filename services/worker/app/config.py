from functools import lru_cache
from typing import Optional, Tuple

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


class FailureRetryStage(BaseModel):
    """
    Represents a contiguous block of rapid retry attempts for a monitor that is down.
    When `attempts` is None the stage is unbounded and its interval applies until recovery.
    """

    attempts: Optional[int] = None
    interval_seconds: float


class Settings(BaseSettings):
    database_url: str = Field(..., alias="DATABASE_URL")
    redis_url: str = Field(..., alias="REDIS_URL")
    http_timeout: float = 10.0
    max_concurrency: int = 5
    jitter_seconds: float = 0.2
    loop_interval: float = 1.0
    user_agent: str = "MonitronWorker/0.1"
    scheduler_poll_interval: float = 1.0
    scheduler_claim_seconds: float = 30.0
    celery_queue: str = "monitor_checks"
    failure_retry_stages: Tuple[FailureRetryStage, ...] = (
        FailureRetryStage(attempts=2, interval_seconds=30.0),  # 1 min @ 30s
        FailureRetryStage(attempts=5, interval_seconds=60.0),  # 5 min @ 60s
        FailureRetryStage(attempts=12, interval_seconds=120.0),  # 24 min @ 2min
        FailureRetryStage(attempts=None, interval_seconds=300.0),  # fallback @ 5min
    )
    sustained_down_threshold: int = Field(10, alias="SUSTAINED_DOWN_THRESHOLD")
    sustained_down_window_minutes: int = Field(
        60, alias="SUSTAINED_DOWN_WINDOW_MINUTES"
    )
    smtp_host: Optional[str] = Field(None, alias="SMTP_HOST")
    smtp_port: int = Field(587, alias="SMTP_PORT")
    smtp_username: Optional[str] = Field(None, alias="SMTP_USERNAME")
    smtp_password: Optional[str] = Field(None, alias="SMTP_PASSWORD")
    smtp_use_tls: bool = Field(True, alias="SMTP_USE_TLS")
    smtp_use_ssl: bool = Field(False, alias="SMTP_USE_SSL")
    alert_email_from: Optional[str] = Field(None, alias="ALERT_EMAIL_FROM")
    smtp_timeout: float = Field(10.0, alias="SMTP_TIMEOUT")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()
