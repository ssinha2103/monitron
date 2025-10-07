from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db.session import get_session
from app.models.monitor import Monitor, MonitorCheck
from app.schemas.monitor import MonitorCheckRead, MonitorCreate, MonitorRead, MonitorUpdate

router = APIRouter(prefix="/monitors", tags=["Monitors"])


# Support both /monitors and /monitors/ without redirect
@router.get("/", response_model=list[MonitorRead])
@router.get("", response_model=list[MonitorRead], include_in_schema=False)
def list_monitors(session: Session = Depends(get_session)) -> list[Monitor]:
    monitors = session.exec(select(Monitor).order_by(Monitor.id)).all()
    return monitors


@router.post("/", response_model=MonitorRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=MonitorRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_monitor(payload: MonitorCreate, session: Session = Depends(get_session)) -> Monitor:
    monitor = Monitor(
        name=payload.name,
        url=str(payload.url),
        method=payload.method.upper(),
        interval_seconds=payload.interval_seconds,
        timeout_seconds=payload.timeout_seconds,
        enabled=payload.enabled,
    )
    session.add(monitor)
    session.commit()
    session.refresh(monitor)
    return monitor


@router.get("/{monitor_id}", response_model=MonitorRead)
def get_monitor(monitor_id: int, session: Session = Depends(get_session)) -> Monitor:
    monitor = session.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found")
    return monitor


@router.get(
    "/{monitor_id}/checks",
    response_model=list[MonitorCheckRead],
    summary="Recent check results for a monitor",
)
def get_monitor_checks(
    monitor_id: int,
    limit: int = 25,
    session: Session = Depends(get_session),
) -> list[MonitorCheck]:
    if limit <= 0 or limit > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="limit must be between 1 and 200")

    monitor = session.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found")

    statement = (
        select(MonitorCheck)
        .where(MonitorCheck.monitor_id == monitor_id)
        .order_by(MonitorCheck.occurred_at.desc())
        .limit(limit)
    )
    return session.exec(statement).all()


@router.post(
    "/{monitor_id}/run",
    response_model=MonitorCheckRead,
    status_code=status.HTTP_201_CREATED,
    summary="Trigger an immediate check for a monitor",
)
async def run_monitor_check(
    monitor_id: int,
    session: Session = Depends(get_session),
) -> MonitorCheck:
    monitor = session.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found")
    if not monitor.enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Monitor is disabled")

    timeout = httpx.Timeout(timeout=monitor.timeout_seconds)
    status_code: int | None = None
    latency_ms: int | None = None
    outcome = "down"
    error_message: str | None = None
    start_time = datetime.now(timezone.utc)
    end_time = start_time
    try:
        async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "MonitronAPI/0.1"}) as client:
            response = await client.request(monitor.method, monitor.url)
        status_code = response.status_code
        end_time = datetime.now(timezone.utc)
        latency_ms = int((end_time - start_time).total_seconds() * 1000)
        outcome = "up" if 200 <= response.status_code < 400 else "down"
    except httpx.RequestError as exc:
        error_message = str(exc)
    completed_at = datetime.now(timezone.utc)
    monitor.last_checked_at = completed_at
    monitor.last_status_code = status_code
    monitor.last_latency_ms = latency_ms
    monitor.last_outcome = outcome
    monitor.updated_at = completed_at
    if outcome == "up":
        monitor.consecutive_failures = 0
    else:
        monitor.consecutive_failures += 1
    monitor.next_run_at = completed_at + timedelta(seconds=monitor.interval_seconds)

    check_entry = MonitorCheck(
        monitor_id=monitor.id,
        occurred_at=completed_at,
        outcome=outcome,
        status_code=status_code,
        latency_ms=latency_ms,
        error_message=error_message,
    )

    session.add(monitor)
    session.add(check_entry)
    session.commit()
    session.refresh(check_entry)

    return check_entry


@router.put("/{monitor_id}", response_model=MonitorRead)
def update_monitor(monitor_id: int, payload: MonitorUpdate, session: Session = Depends(get_session)) -> Monitor:
    monitor = session.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found")

    data = payload.model_dump(exclude_unset=True)
    if "url" in data:
        data["url"] = str(data["url"])

    for key, value in data.items():
        setattr(monitor, key, value)
    monitor.updated_at = datetime.now(timezone.utc)

    session.add(monitor)
    session.commit()
    session.refresh(monitor)
    return monitor


@router.delete("/{monitor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_monitor(monitor_id: int, session: Session = Depends(get_session)) -> None:
    monitor = session.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found")
    session.delete(monitor)
    session.commit()
