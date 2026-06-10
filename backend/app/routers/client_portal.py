"""
بوابة العميل — Portal APIs
Single Source of Truth: كل البيانات من النظام الداخلي مباشرة
"""
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel

from app.database import get_db
from app.models.client_portal import ClientPortalUser
from app.models.client_required_doc import ClientRequiredDoc
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.task import Task
from app.models.document import Document
from app.models.obligation import TaxObligation, ObligationInstance
from app.models.collection import CollectionContract, CollectionPayment
from app.models.activity import ActivityLog
from app.models.user import User
from app.core.security import verify_password, get_password_hash, create_access_token, decode_token
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/portal", tags=["client_portal"])
portal_oauth = OAuth2PasswordBearer(tokenUrl="/api/portal/login", auto_error=False)

# ── Try to import formation models (optional) ──────────────────────────────────
try:
    from app.models.establishment import CompanyFormationCase
    from app.models.establishment import FORMATION_STAGES
    HAS_FORMATION = True
except Exception:
    try:
        from app.models.formation import CompanyFormationCase, FORMATION_STAGES
        HAS_FORMATION = True
    except Exception:
        HAS_FORMATION = False

try:
    from app.models.tax import TaxReturn
    HAS_TAX = True
except Exception:
    HAS_TAX = False


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

class RequiredDocCreate(BaseModel):
    client_id: int
    doc_name: str
    notes: Optional[str] = None

class RequiredDocUpdate(BaseModel):
    doc_name: Optional[str] = None
    notes: Optional[str] = None
    is_received: Optional[bool] = None


# ─── Auth helpers ──────────────────────────────────────────────────────────────

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


# ─── Admin: Portal Users ───────────────────────────────────────────────────────

@router.get("/users")
def list_portal_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(ClientPortalUser).all()
    return [portal_user_to_dict(u) for u in users]

@router.post("/users")
def create_portal_user(data: PortalUserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(Client).filter(Client.id == data.client_id).first():
        raise HTTPException(404, "العميل غير موجود")
    if db.query(ClientPortalUser).filter(ClientPortalUser.client_id == data.client_id).first():
        raise HTTPException(400, "يوجد حساب بوابة مرتبط بهذا العميل بالفعل")
    if db.query(ClientPortalUser).filter(ClientPortalUser.username == data.username).first():
        raise HTTPException(400, "اسم المستخدم مستخدم بالفعل")
    pu = ClientPortalUser(
        client_id=data.client_id, username=data.username,
        hashed_password=get_password_hash(data.password),
        can_see_files=data.can_see_files, can_see_invoices=data.can_see_invoices,
        can_see_obligations=data.can_see_obligations, can_see_reports=data.can_see_reports,
        can_see_tasks=data.can_see_tasks,
    )
    db.add(pu); db.commit(); db.refresh(pu)
    return portal_user_to_dict(pu)

@router.put("/users/{user_id}")
def update_portal_user(user_id: int, data: PortalUserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.id == user_id).first()
    if not pu: raise HTTPException(404, "المستخدم غير موجود")
    if data.password:                pu.hashed_password = get_password_hash(data.password)
    if data.is_active is not None:   pu.is_active = data.is_active
    if data.can_see_files is not None:       pu.can_see_files = data.can_see_files
    if data.can_see_invoices is not None:    pu.can_see_invoices = data.can_see_invoices
    if data.can_see_obligations is not None: pu.can_see_obligations = data.can_see_obligations
    if data.can_see_reports is not None:     pu.can_see_reports = data.can_see_reports
    if data.can_see_tasks is not None:       pu.can_see_tasks = data.can_see_tasks
    db.commit(); db.refresh(pu)
    return portal_user_to_dict(pu)

@router.delete("/users/{user_id}")
def delete_portal_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.id == user_id).first()
    if not pu: raise HTTPException(404, "المستخدم غير موجود")
    db.delete(pu); db.commit()
    return {"ok": True}


# ─── Admin: Required Docs ──────────────────────────────────────────────────────

@router.get("/required-docs/admin")
def admin_list_required_docs(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    docs = db.query(ClientRequiredDoc).filter(ClientRequiredDoc.client_id == client_id).order_by(ClientRequiredDoc.created_at).all()
    return [_req_doc_dict(d) for d in docs]

@router.post("/required-docs/admin")
def admin_create_required_doc(data: RequiredDocCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = ClientRequiredDoc(client_id=data.client_id, doc_name=data.doc_name, notes=data.notes, created_by=current_user.id)
    db.add(d); db.commit(); db.refresh(d)
    return _req_doc_dict(d)

@router.put("/required-docs/admin/{doc_id}")
def admin_update_required_doc(doc_id: int, data: RequiredDocUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = db.query(ClientRequiredDoc).filter(ClientRequiredDoc.id == doc_id).first()
    if not d: raise HTTPException(404, "المستند غير موجود")
    if data.doc_name is not None:   d.doc_name = data.doc_name
    if data.notes is not None:      d.notes = data.notes
    if data.is_received is not None:
        d.is_received = data.is_received
        d.received_at = datetime.utcnow() if data.is_received else None
    db.commit(); db.refresh(d)
    return _req_doc_dict(d)

@router.delete("/required-docs/admin/{doc_id}")
def admin_delete_required_doc(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = db.query(ClientRequiredDoc).filter(ClientRequiredDoc.id == doc_id).first()
    if not d: raise HTTPException(404, "المستند غير موجود")
    db.delete(d); db.commit()
    return {"ok": True}

def _req_doc_dict(d: ClientRequiredDoc) -> dict:
    return {
        "id": d.id, "client_id": d.client_id, "doc_name": d.doc_name,
        "notes": d.notes, "is_received": d.is_received,
        "received_at": d.received_at.isoformat() if d.received_at else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


# ─── Portal Login ──────────────────────────────────────────────────────────────

@router.post("/login")
def portal_login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.username == form.username).first()
    if not pu or not verify_password(form.password, pu.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "اسم المستخدم أو كلمة المرور غير صحيحة")
    if not pu.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "الحساب معطل، تواصل مع المكتب")
    pu.last_login = datetime.utcnow()
    db.commit()
    token = create_access_token({"sub": str(pu.id), "type": "portal", "client_id": pu.client_id})
    client = pu.client
    return {
        "access_token": token, "token_type": "bearer",
        "client_id": pu.client_id,
        "client_name": client.name if client else "",
        "permissions": {
            "can_see_files": pu.can_see_files,
            "can_see_invoices": pu.can_see_invoices,
            "can_see_obligations": pu.can_see_obligations,
            "can_see_reports": pu.can_see_reports,
            "can_see_tasks": pu.can_see_tasks,
        }
    }


# ─── Portal: Dashboard ────────────────────────────────────────────────────────

@router.get("/dashboard")
def portal_dashboard(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    cid = portal_user.client_id
    client = db.query(Client).filter(Client.id == cid).first()
    if not client: raise HTTPException(404, "العميل غير موجود")

    # إجماليات المدفوعات
    contracts = db.query(CollectionContract).filter(CollectionContract.client_id == cid, CollectionContract.is_active == True).all()
    total_agreed = sum(c.agreed_amount or 0 for c in contracts)
    total_paid   = sum(c.total_paid or 0 for c in contracts)
    total_remaining = sum(c.total_remaining or 0 for c in contracts)

    # الالتزامات القادمة (30 يوم)
    today = date.today()
    from datetime import timedelta
    next30 = today + timedelta(days=30)
    upcoming_obs = db.query(ObligationInstance).filter(
        ObligationInstance.client_id == cid,
        ObligationInstance.status.in_(["pending", "overdue"]),
    ).count()
    overdue_obs = db.query(ObligationInstance).filter(
        ObligationInstance.client_id == cid,
        ObligationInstance.status == "overdue",
    ).count()

    # المستندات
    docs_count = db.query(Document).filter(Document.client_id == cid, Document.is_archived == False).count()

    # المستندات المطلوبة
    req_docs = db.query(ClientRequiredDoc).filter(ClientRequiredDoc.client_id == cid).all()
    pending_req = sum(1 for d in req_docs if not d.is_received)

    # آخر نشاط
    last_activities = db.query(ActivityLog).filter(
        ActivityLog.client_id == cid
    ).order_by(desc(ActivityLog.created_at)).limit(5).all()

    # حالة الملف
    file_status = "green"
    file_message = "ملف الشركة محدث — لا توجد إجراءات مطلوبة"
    if overdue_obs > 0:
        file_status = "red"
        file_message = f"يوجد {overdue_obs} التزام متأخر يستوجب الإجراء الفوري"
    elif pending_req > 0:
        file_status = "yellow"
        file_message = f"مطلوب منك تقديم {pending_req} مستند"

    return {
        "company": {
            "name": client.name,
            "name_en": client.name_en,
            "status": client.status,
            "company_status": client.company_status,
            "activity": client.activity,
            "tax_number": client.tax_number,
            "commercial_register": client.commercial_register,
        },
        "file_status": {"color": file_status, "message": file_message},
        "financials": {
            "total_agreed": total_agreed,
            "total_paid": total_paid,
            "total_remaining": total_remaining,
        },
        "obligations": {"upcoming": upcoming_obs, "overdue": overdue_obs},
        "documents": {"total": docs_count},
        "required_docs": {"pending": pending_req, "total": len(req_docs)},
        "last_activities": [
            {
                "action": a.action,
                "description": a.description,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            } for a in last_activities
        ],
    }


# ─── Portal: File Status ───────────────────────────────────────────────────────

@router.get("/file-status")
def portal_file_status(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    cid = portal_user.client_id
    client = db.query(Client).filter(Client.id == cid).first()

    overdue = db.query(ObligationInstance).filter(
        ObligationInstance.client_id == cid, ObligationInstance.status == "overdue"
    ).count()
    pending_req = db.query(ClientRequiredDoc).filter(
        ClientRequiredDoc.client_id == cid, ClientRequiredDoc.is_received == False
    ).count()
    upcoming = db.query(ObligationInstance).filter(
        ObligationInstance.client_id == cid, ObligationInstance.status == "pending"
    ).count()

    color = "green"; message = "ملف الشركة محدث ولا توجد إجراءات مطلوبة"
    items = []

    if overdue > 0:
        color = "red"
        message = f"يوجد {overdue} التزام متأخر يستوجب الإجراء الفوري"
        items.append({"type": "danger", "text": f"{overdue} التزام ضريبي متأخر"})
    if pending_req > 0:
        if color == "green": color = "yellow"; message = f"مطلوب منك تقديم {pending_req} مستند"
        items.append({"type": "warning", "text": f"{pending_req} مستند مطلوب منك"})
    if upcoming > 0:
        items.append({"type": "info", "text": f"{upcoming} التزام قادم هذا الشهر"})

    # بيانات الشركة الأساسية
    company_items = []
    if client:
        if client.commercial_register:
            company_items.append({"label": "السجل التجاري", "value": client.commercial_register, "ok": True})
        if client.tax_number:
            company_items.append({"label": "البطاقة الضريبية", "value": client.tax_number, "ok": True})
        if client.vat_number:
            company_items.append({"label": "رقم القيمة المضافة", "value": client.vat_number, "ok": True})

    return {"color": color, "message": message, "items": items, "company_items": company_items}


# ─── Portal: Timeline ─────────────────────────────────────────────────────────

@router.get("/timeline")
def portal_timeline(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    cid = portal_user.client_id

    if not HAS_FORMATION:
        return {"stages": [], "current_stage": None, "company_name": None}

    try:
        case = db.query(CompanyFormationCase).filter(
            CompanyFormationCase.client_id == cid,
            CompanyFormationCase.is_cancelled == False
        ).order_by(desc(CompanyFormationCase.id)).first()
    except Exception:
        case = None

    if not case:
        return {"stages": [], "current_stage": None, "company_name": None}

    stage_keys = [s[0] for s in FORMATION_STAGES]
    current_idx = stage_keys.index(case.current_stage) if case.current_stage in stage_keys else -1

    stages_out = []
    for i, (key, label, icon) in enumerate(FORMATION_STAGES):
        if i < current_idx:
            state = "done"
        elif i == current_idx:
            state = "current"
        else:
            state = "pending"
        stages_out.append({"key": key, "label": label, "icon": icon, "state": state})

    return {
        "company_name": case.company_name,
        "current_stage": case.current_stage,
        "stages": stages_out,
        "commercial_register": case.commercial_register_number,
        "tax_card": case.tax_card_number,
        "is_completed": case.is_completed,
    }


# ─── Portal: Obligations ──────────────────────────────────────────────────────

@router.get("/obligations")
def portal_obligations(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    if not portal_user.can_see_obligations:
        raise HTTPException(403, "لا تملك صلاحية رؤية الالتزامات")
    cid = portal_user.client_id
    instances = db.query(ObligationInstance).filter(
        ObligationInstance.client_id == cid
    ).order_by(desc(ObligationInstance.due_date)).limit(100).all()

    today = date.today()
    result = []
    for inst in instances:
        days_left = None
        if inst.due_date:
            dd = inst.due_date.date() if hasattr(inst.due_date, 'date') else inst.due_date
            days_left = (dd - today).days

        result.append({
            "id": inst.id,
            "obligation_type": inst.obligation_type if hasattr(inst, 'obligation_type') else "",
            "period_label": inst.period_label,
            "due_date": inst.due_date.isoformat() if inst.due_date else None,
            "status": inst.status,
            "days_left": days_left,
            "notes": inst.notes if hasattr(inst, 'notes') else None,
        })

    overdue   = [r for r in result if r["status"] == "overdue"]
    upcoming  = [r for r in result if r["status"] == "pending"]
    completed = [r for r in result if r["status"] == "completed"]

    return {"overdue": overdue, "upcoming": upcoming, "completed": completed}


# ─── Portal: Payments ─────────────────────────────────────────────────────────

@router.get("/payments")
def portal_payments(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    if not portal_user.can_see_invoices:
        raise HTTPException(403, "لا تملك صلاحية رؤية المدفوعات")
    cid = portal_user.client_id

    contracts = db.query(CollectionContract).filter(
        CollectionContract.client_id == cid
    ).order_by(desc(CollectionContract.created_at)).all()

    contracts_out = []
    all_payments = []

    for c in contracts:
        contracts_out.append({
            "id": c.id,
            "title": c.title,
            "collection_type": c.collection_type,
            "agreed_amount": c.agreed_amount,
            "total_paid": c.total_paid or 0,
            "total_remaining": c.total_remaining or 0,
            "status": c.status,
            "start_date": c.start_date.isoformat() if c.start_date else None,
        })
        for p in (c.payments or []):
            method_labels = {
                "cash": "نقداً", "bank_transfer": "تحويل بنكي",
                "check": "شيك", "instapay": "إنستاباي", "vodafone_cash": "فودافون كاش"
            }
            all_payments.append({
                "id": p.id,
                "contract_title": c.title,
                "amount": p.amount,
                "payment_date": p.payment_date.isoformat() if p.payment_date else None,
                "payment_method": p.payment_method,
                "payment_method_label": method_labels.get(p.payment_method, p.payment_method),
                "reference": p.reference,
                "period_month": p.period_month,
                "period_year": p.period_year,
            })

    all_payments.sort(key=lambda x: x["payment_date"] or "", reverse=True)

    total_agreed    = sum(c["agreed_amount"] for c in contracts_out)
    total_paid      = sum(c["total_paid"] for c in contracts_out)
    total_remaining = sum(c["total_remaining"] for c in contracts_out)

    return {
        "summary": {
            "total_agreed": total_agreed,
            "total_paid": total_paid,
            "total_remaining": total_remaining,
            "percent_paid": round((total_paid / total_agreed * 100) if total_agreed > 0 else 0, 1),
        },
        "contracts": contracts_out,
        "payments": all_payments,
    }


# ─── Portal: Documents ────────────────────────────────────────────────────────

@router.get("/documents")
def portal_documents(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    if not portal_user.can_see_files:
        raise HTTPException(403, "لا تملك صلاحية رؤية المستندات")
    cid = portal_user.client_id

    docs = db.query(Document).filter(
        Document.client_id == cid,
        Document.is_archived == False
    ).order_by(desc(Document.created_at)).all()

    # تجميع في مجلدات
    FOLDER_LABELS = {
        "commercial_register": "السجل التجاري",
        "tax_card": "البطاقة الضريبية",
        "contract": "عقد التأسيس",
        "vat": "القيمة المضافة",
        "insurance": "التأمينات",
        "declaration": "الإقرارات",
        "general_assembly": "الجمعيات العمومية",
        "other": "مستندات أخرى",
    }

    folders: dict = {}
    for d in docs:
        cat = d.category or "other"
        if cat not in folders:
            folders[cat] = {"key": cat, "label": FOLDER_LABELS.get(cat, cat), "files": []}
        folders[cat]["files"].append({
            "id": d.id,
            "name": d.name,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "year": d.year,
            "description": d.description,
            "gdrive_file_id": d.gdrive_file_id,
        })

    # ترتيب المجلدات حسب الأهمية
    order = list(FOLDER_LABELS.keys())
    sorted_folders = sorted(folders.values(), key=lambda f: order.index(f["key"]) if f["key"] in order else 99)
    return {"folders": sorted_folders, "total": len(docs)}


# ─── Portal: Required Docs ────────────────────────────────────────────────────

@router.get("/required-docs")
def portal_required_docs(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    docs = db.query(ClientRequiredDoc).filter(
        ClientRequiredDoc.client_id == portal_user.client_id
    ).order_by(ClientRequiredDoc.created_at).all()
    return [_req_doc_dict(d) for d in docs]


# ─── Portal: Declarations ─────────────────────────────────────────────────────

@router.get("/declarations")
def portal_declarations(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    if not portal_user.can_see_reports:
        raise HTTPException(403, "لا تملك صلاحية رؤية الإقرارات")
    cid = portal_user.client_id

    if not HAS_TAX:
        return []

    try:
        returns = db.query(TaxReturn).filter(
            TaxReturn.client_id == cid
        ).order_by(desc(TaxReturn.created_at)).limit(50).all()

        TYPE_LABELS = {
            "vat": "ضريبة القيمة المضافة",
            "withholding": "خصم وإضافة",
            "income": "ضريبة الدخل",
            "salary": "ضريبة المرتبات",
            "stamp": "ضريبة الدمغة",
        }
        STATUS_LABELS = {
            "draft": "مسودة",
            "submitted": "تم التقديم",
            "accepted": "مقبول",
            "rejected": "مرفوض",
        }

        return [
            {
                "id": r.id,
                "return_type": r.return_type if hasattr(r, 'return_type') else "",
                "return_type_label": TYPE_LABELS.get(getattr(r, 'return_type', ''), getattr(r, 'return_type', '')),
                "period": r.period if hasattr(r, 'period') else "",
                "submission_date": r.submission_date.isoformat() if hasattr(r, 'submission_date') and r.submission_date else None,
                "status": r.status if hasattr(r, 'status') else "",
                "status_label": STATUS_LABELS.get(getattr(r, 'status', ''), getattr(r, 'status', '')),
                "tax_amount": r.tax_amount if hasattr(r, 'tax_amount') else None,
            }
            for r in returns
        ]
    except Exception:
        return []


# ─── Portal: Contact ──────────────────────────────────────────────────────────

@router.get("/contact")
def portal_contact(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    cid = portal_user.client_id
    client = db.query(Client).filter(Client.id == cid).first()

    # المحاسب المسؤول — من assigned_to أو أول مستخدم admin
    assigned_user = None
    if client and hasattr(client, 'assigned_to') and client.assigned_to:
        assigned_user = db.query(User).filter(User.id == client.assigned_to).first()
    if not assigned_user:
        assigned_user = db.query(User).filter(User.role == "admin").first()

    return {
        "accountant": {
            "name": assigned_user.name if assigned_user else "مكتب المحاسبة",
            "email": assigned_user.email if assigned_user else None,
            "phone": assigned_user.phone if assigned_user and hasattr(assigned_user, 'phone') else None,
        },
        "office": {
            "name": "مكتب MS للمحاسبة",
        }
    }


# ─── Portal: Notifications / Activity ────────────────────────────────────────

@router.get("/activity")
def portal_activity(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    cid = portal_user.client_id
    activities = db.query(ActivityLog).filter(
        ActivityLog.client_id == cid
    ).order_by(desc(ActivityLog.created_at)).limit(20).all()

    return [
        {
            "id": a.id,
            "action": a.action,
            "description": a.description,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in activities
    ]


# ─── Legacy endpoints (backward compat) ──────────────────────────────────────

@router.get("/me")
def portal_me(portal_user: ClientPortalUser = Depends(get_portal_user)):
    return portal_user_to_dict(portal_user)

@router.get("/my-profile")
def portal_my_profile(portal_user: ClientPortalUser = Depends(get_portal_user), db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == portal_user.client_id).first()
    if not client: raise HTTPException(404, "العميل غير موجود")
    return {
        "id": client.id, "name": client.name, "name_en": client.name_en,
        "client_type": client.client_type, "email": client.email, "phone": client.phone,
        "address": client.address, "tax_number": client.tax_number,
        "vat_number": client.vat_number, "commercial_register": client.commercial_register,
        "activity": client.activity,
    }
