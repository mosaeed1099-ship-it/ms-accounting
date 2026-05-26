import os
import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.database import create_tables
from app.config import settings
from app.routers import auth, users, clients, invoices, tasks, documents, tax, dashboard
from app.routers import leads, establishment, obligations
from app.routers import import_data
from app.routers import notifications
from app.routers import collection
from app.routers import gdrive
from app.routers import quotations
from app.routers import accounting
from app.routers import eta as eta_router
from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# ── Keep-alive self-ping (prevents Railway from sleeping) ────────────────────
_SELF_URL = os.environ.get(
    "RAILWAY_PUBLIC_DOMAIN",
    "ms-accounting-api-production.up.railway.app",
)


def _keep_alive_job():
    """Ping own /health every 8 min → keeps Railway container warm."""
    try:
        import requests as _req
        url = f"https://{_SELF_URL}/health"
        r = _req.get(url, timeout=10)
        logger.info(f"[keep-alive] ping {url} → {r.status_code}")
    except Exception as exc:
        logger.warning(f"[keep-alive] ping failed: {exc}")


def _db_health_job():
    """Test DB connectivity every 5 min; reconnect if stale."""
    try:
        from app.database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("[db-health] OK")
    except Exception as exc:
        logger.warning(f"[db-health] failed: {exc} — pool will auto-reconnect via pool_pre_ping")


def _start_scheduler():
    """Start APScheduler background jobs."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger
        sched = BackgroundScheduler(timezone="Africa/Cairo", daemon=True)
        sched.add_job(_keep_alive_job,  IntervalTrigger(minutes=8),  id="keep_alive",  replace_existing=True)
        sched.add_job(_db_health_job,   IntervalTrigger(minutes=5),  id="db_health",   replace_existing=True)
        sched.start()
        logger.info("✅ Scheduler started (keep-alive every 8 min, db-health every 5 min)")
        return sched
    except Exception as exc:
        logger.warning(f"⚠️  Scheduler not started: {exc}")
        return None


# ── DB init ──────────────────────────────────────────────────────────────────

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


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)

    # DB init in background thread so /health answers immediately on cold start
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _init_db_sync)

    # Start background scheduler
    _start_scheduler()

    yield
    # Nothing to clean up — scheduler is daemon=True, dies with process


# ── App ───────────────────────────────────────────────────────────────────────

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


# ── Global exception handler (prevents unhandled 500s) ───────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"خطأ داخلي في الخادم: {type(exc).__name__}"},
    )


# ── Routers ───────────────────────────────────────────────────────────────────

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
app.include_router(collection.router)
app.include_router(gdrive.router)
app.include_router(quotations.router)
app.include_router(accounting.router)
app.include_router(eta_router.router)

if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ── Core endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "MS Accounting API", "version": settings.APP_VERSION, "status": "running"}


@app.get("/health")
async def health():
    """Health check — also tests DB connectivity."""
    from app.database import engine
    from sqlalchemy import text
    db_ok = False
    db_error = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        db_error = str(exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "db": "connected" if db_ok else f"error: {db_error}",
        "version": settings.APP_VERSION,
    }


@app.post("/api/admin/fix-category-column")
async def fix_category_column():
    """Admin: force-convert documents.category from enum to varchar."""
    from app.database import engine
    from sqlalchemy import text
    results = []
    steps = [
        ("drop_default",
         "ALTER TABLE documents ALTER COLUMN category DROP DEFAULT"),
        ("convert_to_varchar",
         "ALTER TABLE documents ALTER COLUMN category TYPE VARCHAR(50) USING lower(category::text)"),
        ("set_default",
         "ALTER TABLE documents ALTER COLUMN category SET DEFAULT 'other'"),
        ("normalize_case",
         "UPDATE documents SET category = lower(category) WHERE category IS NOT NULL AND category != lower(category)"),
        ("drop_enum_type",
         "DROP TYPE IF EXISTS documentcategory"),
    ]
    with engine.connect() as conn:
        for step_name, sql in steps:
            try:
                conn.execute(text(sql))
                conn.commit()
                results.append({"step": step_name, "status": "ok"})
            except Exception as exc:
                conn.rollback()
                results.append({"step": step_name, "status": "error", "detail": str(exc)})
    return {"results": results}
