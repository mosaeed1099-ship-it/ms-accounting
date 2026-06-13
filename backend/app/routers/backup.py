"""
Backup System — Professional versioned backups for MS Accounting.

Architecture (Railway-aware):
  - DB backup:      pg_dump → gzip → email to admin + streamed to caller
  - Uploads backup: zip of uploads/ dir → included in full backup
  - Metadata:       stored in PostgreSQL (persistent across deploys)
  - Local files:    Railway filesystem is ephemeral — never rely on local storage

Retention policy (enforced by _prune_old_records):
  - Daily backups:     keep last 7
  - Weekly backups:    keep last 4
  - Monthly backups:   keep last 12
  - Manual/pre-deploy: keep last 20
"""
import os
import gzip
import json
import zipfile
import subprocess
import tempfile
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text as _text

from app.database import get_db, engine
from app.core.deps import require_admin
from app.models.user import User
from app.models.backup import BackupRecord

router = APIRouter(prefix="/api/backup", tags=["backup"])

# ── Retention limits ──────────────────────────────────────────────────────────
RETENTION = {
    "daily":      7,
    "weekly":     4,
    "monthly":    12,
    "manual":     20,
    "pre-deploy": 20,
}

# ── DB stats helper ───────────────────────────────────────────────────────────

def _collect_db_stats(db: Session) -> dict:
    """Count rows in key tables for backup metadata."""
    tables = [
        "clients", "tasks", "invoices", "leads", "documents",
        "tax_returns", "obligations", "obligation_instances",
        "finance_collections", "finance_manual_expenses",
        "hr_employees", "payroll_runs", "employee_settlements",
        "users", "quotations", "company_establishments",
    ]
    stats = {}
    for tbl in tables:
        try:
            row = db.execute(_text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
            stats[tbl] = int(row or 0)
        except Exception:
            pass
    return stats


# ── pg_dump helper ────────────────────────────────────────────────────────────

def _pg_dump_bytes() -> bytes:
    """Run pg_dump and return raw SQL as bytes. Raises on failure."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or "sqlite" in db_url:
        raise ValueError("pg_dump متاح فقط على PostgreSQL (إنتاج)")

    p = urlparse(db_url)
    env = os.environ.copy()
    env["PGPASSWORD"] = p.password or ""
    result = subprocess.run(
        [
            "pg_dump",
            "-h", p.hostname,
            "-p", str(p.port or 5432),
            "-U", p.username or "postgres",
            "-d", p.path.lstrip("/"),
            "--no-owner", "--no-acl",
            "--if-exists", "--clean",
            "-F", "p",   # plain SQL
        ],
        capture_output=True,
        env=env,
        timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace")[:400])
    return result.stdout


def _uploads_zip_bytes(upload_dir: str) -> bytes:
    """Zip the uploads directory and return bytes. Returns empty zip if dir missing."""
    buf = tempfile.SpooledTemporaryFile(max_size=50 * 1024 * 1024)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if os.path.isdir(upload_dir):
            for root, _, files in os.walk(upload_dir):
                for fname in files:
                    full = os.path.join(root, fname)
                    arc  = os.path.relpath(full, upload_dir)
                    try:
                        zf.write(full, arc)
                    except Exception:
                        pass
    buf.seek(0)
    return buf.read()


# ── Core backup function (called by both scheduler and API) ───────────────────

def run_backup(
    backup_type: str,
    db: Session,
    triggered_by: Optional[int] = None,
    notes: str = "",
    include_uploads: bool = True,
    send_email: bool = True,
) -> BackupRecord:
    """
    Execute a full backup and record metadata in DB.
    Returns the BackupRecord (status = completed | failed).
    """
    from app.config import settings

    record = BackupRecord(
        backup_type=backup_type,
        label=f"نسخة {_type_label(backup_type)} — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        includes_db=True,
        includes_uploads=include_uploads,
        status="pending",
        triggered_by=triggered_by,
        notes=notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    try:
        # 1. DB stats
        stats = _collect_db_stats(db)
        record.db_stats = json.dumps(stats, ensure_ascii=False)

        # 2. pg_dump
        sql_bytes = _pg_dump_bytes()
        gz_bytes  = gzip.compress(sql_bytes, compresslevel=6)
        record.db_size_kb = len(gz_bytes) // 1024

        # 3. Uploads zip (optional)
        uploads_gz = b""
        if include_uploads:
            raw_zip = _uploads_zip_bytes(settings.UPLOAD_DIR)
            uploads_gz = gzip.compress(raw_zip, compresslevel=6)
            record.uploads_size_kb = len(uploads_gz) // 1024

        record.total_size_kb = record.db_size_kb + record.uploads_size_kb

        # 4. Email (if configured)
        if send_email:
            _email_backup(backup_type, gz_bytes, uploads_gz, stats, record, settings)

        record.status       = "completed"
        record.completed_at = datetime.utcnow()
        db.commit()

        # 5. Prune old records of this type
        _prune_old_records(backup_type, db)

        return record

    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(f"[backup] {backup_type} failed: {exc}", exc_info=True)
        record.status        = "failed"
        record.error_message = str(exc)[:500]
        record.completed_at  = datetime.utcnow()
        db.commit()
        return record


def _type_label(t: str) -> str:
    return {"daily":"يومية","weekly":"أسبوعية","monthly":"شهرية",
            "manual":"يدوية","pre-deploy":"قبل النشر"}.get(t, t)


def _email_backup(backup_type, gz_bytes, uploads_gz, stats, record, settings):
    """Email the backup files to admin. Silently skips if email not configured."""
    try:
        import resend
        resend.api_key = os.environ.get("RESEND_API_KEY", "")
        if not resend.api_key:
            return

        ts       = datetime.now().strftime("%Y%m%d_%H%M")
        db_name  = f"ms_backup_db_{backup_type}_{ts}.sql.gz"
        attachments = [{"filename": db_name, "content": list(gz_bytes)}]
        if uploads_gz:
            attachments.append({
                "filename": f"ms_backup_uploads_{backup_type}_{ts}.zip.gz",
                "content":  list(uploads_gz),
            })

        total_clients = stats.get("clients", 0)
        total_tasks   = stats.get("tasks", 0)
        body = (
            f"<h2>نسخة احتياطية تلقائية — {_type_label(backup_type)}</h2>"
            f"<p>التاريخ: {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>"
            f"<ul>"
            f"<li>العملاء: {total_clients}</li>"
            f"<li>المهام: {total_tasks}</li>"
            f"<li>حجم قاعدة البيانات: {record.db_size_kb:,} KB</li>"
            f"<li>حجم الملفات: {record.uploads_size_kb:,} KB</li>"
            f"</ul>"
            f"<p>⚠️ احفظ هذا الإيميل — قد تحتاجه لاسترجاع البيانات.</p>"
        )

        admin_email = os.environ.get("ADMIN_EMAIL", "ms.owner@mshq.io")
        resend.Emails.send({
            "from":    "MS Accounting Backup <backup@mshq.io>",
            "to":      [admin_email],
            "subject": f"🔒 نسخة احتياطية {_type_label(backup_type)} — {datetime.now().strftime('%Y-%m-%d')}",
            "html":    body,
            "attachments": attachments,
        })
        record.emailed_to = admin_email
        record.emailed_at = datetime.utcnow()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[backup] email failed: {e}")


def _prune_old_records(backup_type: str, db: Session):
    """Keep only the N most recent records per type (metadata only — no files to delete)."""
    limit = RETENTION.get(backup_type, 20)
    try:
        ids = db.execute(
            _text("SELECT id FROM backup_records WHERE backup_type=:t AND status='completed' ORDER BY created_at DESC"),
            {"t": backup_type}
        ).fetchall()
        to_delete = [row[0] for row in ids[limit:]]
        if to_delete:
            db.execute(
                _text("DELETE FROM backup_records WHERE id = ANY(:ids)"),
                {"ids": to_delete}
            )
            db.commit()
    except Exception:
        pass


# ── API Endpoints ─────────────────────────────────────────────────────────────

@router.get("/list")
def list_backups(
    backup_type: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List all backup records, newest first."""
    q = db.query(BackupRecord)
    if backup_type:
        q = q.filter(BackupRecord.backup_type == backup_type)
    records = q.order_by(BackupRecord.created_at.desc()).limit(limit).all()

    return {
        "backups": [
            {
                "id":              r.id,
                "backup_type":     r.backup_type,
                "type_label":      _type_label(r.backup_type),
                "label":           r.label or "",
                "status":          r.status,
                "includes_db":     r.includes_db,
                "includes_uploads":r.includes_uploads,
                "db_size_kb":      r.db_size_kb or 0,
                "uploads_size_kb": r.uploads_size_kb or 0,
                "total_size_kb":   r.total_size_kb or 0,
                "db_stats":        json.loads(r.db_stats or "{}"),
                "emailed_to":      r.emailed_to or "",
                "emailed_at":      str(r.emailed_at) if r.emailed_at else None,
                "triggered_by":    r.triggered_by,
                "notes":           r.notes or "",
                "error_message":   r.error_message or "",
                "created_at":      str(r.created_at),
                "completed_at":    str(r.completed_at) if r.completed_at else None,
            }
            for r in records
        ],
        "total": len(records),
        "retention": RETENTION,
    }


@router.get("/stats")
def backup_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Summary stats for the backup dashboard."""
    from sqlalchemy import func

    by_type = {}
    for bt in ["daily", "weekly", "monthly", "manual", "pre-deploy"]:
        last = (
            db.query(BackupRecord)
            .filter(BackupRecord.backup_type == bt, BackupRecord.status == "completed")
            .order_by(BackupRecord.created_at.desc())
            .first()
        )
        by_type[bt] = {
            "label":      _type_label(bt),
            "last_run":   str(last.created_at) if last else None,
            "last_status": last.status if last else "never",
            "count":      db.query(BackupRecord).filter(
                BackupRecord.backup_type == bt, BackupRecord.status == "completed"
            ).count(),
        }

    last_any = (
        db.query(BackupRecord)
        .filter(BackupRecord.status == "completed")
        .order_by(BackupRecord.created_at.desc())
        .first()
    )
    last_fail = (
        db.query(BackupRecord)
        .filter(BackupRecord.status == "failed")
        .order_by(BackupRecord.created_at.desc())
        .first()
    )

    return {
        "by_type":        by_type,
        "last_backup_at": str(last_any.created_at) if last_any else None,
        "last_failure":   str(last_fail.created_at) if last_fail else None,
        "total_completed": db.query(BackupRecord).filter(BackupRecord.status == "completed").count(),
        "total_failed":    db.query(BackupRecord).filter(BackupRecord.status == "failed").count(),
    }


@router.post("/create")
def create_manual_backup(
    include_uploads: bool = True,
    send_email: bool = True,
    notes: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Trigger an immediate manual backup (DB + optionally uploads)."""
    record = run_backup(
        backup_type="manual",
        db=db,
        triggered_by=current_user.id,
        notes=notes or f"يدوي من {current_user.name}",
        include_uploads=include_uploads,
        send_email=send_email,
    )
    return {
        "success":  record.status == "completed",
        "status":   record.status,
        "id":       record.id,
        "label":    record.label,
        "total_size_kb": record.total_size_kb,
        "emailed_to":    record.emailed_to,
        "error":    record.error_message or None,
        "message":  "تم إنشاء النسخة الاحتياطية ✓" if record.status == "completed" else f"فشل: {record.error_message}",
    }


@router.get("/download")
def download_backup_now(
    include_uploads: bool = False,
    current_user: User = Depends(require_admin),
):
    """
    Stream an on-demand DB backup directly to the browser.
    Generates fresh pg_dump each time (not stored locally).
    """
    try:
        sql_bytes = _pg_dump_bytes()
        gz_bytes  = gzip.compress(sql_bytes, compresslevel=6)
        ts        = datetime.now().strftime("%Y%m%d_%H%M")
        filename  = f"ms_backup_{ts}.sql.gz"

        return StreamingResponse(
            iter([gz_bytes]),
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(500, detail=f"فشل إنشاء النسخة: {str(exc)[:200]}")


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Restore database from an uploaded .sql or .sql.gz backup file.
    ⚠️ DESTRUCTIVE — drops and recreates all tables.
    Always create a backup before restoring.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or "sqlite" in db_url:
        raise HTTPException(400, "الاستعادة متاحة فقط على PostgreSQL")

    if not (file.filename.endswith(".sql") or file.filename.endswith(".sql.gz")):
        raise HTTPException(400, "يجب رفع ملف .sql أو .sql.gz")

    content = await file.read()
    if file.filename.endswith(".gz"):
        try:
            content = gzip.decompress(content)
        except Exception:
            raise HTTPException(400, "الملف تالف أو ليس gzip صحيح")

    p   = urlparse(db_url)
    env = os.environ.copy()
    env["PGPASSWORD"] = p.password or ""

    # Log this restore action before executing
    record = BackupRecord(
        backup_type="restore",
        label=f"استعادة من {file.filename} بواسطة {current_user.name}",
        status="pending",
        triggered_by=current_user.id,
        notes=f"Restore from uploaded file: {file.filename}",
    )
    db.add(record)
    db.commit()

    with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["psql",
             "-h", p.hostname,
             "-p", str(p.port or 5432),
             "-U", p.username or "postgres",
             "-d", p.path.lstrip("/"),
             "-f", tmp_path,
             "--no-password",
             "-v", "ON_ERROR_STOP=0"],
            capture_output=True,
            env=env,
            timeout=300,
        )
        if result.returncode != 0:
            record.status = "failed"
            record.error_message = result.stderr.decode()[:500]
            db.commit()
            raise HTTPException(500, f"psql فشل: {result.stderr.decode()[:300]}")

        record.status       = "completed"
        record.completed_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "تمت الاستعادة بنجاح — أعد تشغيل الخادم لتطبيق التغييرات"}

    finally:
        os.unlink(tmp_path)


@router.delete("/{backup_id}")
def delete_backup_record(
    backup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a backup metadata record (does NOT delete any physical file)."""
    record = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
    if not record:
        raise HTTPException(404, "السجل غير موجود")
    db.delete(record)
    db.commit()
    return {"ok": True}
