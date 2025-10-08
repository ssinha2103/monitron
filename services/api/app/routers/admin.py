from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.dependencies import require_admin
from app.db.session import get_session
from app.models import User
from app.schemas import UserRead, UserUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])


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
