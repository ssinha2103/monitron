from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _create_token(data: dict[str, Any], expires_delta: timedelta, secret: str) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, secret, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str) -> str:
    expires = timedelta(minutes=settings.access_token_expire_minutes)
    return _create_token({"sub": subject}, expires, settings.jwt_secret_key)


def create_refresh_token(subject: str) -> str:
    secret = settings.jwt_refresh_secret_key or settings.jwt_secret_key
    expires = timedelta(minutes=settings.refresh_token_expire_minutes)
    return _create_token({"sub": subject, "type": "refresh"}, expires, secret)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def decode_refresh_token(token: str) -> dict[str, Any]:
    secret = settings.jwt_refresh_secret_key or settings.jwt_secret_key
    return jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
