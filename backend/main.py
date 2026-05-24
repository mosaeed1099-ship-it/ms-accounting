import os
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.database import create_tables
from app.config import settings
from app.routers import auth, users, clients, invoices, tasks, documents, tax, dashboard
from app.routers import leads, establishment, obligations
from app.routers import import_data
from app.routers import notifications
from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.user import User, UserRole


def seed_admin():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "admin@ms-accounting.com").first()
        if not existing:
            admin = User(
                name="مدير النظام",
                email="admin@ms-accounting.com",
                hashed_password=get_password_hash("admin123"),
                role=UserRole.ADMIN,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("✅ Admin user created: admin@ms-accounting.com / admin123")
    finally:
        db.close()


def _init_db_sync():
    """Blocking DB init — runs in thread pool."""
    import time
    for attempt in range(12):
        try:
            create_tables()
            seed_admin()
            print("✅ Database ready")
            return
        except Exception as exc:
            if attempt < 11:
                print(f"⏳ DB not ready ({attempt+1}/12): {exc} — retrying in 5s")
                time.sleep(5)
            else:
                print(f"⚠️  DB init failed after 12 attempts: {exc} — app running without DB")


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    # Run DB init in background thread — /health stays available immediately
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _init_db_sync)
    yield


app = FastAPI(
    title="MS Accounting System",
    description="نظام إدارة مكتب المحاسبة - MS",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(clients.router)
app.include_router(invoices.router)
app.include_router(tasks.router)
app.include_router(documents.router)
app.include_router(tax.router)
app.include_router(dashboard.router)
# CRM/ERP Routers
app.include_router(leads.router)
app.include_router(establishment.router)
app.include_router(obligations.router)
app.include_router(import_data.router)
app.include_router(notifications.router)

if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/")
async def root():
    return {"message": "MS Accounting API", "version": settings.APP_VERSION, "status": "running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
