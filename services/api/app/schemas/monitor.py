from datetime import datetime
from typing import Optional

from pydantic import BaseModel, HttpUrl, field_validator


class MonitorBase(BaseModel):
    name: str
    url: HttpUrl
    method: str = "GET"
    interval_seconds: int = 60
    timeout_seconds: int = 10
    enabled: bool = True

    @field_validator("interval_seconds")
    @classmethod
    def validate_interval(cls, value: int) -> int:
        if not 30 <= value <= 86_400:
            raise ValueError("interval_seconds must be between 30 and 86400")
        return value

    @field_validator("timeout_seconds")
    @classmethod
    def validate_timeout(cls, value: int) -> int:
        if not 1 <= value <= 60:
            raise ValueError("timeout_seconds must be between 1 and 60")
        return value


class MonitorCreate(MonitorBase):
    pass


class MonitorUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[HttpUrl] = None
    method: Optional[str] = None
    interval_seconds: Optional[int] = None
    timeout_seconds: Optional[int] = None
    enabled: Optional[bool] = None


class MonitorRead(MonitorBase):
    id: int
    next_run_at: datetime
    last_checked_at: Optional[datetime] = None
    last_status_code: Optional[int] = None
    last_latency_ms: Optional[int] = None
    last_outcome: Optional[str] = None
    consecutive_failures: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MonitorCheckRead(BaseModel):
    id: int
    monitor_id: int
    occurred_at: datetime
    outcome: str
    status_code: Optional[int] = None
    latency_ms: Optional[int] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True
