import os
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    seed_admin()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="MS Accounting System",
    description="نظام إدارة مكتب المحاسبة - MS",
    version=settings.APP_VERSION,
    lifespan=lifespan,
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
