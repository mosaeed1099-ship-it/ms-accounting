"""
Backup Router — on-demand PostgreSQL backup download (admin only)
"""
import os
import gzip
import subprocess
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import require_admin
from app.models.user import User

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("/download")
async def download_backup(current_user: User = Depends(require_admin)):
    """
    Run pg_dump on-demand and return compressed SQL file.
    Admin only. Skips on SQLite/desktop.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or "sqlite" in db_url:
        raise HTTPException(400, detail="النسخ الاحتياطي متاح فقط في بيئة الإنتاج (PostgreSQL).")

    try:
        from urllib.parse import urlparse
        p = urlparse(db_url)
        env = os.environ.copy()
        env["PGPASSWORD"] = p.password or ""
        result = subprocess.run(
            ["pg_dump", "-h", p.hostname, "-p", str(p.port or 5432),
             "-U", p.username, "-d", p.path.lstrip("/"),
             "--no-owner", "--no-acl", "-F", "p"],
            capture_output=True, env=env, timeout=120
        )
        if result.returncode != 0:
            raise HTTPException(500, detail=f"pg_dump فشل: {result.stderr.decode()[:200]}")

        compressed = gzip.compress(result.stdout)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        filename = f"ms_backup_{timestamp}.sql.gz"

        return StreamingResponse(
            iter([compressed]),
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, detail=f"خطأ أثناء إنشاء النسخة الاحتياطية: {str(exc)}")


@router.get("/list")
async def list_backups(current_user: User = Depends(require_admin)):
    """List locally saved backup files."""
    from app.config import settings
    backup_dir = settings.BACKUP_DIR
    if not os.path.exists(backup_dir):
        return {"backups": []}

    files = []
    for f in sorted(os.listdir(backup_dir), reverse=True):
        if f.endswith(".sql.gz"):
            path = os.path.join(backup_dir, f)
            stat = os.stat(path)
            files.append({
                "filename": f,
                "size_kb": stat.st_size // 1024,
                "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
            })
    return {"backups": files[:20]}


@router.post("/trigger")
async def trigger_backup(current_user: User = Depends(require_admin)):
    """Manually trigger the weekly backup job (saves locally + emails admin)."""
    import asyncio
    loop = asyncio.get_event_loop()
    # Import from main to reuse the job function
    try:
        from main import _db_backup_job
        await loop.run_in_executor(None, _db_backup_job)
        return {"success": True, "message": "تم تشغيل النسخة الاحتياطية — ستصل على بريدك الإلكتروني خلال دقيقة"}
    except Exception as exc:
        raise HTTPException(500, detail=f"فشل: {str(exc)}")
