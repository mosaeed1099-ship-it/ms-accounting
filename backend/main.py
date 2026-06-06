import sys, os
# ── Early startup signal (appears even if later imports crash) ───────────────
print("🚀 MS Accounting backend starting...", file=sys.stderr, flush=True)
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
from app.routers.settlements import router as settlements_router, appt_router, papers_router
from app.routers import payroll as payroll_router
from app.routers import fixed_assets as assets_router
from app.routers import reports as reports_router
from app.routers import postal as postal_router
from app.routers import statements as statements_router
from app.routers import timesheet as timesheet_router
from app.routers import permissions as permissions_router
from app.routers import company_documents as company_documents_router
from app.routers import audit_logs as audit_logs_router
from app.routers import folders as folders_router
from app.routers import client_portal as client_portal_router
from app.routers import office_services as office_services_router
from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.user import User, UserRole
# Import new models so create_all registers their tables
import app.models.permission          # noqa: F401
import app.models.company_document    # noqa: F401
import app.models.audit_log           # noqa: F401
import app.models.folder              # noqa: F401
import app.models.client_portal       # noqa: F401
import app.models.office_service      # noqa: F401

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


def _db_backup_job():
    """Weekly PostgreSQL backup — pg_dump compressed → email to admin."""
    import subprocess, gzip, os
    from datetime import datetime

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or "sqlite" in db_url:
        logger.info("[backup] SQLite/desktop mode — skipping pg backup")
        return

    # Parse postgresql://user:pass@host:port/dbname
    try:
        from urllib.parse import urlparse
        p = urlparse(db_url)
        env = os.environ.copy()
        env["PGPASSWORD"] = p.password or ""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        result = subprocess.run(
            ["pg_dump", "-h", p.hostname, "-p", str(p.port or 5432),
             "-U", p.username, "-d", p.path.lstrip("/"),
             "--no-owner", "--no-acl", "-F", "p"],
            capture_output=True, env=env, timeout=120
        )
        if result.returncode != 0:
            logger.error(f"[backup] pg_dump failed: {result.stderr.decode()}")
            return

        compressed = gzip.compress(result.stdout)
        filename = f"ms_backup_{timestamp}.sql.gz"

        # Save locally in BACKUP_DIR
        try:
            from app.config import settings
            backup_path = os.path.join(settings.BACKUP_DIR, filename)
            with open(backup_path, "wb") as f:
                f.write(compressed)
            logger.info(f"[backup] saved locally: {backup_path} ({len(compressed)//1024} KB)")
        except Exception as e:
            logger.warning(f"[backup] local save failed: {e}")

        # Email to admin if SMTP configured
        try:
            from app.services.email_service import get_config, send_email_with_attachment
            cfg = get_config()
            if cfg.smtp_user and cfg.smtp_pass:
                size_kb = len(compressed) // 1024
                html = f"""
                <div style="font-family:sans-serif;direction:rtl;padding:20px">
                  <h2 style="color:#1a2472">🗄️ نسخة احتياطية أسبوعية — MS Accounting</h2>
                  <p>تم إنشاء النسخة الاحتياطية بنجاح.</p>
                  <table style="border-collapse:collapse;width:100%">
                    <tr><td style="padding:8px;font-weight:bold">التاريخ</td><td style="padding:8px">{datetime.now().strftime('%Y-%m-%d %H:%M')}</td></tr>
                    <tr style="background:#f8fafc"><td style="padding:8px;font-weight:bold">الملف</td><td style="padding:8px">{filename}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold">الحجم</td><td style="padding:8px">{size_kb} KB</td></tr>
                  </table>
                  <p style="color:#64748b;font-size:12px;margin-top:20px">الملف المضغوط مرفق بهذا البريد.</p>
                </div>"""
                send_email_with_attachment(
                    to_email=cfg.smtp_user,
                    subject=f"🗄️ نسخة احتياطية أسبوعية — {timestamp}",
                    html_body=html,
                    attachment_bytes=compressed,
                    attachment_name=filename,
                    mime_type="application/gzip"
                )
                logger.info(f"[backup] emailed to {cfg.smtp_user}")
        except Exception as e:
            logger.warning(f"[backup] email failed: {e}")

    except Exception as exc:
        logger.error(f"[backup] job error: {exc}", exc_info=True)


def _monthly_client_report_job():
    """1st of each month at 8am — send obligation+invoice summary to every active client with email."""
    from datetime import date, timedelta
    logger.info("[monthly-report] starting monthly client report job")
    try:
        from app.database import SessionLocal
        from app.models.client import Client, ClientStatus
        from app.models.invoice import Invoice
        from app.models.obligation import TaxObligation, ObligationInstance
        from app.services.email_service import get_config, send_client_reminder

        cfg = get_config()
        if not cfg.enabled:
            logger.info("[monthly-report] email not configured — skipping")
            return

        db = SessionLocal()
        try:
            today = date.today()
            next_60 = today + timedelta(days=60)

            clients = db.query(Client).filter(
                Client.email.isnot(None),
                Client.email != "",
                Client.status == ClientStatus.ACTIVE,
            ).all()

            sent, skipped = 0, 0
            for client in clients:
                # Upcoming obligations in next 60 days
                instances = (
                    db.query(ObligationInstance)
                    .join(TaxObligation)
                    .filter(
                        TaxObligation.client_id == client.id,
                        ObligationInstance.status.in_(["pending", "overdue", "upcoming"]),
                        ObligationInstance.due_date <= next_60,
                    )
                    .order_by(ObligationInstance.due_date)
                    .limit(15)
                    .all()
                )
                obligations = []
                for inst in instances:
                    days_left = (inst.due_date - today).days if inst.due_date else 0
                    obligations.append({
                        "obligation_type": inst.obligation.obligation_type if inst.obligation else "",
                        "due_date": inst.due_date.strftime("%Y/%m/%d") if inst.due_date else "",
                        "days_left": days_left,
                    })

                # Unpaid invoices
                unpaid = (
                    db.query(Invoice)
                    .filter(
                        Invoice.client_id == client.id,
                        Invoice.status.in_(["sent", "partial", "overdue"]),
                    )
                    .order_by(Invoice.issue_date.desc())
                    .limit(10)
                    .all()
                )
                invoices = []
                for inv in unpaid:
                    invoices.append({
                        "invoice_number": inv.invoice_number,
                        "issue_date": inv.issue_date.strftime("%Y/%m/%d") if inv.issue_date else "",
                        "total": inv.total or 0,
                        "remaining": inv.remaining or 0,
                        "status": inv.status.value if hasattr(inv.status, "value") else str(inv.status),
                    })

                if not obligations and not invoices:
                    skipped += 1
                    continue

                try:
                    month_ar = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
                                "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"][today.month - 1]
                    send_client_reminder(
                        to_email=client.email,
                        client_name=client.name,
                        obligations=obligations,
                        invoices=invoices,
                        custom_msg=f"هذا ملخصكم الشهري لشهر {month_ar} {today.year} من مكتب MS للمحاسبة.",
                    )
                    sent += 1
                    logger.info(f"[monthly-report] sent to {client.email} ({client.name})")
                except Exception as e:
                    logger.warning(f"[monthly-report] failed for {client.email}: {e}")
                    skipped += 1

            logger.info(f"[monthly-report] done — sent: {sent}, skipped: {skipped}")
        finally:
            db.close()
    except Exception as exc:
        logger.error(f"[monthly-report] job error: {exc}", exc_info=True)


def _start_scheduler():
    """Start APScheduler background jobs."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger
        from apscheduler.triggers.cron import CronTrigger
        sched = BackgroundScheduler(timezone="Africa/Cairo", daemon=True)
        sched.add_job(_keep_alive_job,          IntervalTrigger(minutes=8),          id="keep_alive",      replace_existing=True)
        sched.add_job(_db_health_job,           IntervalTrigger(minutes=5),          id="db_health",       replace_existing=True)
        sched.add_job(_db_backup_job,           CronTrigger(day_of_week="sun", hour=2, minute=0), id="db_backup",       replace_existing=True)
        sched.add_job(_monthly_client_report_job, CronTrigger(day=1, hour=8, minute=0), id="monthly_report",  replace_existing=True)
        sched.start()
        logger.info("✅ Scheduler started (keep-alive 8min, db-health 5min, backup Sunday 2am, monthly-report 1st-of-month 8am)")
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


def _migrate_leads_columns():
    """Add new Lead columns that may not exist on older databases."""
    from app.database import engine
    from sqlalchemy import text
    new_columns = [
        ("follow_up_date",          "TIMESTAMP"),
        ("has_existing_companies",  "BOOLEAN DEFAULT FALSE"),
        ("proposed_names",          "TEXT"),
        ("quote_legal_entity",      "VARCHAR(200)"),
        ("quote_activity",          "VARCHAR(200)"),
        ("quote_location",          "VARCHAR(200)"),
        ("quote_capital",           "FLOAT"),
        ("quote_total_fees",        "FLOAT"),
        ("quote_government_fees",   "FLOAT"),
        ("quote_expenses_total",    "FLOAT"),
        ("quote_services",          "TEXT"),
        ("quote_required_docs",     "TEXT"),
        ("quote_deliver_docs",      "TEXT"),
        ("quote_notes",             "TEXT"),
    ]
    with engine.connect() as conn:
        for col, col_type in new_columns:
            try:
                conn.execute(text(f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
    print("✅ Leads migration done")


def _init_db_sync():
    """Blocking DB init — runs in thread pool."""
    import time
    for attempt in range(12):
        try:
            create_tables()
            seed_admin()
            _migrate_leads_columns()
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
app.include_router(settlements_router)
app.include_router(appt_router)
app.include_router(papers_router)
app.include_router(payroll_router.router)
app.include_router(assets_router.router)
app.include_router(reports_router.router)
app.include_router(postal_router.router)
app.include_router(statements_router.router)
app.include_router(timesheet_router.router)
app.include_router(permissions_router.router)
app.include_router(company_documents_router.router)
app.include_router(audit_logs_router.router)
app.include_router(folders_router.router)
app.include_router(client_portal_router.router)
app.include_router(office_services_router.router)

if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ── Desktop mode: serve the frontend from the backend ────────────────────────
# When DESKTOP_MODE=1, the backend also serves frontend/index.html at /app
_DESKTOP_MODE = os.environ.get("DESKTOP_MODE") == "1"
_FRONTEND_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "frontend")
)

if _DESKTOP_MODE and os.path.exists(_FRONTEND_DIR):
    from fastapi.responses import FileResponse as _FileResponse
    from fastapi.staticfiles import StaticFiles as _SF

    @app.get("/app", include_in_schema=False)
    async def serve_frontend():
        return _FileResponse(os.path.join(_FRONTEND_DIR, "index.html"))

    # Serve assets (logo, etc.)
    if os.path.exists(os.path.join(_FRONTEND_DIR, "assets")):
        app.mount("/assets", _SF(directory=os.path.join(_FRONTEND_DIR, "assets")), name="frontend_assets")

    logger.info(f"🖥️  Desktop mode: frontend served at http://127.0.0.1/app")


# ── Core endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    if _DESKTOP_MODE:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/app")
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
