import sys, os
# ── Early startup signal (appears even if later imports crash) ───────────────
print("🚀 MS Accounting backend starting... v2.2.0 (security hardening)", file=sys.stderr, flush=True)
import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.core.security_middleware import RateLimitMiddleware, log_audit_event
from app.core.security import decode_token
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
from app.routers import office_finance as office_finance_router
from app.routers import tax_center as tax_center_router
from app.routers import formation as formation_router
from app.routers.service_templates import router as service_templates_router
from app.routers.formation_obligations import router as formation_obligations_router
from app.routers.realtime import router as realtime_router, manager as realtime_manager, ENTITY_MAP, SKIP_ENTITIES, DASHBOARD_ENTITIES
from app.routers import portal_credentials as portal_credentials_router
from app.routers.finance_center import router as finance_center_router
from app.routers.monthly_fees import router as monthly_fees_router
from app.routers.backup import router as backup_router
from app.routers.admin_metrics import router as admin_metrics_router
from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.user import User, UserRole
# Import new models so create_all registers their tables
import app.models.permission          # noqa: F401
import app.models.wa_log              # noqa: F401
import app.models.company_document    # noqa: F401
import app.models.audit_log           # noqa: F401
import app.models.folder              # noqa: F401
import app.models.backup              # noqa: F401  — registers backup_records table
import app.models.client_portal       # noqa: F401
import app.models.client_required_doc # noqa: F401
import app.models.office_finance      # noqa: F401
import app.models.finance_center      # noqa: F401
import app.models.office_service      # noqa: F401
import app.models.tax_center          # noqa: F401
import app.models.establishment       # noqa: F401
import app.models.service_template    # noqa: F401
import app.models.portal_credentials  # noqa: F401
import app.models.monthly_fees        # noqa: F401

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


def _run_scheduled_backup(backup_type: str):
    """Unified scheduled backup runner — used by daily/weekly/monthly jobs."""
    from app.database import SessionLocal
    from app.routers.backup import run_backup

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or "sqlite" in db_url:
        logger.info(f"[backup] SQLite/desktop mode — skipping {backup_type} backup")
        return

    db = SessionLocal()
    try:
        record = run_backup(
            backup_type=backup_type,
            db=db,
            triggered_by=None,
            notes=f"تلقائي — {backup_type}",
            include_uploads=True,
            send_email=True,
        )
        if record.status == "completed":
            logger.info(f"[backup] {backup_type} completed — {record.total_size_kb:.0f} KB — id={record.id}")
        else:
            logger.error(f"[backup] {backup_type} FAILED — {record.error_message}")
    except Exception as exc:
        logger.error(f"[backup] {backup_type} job error: {exc}", exc_info=True)
    finally:
        db.close()


def _db_backup_job():
    """Weekly backup (kept for backward compat — now delegates to unified runner)."""
    _run_scheduled_backup("weekly")


def _daily_backup_job():
    """Daily backup at midnight."""
    _run_scheduled_backup("daily")


def _monthly_backup_job():
    """Monthly backup on 1st of each month at 1am."""
    _run_scheduled_backup("monthly")


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
        # Backup schedule: daily midnight, weekly Sunday 2am, monthly 1st-of-month 1am
        sched.add_job(_daily_backup_job,          CronTrigger(hour=0,  minute=0),                            id="backup_daily",    replace_existing=True)
        sched.add_job(_db_backup_job,             CronTrigger(day_of_week="sun", hour=2, minute=0),          id="backup_weekly",   replace_existing=True)
        sched.add_job(_monthly_backup_job,        CronTrigger(day=1,   hour=1, minute=0),                    id="backup_monthly",  replace_existing=True)
        sched.add_job(_monthly_client_report_job, CronTrigger(day=1,   hour=8, minute=0),                    id="monthly_report",  replace_existing=True)
        sched.add_job(_process_eta_retry_queue,   IntervalTrigger(minutes=5),                                id="eta_retry",       replace_existing=True)
        sched.add_job(_daily_deadline_alerts,     CronTrigger(hour=8, minute=0),                             id="deadline_alerts", replace_existing=True)
        sched.start()
        logger.info("✅ Scheduler started (keep-alive 8min, db-health 5min, backup daily/weekly/monthly, monthly-report, eta-retry 5min, deadline-alerts 8am)")
        return sched
    except Exception as exc:
        logger.warning(f"⚠️  Scheduler not started: {exc}")
        return None


# ── DB init ──────────────────────────────────────────────────────────────────

def seed_admin():
    import os
    admin_email    = os.environ.get("ADMIN_EMAIL", "admin@ms-accounting.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    db = SessionLocal()
    try:
        # Migrate old default admin to new env-configured credentials
        old = db.query(User).filter(User.email == "admin@ms-accounting.com").first()
        if old and admin_email != "admin@ms-accounting.com":
            old.email           = admin_email
            old.hashed_password = get_password_hash(admin_password)
            old.name            = "مدير النظام"
            old.role            = UserRole.ADMIN
            old.is_active       = True
            db.commit()
            print(f"✅ Admin migrated → {admin_email}")
            return
        existing = db.query(User).filter(User.email == admin_email).first()
        if existing:
            # Always sync password from env on startup
            existing.hashed_password = get_password_hash(admin_password)
            db.commit()
            return
        admin = User(
            name="مدير النظام",
            email=admin_email,
            hashed_password=get_password_hash(admin_password),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print(f"✅ Admin user created: {admin_email}")
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


def _seed_wht_types():
    """Seed withholding type lookup table (idempotent)."""
    try:
        from app.models.tax_center import WithholdingType, WHT_TYPE_SEEDS
        db = SessionLocal()
        try:
            existing = db.query(WithholdingType).count()
            if existing == 0:
                for seed in WHT_TYPE_SEEDS:
                    db.add(WithholdingType(
                        code=seed[0], name_ar=seed[1], category=seed[2],
                        rate_company=seed[3], rate_individual=seed[4],
                        rate_foreign=seed[5], legal_ref=seed[6], is_active=True,
                    ))
                db.commit()
                print(f"✅ Seeded {len(WHT_TYPE_SEEDS)} withholding types")
        finally:
            db.close()
    except Exception as exc:
        print(f"⚠️  WHT seed failed: {exc}")


def _process_eta_retry_queue():
    """Process pending ETA retry submissions."""
    try:
        from app.models.tax_center import ETASubmission
        from datetime import datetime
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            pending = db.query(ETASubmission).filter(
                ETASubmission.status == "retry_pending",
                ETASubmission.next_retry_at <= now,
            ).limit(20).all()
            if not pending:
                return
            logger.info(f"[eta-retry] processing {len(pending)} pending submissions")
            for sub in pending:
                try:
                    from app.services.eta_service import ETAService
                    svc = ETAService(db, sub.client_id)
                    # Re-submit using stored payload
                    import json
                    docs = json.loads(sub.payload_json) if sub.payload_json else []
                    result = svc.submit_documents(docs)
                    sub.status = "submitted"
                    sub.last_response = json.dumps(result)
                    sub.submitted_at = now
                except Exception as e:
                    sub.attempt_number = (sub.attempt_number or 0) + 1
                    delays = [60, 300, 900, 3600, 14400]
                    idx = min(sub.attempt_number - 1, len(delays) - 1)
                    from datetime import timedelta
                    sub.next_retry_at = now + timedelta(seconds=delays[idx])
                    if sub.attempt_number >= 5:
                        sub.status = "failed"
                    logger.warning(f"[eta-retry] sub {sub.id} attempt {sub.attempt_number} failed: {e}")
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.warning(f"[eta-retry] job error: {exc}")


def _daily_deadline_alerts():
    """8am Cairo — alert on tax deadlines within 7 days."""
    try:
        from datetime import date, timedelta
        from app.models.tax_center import TaxCalendarEvent
        db = SessionLocal()
        try:
            today = date.today()
            cutoff = today + timedelta(days=7)
            events = db.query(TaxCalendarEvent).filter(
                TaxCalendarEvent.due_date >= today,
                TaxCalendarEvent.due_date <= cutoff,
                TaxCalendarEvent.status.in_(["pending", "upcoming"]),
            ).all()
            if events:
                logger.info(f"[deadline-alert] {len(events)} events due within 7 days")
        finally:
            db.close()
    except Exception as exc:
        logger.warning(f"[deadline-alert] job error: {exc}")


def _migrate_formation_tables():
    """Create formation tables columns if they don't exist (idempotent)."""
    from app.database import engine
    from sqlalchemy import text
    stmts = [
        "CREATE TABLE IF NOT EXISTS company_formation_cases (id SERIAL PRIMARY KEY)",
        "CREATE TABLE IF NOT EXISTS formation_events (id SERIAL PRIMARY KEY)",
    ]
    # Just let create_tables handle it via SQLAlchemy metadata — this is a no-op guard
    print("✅ Formation tables checked")


def _migrate_tasks_columns():
    """Add new Task columns and enum values that may not exist on older databases."""
    from app.database import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        # Add department column
        try:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS department VARCHAR(200)"))
            conn.commit()
        except Exception:
            try: conn.rollback()
            except Exception: pass

        # Add waiting_docs to taskstatus enum (PostgreSQL only)
        try:
            conn.execute(text("ALTER TYPE taskstatus ADD VALUE IF NOT EXISTS 'waiting_docs'"))
            conn.commit()
        except Exception:
            try: conn.rollback()
            except Exception: pass
    print("✅ Tasks migration done")


def _migrate_users_columns():
    """Add whatsapp_phone column to users table."""
    from app.database import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20)"))
            conn.commit()
        except Exception:
            try: conn.rollback()
            except Exception: pass
    print("✅ Users migration done")


def _init_db_sync():
    """Blocking DB init — runs in thread pool."""
    import time
    for attempt in range(12):
        try:
            create_tables()
            seed_admin()
            _migrate_leads_columns()
            _migrate_formation_tables()
            _migrate_tasks_columns()
            _migrate_users_columns()
            _seed_wht_types()
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

    # Run critical column migrations SYNCHRONOUSLY first (prevents ProgrammingError on cold start)
    try:
        _migrate_users_columns()
        _migrate_tasks_columns()
    except Exception as _e:
        print(f"⚠️  Early migration warning (will retry in background): {_e}")

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

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(RateLimitMiddleware)

# ── CORS — restricted to actual domains ──────────────────────────────────────
_ALLOWED_ORIGINS = [
    # GitHub Pages (production frontend)
    "https://mosaeed1099-ship-it.github.io",
    # Desktop app (Electron) — uses localhost
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    # Allow Railway preview URLs (dynamic subdomain)
    "https://ms-accounting-api-production.up.railway.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["X-Total-Count", "Retry-After"],
)


# ── Cache-Control: no-store on all API responses ─────────────────────────────
@app.middleware("http")
async def no_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response


# ── Real-time broadcast middleware ────────────────────────────────────────────
@app.middleware("http")
async def realtime_broadcast_middleware(request: Request, call_next):
    """After any successful mutation, broadcast a live-sync event to all WS clients."""
    response = await call_next(request)
    try:
        if (
            request.method in ("POST", "PUT", "PATCH", "DELETE")
            and 200 <= response.status_code < 300
            and realtime_manager.connection_count > 0
        ):
            parts = [p for p in request.url.path.split("/") if p]
            if len(parts) >= 2 and parts[0] == "api":
                raw_entity = parts[1]
                if raw_entity not in SKIP_ENTITIES:
                    entity = ENTITY_MAP.get(raw_entity, raw_entity)
                    entity_id = parts[2] if len(parts) > 2 and parts[2].lstrip("-").isdigit() else None
                    asyncio.create_task(realtime_manager.broadcast({
                        "entity":           entity,
                        "raw_entity":       raw_entity,
                        "action":           request.method.lower(),
                        "id":               entity_id,
                        "affects_dashboard": raw_entity in DASHBOARD_ENTITIES,
                    }))
    except Exception:
        pass  # Never let broadcast logic affect the HTTP response
    return response


# ── Central Audit Trail middleware ────────────────────────────────────────────
@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    """Log every mutating API call with user identity, IP, and status code."""
    response = await call_next(request)
    try:
        # Extract user_id from JWT (best-effort — never blocks the response)
        user_id = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            payload = decode_token(auth_header[7:])
            if payload:
                user_id = payload.get("sub")

        asyncio.create_task(
            log_audit_event(request, response.status_code, user_id=user_id)
        )
    except Exception:
        pass
    return response


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
from app.routers.wa import router as wa_router; app.include_router(wa_router)
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
app.include_router(office_finance_router.router)
app.include_router(tax_center_router.router)
app.include_router(formation_router.router)
app.include_router(service_templates_router, prefix="/api/service-templates", tags=["service_templates"])
app.include_router(formation_obligations_router, prefix="/api/formation-obligations", tags=["formation_obligations"])
app.include_router(portal_credentials_router.router)
app.include_router(realtime_router)

app.include_router(finance_center_router)
app.include_router(monthly_fees_router)
app.include_router(backup_router)
app.include_router(admin_metrics_router)

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
