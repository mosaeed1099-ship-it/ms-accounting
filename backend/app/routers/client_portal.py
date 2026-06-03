"""
بوابة العميل — تسجيل دخول العملاء لرؤية بياناتهم
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.client_portal import ClientPortalUser
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.task import Task
from app.core.security import verify_password, get_password_hash, create_access_token, decode_token
from app.core.deps import get_current_user, require_admin
from app.models.user import User

router = APIRouter(prefix="/api/portal", tags=["client_portal"])

portal_oauth = OAuth2PasswordBearer(tokenUrl="/api/portal/login", auto_error=False)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PortalUserCreate(BaseModel):
    client_id: int
    username: str
    password: str
    can_see_files: bool = True
    can_see_invoices: bool = True
    can_see_obligations: bool = True
    can_see_reports: bool = True
    can_see_tasks: bool = False


class PortalUserUpdate(BaseModel):
    password: Optional[str] = None
    is_active: Optional[bool] = None
    can_see_files: Optional[bool] = None
    can_see_invoices: Optional[bool] = None
    can_see_obligations: Optional[bool] = None
    can_see_reports: Optional[bool] = None
    can_see_tasks: Optional[bool] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def portal_user_to_dict(pu: ClientPortalUser) -> dict:
    return {
        "id": pu.id,
        "client_id": pu.client_id,
        "client_name": pu.client.name if pu.client else None,
        "username": pu.username,
        "is_active": pu.is_active,
        "can_see_files": pu.can_see_files,
        "can_see_invoices": pu.can_see_invoices,
        "can_see_obligations": pu.can_see_obligations,
        "can_see_reports": pu.can_see_reports,
        "can_see_tasks": pu.can_see_tasks,
        "last_login": pu.last_login.isoformat() if pu.last_login else None,
        "created_at": pu.created_at.isoformat() if pu.created_at else None,
    }


def get_portal_user(token: str = Depends(portal_oauth), db: Session = Depends(get_db)) -> ClientPortalUser:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "يجب تسجيل الدخول")
    payload = decode_token(token)
    if not payload or payload.get("type") != "portal":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "رمز الدخول غير صحيح")
    pu_id = payload.get("sub")
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.id == int(pu_id)).first()
    if not pu or not pu.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "الحساب غير نشط")
    return pu


# ─── Admin endpoints ──────────────────────────────────────────────────────────

@router.get("/users")
def list_portal_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = db.query(ClientPortalUser).all()
    return [portal_user_to_dict(u) for u in users]


@router.post("/users")
def create_portal_user(
    data: PortalUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")

    # Check if portal user already exists for this client
    existing = db.query(ClientPortalUser).filter(ClientPortalUser.client_id == data.client_id).first()
    if existing:
        raise HTTPException(400, "يوجد حساب بوابة مرتبط بهذا العميل بالفعل")

    # Check username uniqueness
    if db.query(ClientPortalUser).filter(ClientPortalUser.username == data.username).first():
        raise HTTPException(400, "اسم المستخدم مستخدم بالفعل")

    pu = ClientPortalUser(
        client_id           = data.client_id,
        username            = data.username,
        hashed_password     = get_password_hash(data.password),
        can_see_files       = data.can_see_files,
        can_see_invoices    = data.can_see_invoices,
        can_see_obligations = data.can_see_obligations,
        can_see_reports     = data.can_see_reports,
        can_see_tasks       = data.can_see_tasks,
    )
    db.add(pu)
    db.commit()
    db.refresh(pu)
    return portal_user_to_dict(pu)


@router.put("/users/{user_id}")
def update_portal_user(
    user_id: int,
    data: PortalUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.id == user_id).first()
    if not pu:
        raise HTTPException(404, "المستخدم غير موجود")

    if data.password:                pu.hashed_password = get_password_hash(data.password)
    if data.is_active is not None:   pu.is_active = data.is_active
    if data.can_see_files is not None:       pu.can_see_files = data.can_see_files
    if data.can_see_invoices is not None:    pu.can_see_invoices = data.can_see_invoices
    if data.can_see_obligations is not None: pu.can_see_obligations = data.can_see_obligations
    if data.can_see_reports is not None:     pu.can_see_reports = data.can_see_reports
    if data.can_see_tasks is not None:       pu.can_see_tasks = data.can_see_tasks

    db.commit()
    db.refresh(pu)
    return portal_user_to_dict(pu)


@router.delete("/users/{user_id}")
def delete_portal_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.id == user_id).first()
    if not pu:
        raise HTTPException(404, "المستخدم غير موجود")
    db.delete(pu)
    db.commit()
    return {"ok": True}


# ─── Portal login ─────────────────────────────────────────────────────────────

@router.post("/login")
def portal_login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.username == form.username).first()
    if not pu or not verify_password(form.password, pu.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "اسم المستخدم أو كلمة المرور غير صحيحة")
    if not pu.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "الحساب معطل")

    pu.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({"sub": str(pu.id), "type": "portal", "client_id": pu.client_id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "client_id": pu.client_id,
        "client_name": pu.client.name if pu.client else "",
        "permissions": {
            "can_see_files": pu.can_see_files,
            "can_see_invoices": pu.can_see_invoices,
            "can_see_obligations": pu.can_see_obligations,
            "can_see_reports": pu.can_see_reports,
            "can_see_tasks": pu.can_see_tasks,
        }
    }


# ─── Portal data views (client-facing) ───────────────────────────────────────

@router.get("/me")
def portal_me(portal_user: ClientPortalUser = Depends(get_portal_user)):
    return portal_user_to_dict(portal_user)


@router.get("/my-invoices")
def portal_my_invoices(
    portal_user: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    if not portal_user.can_see_invoices:
        raise HTTPException(403, "لا تملك صلاحية رؤية الفواتير")
    invoices = db.query(Invoice).filter(Invoice.client_id == portal_user.client_id).order_by(Invoice.issue_date.desc()).limit(50).all()
    return [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "subtotal": inv.subtotal,
            "tax_amount": inv.tax_amount,
            "total": inv.total,
            "paid_amount": inv.paid_amount,
            "remaining": inv.remaining,
            "status": inv.status,
        }
        for inv in invoices
    ]


@router.get("/my-tasks")
def portal_my_tasks(
    portal_user: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    if not portal_user.can_see_tasks:
        raise HTTPException(403, "لا تملك صلاحية رؤية المهام")
    tasks = db.query(Task).filter(Task.client_id == portal_user.client_id).order_by(Task.created_at.desc()).limit(50).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
        }
        for t in tasks
    ]


@router.get("/my-profile")
def portal_my_profile(
    portal_user: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    client = db.query(Client).filter(Client.id == portal_user.client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")
    return {
        "id": client.id,
        "name": client.name,
        "name_en": client.name_en,
        "client_type": client.client_type,
        "email": client.email,
        "phone": client.phone,
        "address": client.address,
        "tax_number": client.tax_number,
        "vat_number": client.vat_number,
        "commercial_register": client.commercial_register,
        "activity": client.activity,
    }
