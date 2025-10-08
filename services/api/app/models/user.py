from datetime import datetime
from typing import Optional

from pydantic import EmailStr
from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: EmailStr = Field(sa_column=Column(String(255), unique=True, index=True, nullable=False))
    full_name: Optional[str] = Field(default=None, max_length=255)
    hashed_password: str = Field(nullable=False, max_length=255)
    role: str = Field(default="user", max_length=32)  # "user" | "admin"
    is_active: bool = Field(default=True)
    reset_token: Optional[str] = Field(default=None, max_length=255)
    reset_token_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
