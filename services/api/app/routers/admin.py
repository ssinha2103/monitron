from datetime import datetime, timedelta
import secrets

from typing import Any, Optional, Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.dependencies import require_admin
from app.core.security import get_password_hash
from app.db.session import get_session
from app.models import Monitor, MonitorCheck, User
from app.schemas import (
    AdminActivityStats,
    AdminMonitorStats,
    AdminOverview,
    AdminUserStats,
    MonitorHealthSnapshot,
    UserAdminCreate,
    UserCreateResponse,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


def _scalar(session: Session, statement: Any, default: Optional[float] = 0) -> Optional[float]:
    result = session.exec(statement).first()
    if result is None:
        return default
    if isinstance(result, Sequence):
        return result[0] if result else default
    return result


@router.get("/overview", response_model=AdminOverview)
def get_overview(
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> AdminOverview:
    now = datetime.utcnow()
    last_day = now - timedelta(hours=24)
    last_week = now - timedelta(days=7)

    total_users = int(_scalar(session, select(func.count()).select_from(User), default=0) or 0)
    active_users = int(
        _scalar(session, select(func.count()).select_from(User).where(User.is_active.is_(True)), default=0) or 0
    )
    admin_users = int(
        _scalar(session, select(func.count()).select_from(User).where(User.role == "admin"), default=0) or 0
    )
    new_last_week = int(
        _scalar(session, select(func.count()).select_from(User).where(User.created_at >= last_week), default=0) or 0
    )

    total_monitors = int(_scalar(session, select(func.count()).select_from(Monitor), default=0) or 0)
    active_monitors = int(
        _scalar(session, select(func.count()).select_from(Monitor).where(Monitor.enabled.is_(True)), default=0) or 0
    )
    paused_monitors = max(total_monitors - active_monitors, 0)
    failing_monitors = int(
        _scalar(
            session,
            select(func.count())
            .select_from(Monitor)
            .where(Monitor.enabled.is_(True))
            .where(Monitor.last_outcome.is_not(None))
            .where(Monitor.last_outcome != "up"),
            default=0,
        )
        or 0
    )
    avg_latency = _scalar(
        session, select(func.avg(Monitor.last_latency_ms)).where(Monitor.last_latency_ms.is_not(None)), default=None
    )
    avg_latency_float = float(avg_latency) if avg_latency is not None else None
    if avg_latency_float is not None:
        avg_latency_float = round(avg_latency_float, 1)

    checks_last_day = int(
        _scalar(
            session,
            select(func.count()).select_from(MonitorCheck).where(MonitorCheck.occurred_at >= last_day),
            default=0,
        )
        or 0
    )
    incidents_last_day = int(
        _scalar(
            session,
            select(func.count())
            .select_from(MonitorCheck)
            .where(MonitorCheck.occurred_at >= last_day)
            .where(MonitorCheck.outcome != "up"),
            default=0,
        )
        or 0
    )

    recent_users = session.exec(
        select(User).order_by(User.created_at.desc()).limit(5)
    ).all()

    failing = session.exec(
        select(Monitor)
        .where(Monitor.consecutive_failures > 0)
        .order_by(Monitor.consecutive_failures.desc(), Monitor.updated_at.desc())
        .limit(5)
    ).all()
    owner_emails: dict[int, str] = {}
    owner_ids = {monitor.owner_id for monitor in failing if monitor.owner_id}
    if owner_ids:
        owners = session.exec(select(User).where(User.id.in_(tuple(owner_ids)))).all()
        owner_emails = {owner.id: owner.email for owner in owners}

    failing_snapshots = [
        MonitorHealthSnapshot(
            id=monitor.id,
            name=monitor.name,
            url=monitor.url,
            last_outcome=monitor.last_outcome,
            consecutive_failures=monitor.consecutive_failures,
            owner_email=owner_emails.get(monitor.owner_id),
        )
        for monitor in failing
    ]

    return AdminOverview(
        generated_at=now,
        users=AdminUserStats(
            total=total_users,
            active=active_users,
            admins=admin_users,
            new_last_7_days=new_last_week,
        ),
        monitors=AdminMonitorStats(
            total=total_monitors,
            active=active_monitors,
            paused=paused_monitors,
            failing=failing_monitors,
            avg_latency_ms=avg_latency_float,
        ),
        activity=AdminActivityStats(
            checks_last_24h=checks_last_day,
            incidents_last_24h=incidents_last_day,
        ),
        recent_users=recent_users,
        top_failing_monitors=failing_snapshots,
    )


@router.post("/users", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserAdminCreate,
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> UserCreateResponse:
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    if payload.role not in {"user", "admin"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    temporary_password = payload.password or secrets.token_urlsafe(8)
    if len(temporary_password) > 72:
        temporary_password = temporary_password[:72]

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=get_password_hash(temporary_password),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return UserCreateResponse(
        user=user,
        temporary_password=None if payload.password else temporary_password,
    )


@router.get("/users", response_model=list[UserRead])
def list_users(
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[User]:
    return session.exec(select(User).order_by(User.created_at)).all()


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    data = payload.model_dump(exclude_unset=True)

    if "password" in data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use reset flow for passwords")

    role = data.get("role")
    if role and role not in {"user", "admin"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    for key, value in data.items():
        setattr(user, key, value)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
