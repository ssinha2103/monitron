from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)


def get_session() -> Session:
    return Session(engine)


def ensure_schema() -> None:
    # Import models to ensure SQLModel metadata is populated before create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(bind=engine)
