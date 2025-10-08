from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_password_hash,
    verify_password,
)
from app.db.session import get_session
from app.models import User
from app.schemas import (
    AuthTokens,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    UserCreate,
    UserRead,
)

REFRESH_COOKIE_NAME = "monitron_refresh_token"
REFRESH_COOKIE_PATH = "/api"

router = APIRouter(prefix="/auth", tags=["Auth"])


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    max_age = settings.refresh_token_expire_minutes * 60
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=max_age,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")


def _issue_tokens(response: Response, user: User) -> AuthTokens:
    access_token = create_access_token(user.email)
    refresh_token = create_refresh_token(user.email)
    _set_refresh_cookie(response, refresh_token)
    return AuthTokens(access_token=access_token)


@router.post("/register", response_model=AuthTokens, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, response: Response, session: Session = Depends(get_session)) -> AuthTokens:
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        role="user",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _issue_tokens(response, user)


@router.post("/login", response_model=AuthTokens)
def login(payload: LoginRequest, response: Response, session: Session = Depends(get_session)) -> AuthTokens:
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return _issue_tokens(response, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    _clear_refresh_cookie(response)


@router.post("/refresh", response_model=AuthTokens)
def refresh(request: Request, response: Response, session: Session = Depends(get_session)) -> AuthTokens:
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    try:
        payload = decode_refresh_token(refresh_token)
    except Exception:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    return _issue_tokens(response, user)


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return current_user


@router.post("/forgot", status_code=status.HTTP_200_OK)
def forgot_password(payload: ForgotPasswordRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not user.is_active:
        return {"message": "If the account exists, an email has been sent."}

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.reset_token_expire_minutes)
    user.reset_token = token
    user.reset_token_expires_at = expires_at
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"message": "Reset instructions sent.", "token": token}


@router.post("/reset", status_code=status.HTTP_200_OK)
def reset_password(payload: ResetPasswordRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    user = session.exec(select(User).where(User.reset_token == payload.token)).first()
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user.hashed_password = get_password_hash(payload.password)
    user.reset_token = None
    user.reset_token_expires_at = None
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"message": "Password updated"}
