from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()
