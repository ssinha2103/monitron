from datetime import datetime, timezone
from typing import Optional

from pydantic import EmailStr
from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Monitor(SQLModel, table=True):
    __tablename__ = "monitors"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255, index=True)
    url: str = Field(max_length=1024)
    method: str = Field(default="GET", max_length=16)
    interval_seconds: int = Field(default=60)
    timeout_seconds: int = Field(default=10)
    enabled: bool = Field(default=True)
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)

    next_run_at: datetime = Field(default_factory=utcnow, index=True)
    last_checked_at: Optional[datetime] = None
    last_status_code: Optional[int] = None
    last_latency_ms: Optional[int] = None
    last_outcome: Optional[str] = Field(default=None, max_length=16)
    consecutive_failures: int = Field(default=0)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class MonitorCheck(SQLModel, table=True):
    __tablename__ = "monitor_checks"

    id: Optional[int] = Field(default=None, primary_key=True)
    monitor_id: int = Field(foreign_key="monitors.id", index=True)
    occurred_at: datetime = Field(default_factory=utcnow, index=True)
    outcome: str = Field(max_length=16)
    status_code: Optional[int] = None
    latency_ms: Optional[int] = None
    error_message: Optional[str] = Field(default=None, max_length=1024)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: EmailStr = Field(sa_column=Column(String(255), unique=True, index=True, nullable=False))
    full_name: Optional[str] = Field(default=None, max_length=255)
    hashed_password: str = Field(nullable=False, max_length=255)
    role: str = Field(default="user", max_length=32)
    is_active: bool = Field(default=True)
    reset_token: Optional[str] = Field(default=None, max_length=255)
    reset_token_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
