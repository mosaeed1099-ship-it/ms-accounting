"""
سجل المراجعة — Audit Trail
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.audit_log import AuditLog
from app.core.deps import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/audit-logs", tags=["audit_logs"])


# ─── Schema ───────────────────────────────────────────────────────────────────

class AuditCreate(BaseModel):
    action: str          # create|update|delete|view|export|approve
    module: str
    record_id: Optional[int] = None
    record_name: Optional[str] = None
    old_data: Optional[dict] = None
    new_data: Optional[dict] = None
    notes: Optional[str] = None


# ─── Helper ───────────────────────────────────────────────────────────────────

def log_to_dict(l: AuditLog) -> dict:
    return {
        "id": l.id,
        "user_id": l.user_id,
        "user_name": l.user.name if l.user else "النظام",
        "action": l.action,
        "module": l.module,
        "record_id": l.record_id,
        "record_name": l.record_name,
        "old_data": l.old_data,
        "new_data": l.new_data,
        "ip_address": l.ip_address,
        "notes": l.notes,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    }


# ─── Shared utility (call from other routers) ─────────────────────────────────

def write_log(
    db: Session,
    *,
    user_id: Optional[int],
    action: str,
    module: str,
    record_id: Optional[int] = None,
    record_name: Optional[str] = None,
    old_data: Optional[dict] = None,
    new_data: Optional[dict] = None,
    ip_address: Optional[str] = None,
    notes: Optional[str] = None,
):
    entry = AuditLog(
        user_id     = user_id,
        action      = action,
        module      = module,
        record_id   = record_id,
        record_name = record_name,
        old_data    = old_data,
        new_data    = new_data,
        ip_address  = ip_address,
        notes       = notes,
    )
    db.add(entry)
    # do NOT commit here — caller handles transaction


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("")
def list_logs(
    module: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    record_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        # Accountants see only their own logs
        user_id = current_user.id

    q = db.query(AuditLog)
    if module:    q = q.filter(AuditLog.module == module)
    if action:    q = q.filter(AuditLog.action == action)
    if user_id:   q = q.filter(AuditLog.user_id == user_id)
    if record_id: q = q.filter(AuditLog.record_id == record_id)

    total = q.count()
    logs = q.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "items": [log_to_dict(l) for l in logs]}


@router.post("")
def create_log(
    data: AuditCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manual audit log entry (frontend can call this for view events)."""
    write_log(
        db,
        user_id     = current_user.id,
        action      = data.action,
        module      = data.module,
        record_id   = data.record_id,
        record_name = data.record_name,
        old_data    = data.old_data,
        new_data    = data.new_data,
        notes       = data.notes,
    )
    db.commit()
    return {"ok": True}


@router.get("/record/{module}/{record_id}")
def get_record_history(
    module: str,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = db.query(AuditLog).filter(
        AuditLog.module == module,
        AuditLog.record_id == record_id,
    ).order_by(AuditLog.created_at.desc()).limit(100).all()
    return [log_to_dict(l) for l in logs]
