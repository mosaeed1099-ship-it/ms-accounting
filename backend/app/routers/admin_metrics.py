from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from datetime import datetime
import os

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/admin/metrics", tags=["admin-metrics"])


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


@router.get("/baseline")
def get_baseline_metrics(
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    from app.models.client import Client, ClientType, ClientStatus
    from app.models.lead import Lead
    from app.models.user import User as UserModel
    from app.models.task import Task
    from app.models.obligation import TaxObligation, ObligationInstance
    from app.models.document import Document
    from app.models.establishment import CompanyEstablishment

    def _count(model, *filters):
        q = db.query(func.count(model.id))
        for f in filters:
            q = q.filter(f)
        return q.scalar() or 0

    # Clients
    total_clients = _count(Client)
    individual_clients = _count(Client, Client.client_type == ClientType.INDIVIDUAL)
    company_clients = _count(Client, Client.client_type == ClientType.COMPANY)
    active_clients = _count(Client, Client.status == ClientStatus.ACTIVE)

    # Leads
    total_leads = _count(Lead)

    # Employees
    total_employees = _count(UserModel)

    # Tasks
    total_tasks = _count(Task)

    # Obligations
    total_obligations = _count(TaxObligation)
    obligation_instances = _count(ObligationInstance)

    # Documents
    total_documents = _count(Document)

    # Establishments
    total_establishments = _count(CompanyEstablishment)

    # Uploaded files (count files on disk)
    upload_dir = "uploads"
    total_files = 0
    total_size_bytes = 0
    if os.path.exists(upload_dir):
        for root, dirs, files in os.walk(upload_dir):
            for f in files:
                total_files += 1
                try:
                    total_size_bytes += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass

    # DB size
    try:
        result = db.execute(text("SELECT pg_database_size(current_database())")).scalar()
        db_size_bytes = int(result or 0)
    except Exception:
        db_size_bytes = 0

    def _fmt_size(b):
        if b < 1024:
            return f"{b} B"
        if b < 1024 ** 2:
            return f"{b/1024:.1f} KB"
        if b < 1024 ** 3:
            return f"{b/1024**2:.1f} MB"
        return f"{b/1024**3:.2f} GB"

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "snapshot_label": "PRE_REACT_MIGRATION",
        "clients": {
            "total": total_clients,
            "individuals": individual_clients,
            "companies": company_clients,
            "active": active_clients,
            "inactive": total_clients - active_clients,
        },
        "leads": {"total": total_leads},
        "employees": {"total": total_employees},
        "tasks": {"total": total_tasks},
        "obligations": {
            "templates": total_obligations,
            "instances": obligation_instances,
        },
        "documents": {"total": total_documents},
        "establishments": {"total": total_establishments},
        "files": {
            "count": total_files,
            "size_bytes": total_size_bytes,
            "size_human": _fmt_size(total_size_bytes),
        },
        "database": {
            "size_bytes": db_size_bytes,
            "size_human": _fmt_size(db_size_bytes),
        },
    }
