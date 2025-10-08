from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import init_db
from app.db.session import engine
from app.models import User
from app.routers import admin, auth, monitors

app = FastAPI(title=settings.project_name)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.cors_origins] if settings.cors_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    if settings.initial_admin_email and settings.initial_admin_password:
        with Session(engine) as session:
            exists = session.exec(select(User).where(User.email == settings.initial_admin_email)).first()
            if not exists:
                admin_user = User(
                    email=settings.initial_admin_email,
                    hashed_password=get_password_hash(settings.initial_admin_password),
                    role="admin",
                    full_name="Administrator",
                )
                session.add(admin_user)
                session.commit()


app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(monitors.router, prefix=settings.api_v1_prefix)
app.include_router(admin.router, prefix=settings.api_v1_prefix)


@app.get("/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
