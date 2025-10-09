from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from .user import UserRead


class AdminUserStats(BaseModel):
    total: int
    active: int
    admins: int
    new_last_7_days: int


class AdminMonitorStats(BaseModel):
    total: int
    active: int
    paused: int
    failing: int
    avg_latency_ms: Optional[float] = None


class AdminActivityStats(BaseModel):
    checks_last_24h: int
    incidents_last_24h: int


class MonitorHealthSnapshot(BaseModel):
    id: int
    name: str
    url: str
    last_outcome: Optional[str] = None
    consecutive_failures: int
    owner_email: Optional[EmailStr] = None


class AdminOverview(BaseModel):
    generated_at: datetime
    users: AdminUserStats
    monitors: AdminMonitorStats
    activity: AdminActivityStats
    recent_users: list[UserRead]
    top_failing_monitors: list[MonitorHealthSnapshot]


class UserAdminCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: str = "user"
    password: Optional[str] = None


class UserCreateResponse(BaseModel):
    user: UserRead
    temporary_password: Optional[str] = None
