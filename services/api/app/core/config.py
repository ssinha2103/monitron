from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    api_v1_prefix: str = "/api/v1"
    project_name: str = "Monitron"

    database_url: str = Field(..., alias="DATABASE_URL")
    redis_url: str | None = Field(None, alias="REDIS_URL")

    jwt_secret_key: str = Field(..., alias="JWT_SECRET_KEY")
    jwt_refresh_secret_key: str | None = Field(None, alias="JWT_REFRESH_SECRET_KEY")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_minutes: int = 60 * 24 * 7
    reset_token_expire_minutes: int = 60

    initial_admin_email: str | None = Field(None, alias="INITIAL_ADMIN_EMAIL")
    initial_admin_password: str | None = Field(None, alias="INITIAL_ADMIN_PASSWORD")

    cors_origins: List[AnyHttpUrl] | List[str] = []

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
