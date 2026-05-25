from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import date
from app.database import get_db
from app.models.client import Client, ClientType, ClientStatus, TaxType
from app.models.client_contact import ClientContact
from app.models.activity import ActivityLog
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/clients", tags=["clients"])


class ClientCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    client_type: ClientType = ClientType.COMPANY
    status: ClientStatus = ClientStatus.ACTIVE
    email: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    address: Optional[str] = None
    governorate: Optional[str] = None
    city: Optional[str] = None
    commercial_register: Optional[str] = None
    tax_number: Optional[str] = None
    vat_number: Optional[str] = None
    national_id: Optional[str] = None
    activity: Optional[str] = None
    activity_code: Optional[str] = None
    tax_type: TaxType = TaxType.VAT
    monthly_fee: float = 0
    contract_value: float = 0
    payment_terms: int = 30
    credit_limit: float = 0
    tax_obligations: Optional[list] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    contract_renewal_date: Optional[date] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    assigned_accountant_id: Optional[int] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    client_type: Optional[ClientType] = None
    status: Optional[ClientStatus] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    address: Optional[str] = None
    governorate: Optional[str] = None
    city: Optional[str] = None
    commercial_register: Optional[str] = None
    tax_number: Optional[str] = None
    vat_number: Optional[str] = None
    national_id: Optional[str] = None
    activity: Optional[str] = None
    tax_type: Optional[TaxType] = None
    monthly_fee: Optional[float] = None
    contract_value: Optional[float] = None
    payment_terms: Optional[int] = None
    credit_limit: Optional[float] = None
    tax_obligations: Optional[list] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    contract_renewal_date: Optional[date] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    assigned_accountant_id: Optional[int] = None


def generate_client_code(db: Session) -> str:
    count = db.query(func.count(Client.id)).scalar()
    return f"CLT-{str(count + 1).zfill(4)}"


def client_to_dict(client: Client) -> dict:
    return {
        "id": client.id,
        "code": client.code,
        "name": client.name,
        "name_en": client.name_en,
        "client_type": client.client_type,
        "status": client.status,
        "email": client.email,
        "phone": client.phone,
        "phone2": client.phone2,
        "address": client.address,
        "governorate": client.governorate,
        "city": client.city,
        "commercial_register": client.commercial_register,
        "tax_number": client.tax_number,
        "vat_number": client.vat_number,
        "national_id": client.national_id,
        "activity": client.activity,
        "activity_code": client.activity_code,
        "tax_type": client.tax_type,
        "monthly_fee": client.monthly_fee,
        "tax_obligations": client.tax_obligations,
        "contract_value": client.contract_value,
        "payment_terms": client.payment_terms,
        "credit_limit": client.credit_limit,
        "balance": client.balance,
        "contract_start": client.contract_start,
        "contract_end": client.contract_end,
        "contract_renewal_date": client.contract_renewal_date,
        "notes": client.notes,
        "tags": client.tags,
        "assigned_accountant_id": client.assigned_accountant_id,
        "assigned_accountant": client.assigned_accountant.name if client.assigned_accountant else None,
        "created_at": client.created_at,
        "updated_at": client.updated_at,
    }


@router.get("")
async def list_clients(
    q: Optional[str] = Query(None),
    status: Optional[ClientStatus] = None,
    client_type: Optional[ClientType] = None,
    assigned_to: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Client)

    if q:
        query = query.filter(
            or_(
                Client.name.ilike(f"%{q}%"),
                Client.tax_number.ilike(f"%{q}%"),
                Client.phone.ilike(f"%{q}%"),
                Client.code.ilike(f"%{q}%"),
                Client.commercial_register.ilike(f"%{q}%"),
            )
        )
    if status:
        query = query.filter(Client.status == status)
    if client_type:
        query = query.filter(Client.client_type == client_type)
    if assigned_to:
        query = query.filter(Client.assigned_accountant_id == assigned_to)

    total = query.count()
    clients = query.order_by(Client.name).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [client_to_dict(c) for c in clients],
    }


@router.get("/stats")
async def client_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total = db.query(func.count(Client.id)).scalar()
    active = db.query(func.count(Client.id)).filter(Client.status == ClientStatus.ACTIVE).scalar()
    inactive = db.query(func.count(Client.id)).filter(Client.status == ClientStatus.INACTIVE).scalar()
    companies = db.query(func.count(Client.id)).filter(Client.client_type == ClientType.COMPANY).scalar()
    return {"total": total, "active": active, "inactive": inactive, "companies": companies}


@router.get("/{client_id}")
async def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    data = client_to_dict(client)
    data["contacts"] = [
        {"id": c.id, "name": c.name, "position": c.position, "email": c.email, "phone": c.phone, "is_primary": c.is_primary}
        for c in client.contacts
    ]
    return data


@router.post("")
async def create_client(
    data: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = Client(**data.dict(), code=generate_client_code(db), created_by=current_user.id)
    db.add(client)
    db.commit()
    db.refresh(client)

    log = ActivityLog(user_id=current_user.id, client_id=client.id, action="create_client",
                      entity_type="client", entity_id=client.id, description=f"تم إضافة عميل جديد: {client.name}")
    db.add(log)
    db.commit()

    # ── Smart Automation: auto-generate obligations ──
    if client.tax_obligations:
        try:
            from app.routers.obligations import _auto_generate_for_client
            _auto_generate_for_client(db, client, months_ahead=12)
        except Exception:
            pass  # don't fail client creation if automation fails

    return client_to_dict(client)


@router.put("/{client_id}")
async def update_client(
    client_id: int,
    data: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")

    for field, value in data.dict(exclude_none=True).items():
        setattr(client, field, value)
    db.commit()
    db.refresh(client)

    log = ActivityLog(user_id=current_user.id, client_id=client_id, action="update_client",
                      entity_type="client", entity_id=client_id, description=f"تم تعديل بيانات العميل: {client.name}")
    db.add(log)
    db.commit()

    return client_to_dict(client)


@router.delete("/{client_id}")
async def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    client.status = ClientStatus.INACTIVE
    db.commit()
    return {"message": "تم تعطيل العميل"}


@router.get("/{client_id}/activity")
async def client_activity(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.client_id == client_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": l.id,
            "action": l.action,
            "description": l.description,
            "user": l.user.name if l.user else None,
            "created_at": l.created_at,
        }
        for l in logs
    ]


@router.get("/{client_id}/timeline")
async def client_timeline(
    client_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Smart Client Timeline — يجمع كل نشاط العميل من جميع المصادر:
    المدفوعات، الالتزامات، المهام، الملفات، الفواتير، النشاطات
    """
    from app.models.invoice import Invoice, Payment, InvoiceStatus
    from app.models.task import Task, TaskStatus
    from app.models.document import Document
    from app.models.obligation import ObligationInstance, ObligationStatus
    from datetime import datetime

    events = []

    # ── Activity Logs (all system events) ────────────────────────────────
    logs = db.query(ActivityLog).filter(ActivityLog.client_id == client_id).all()
    action_map = {
        "create_client": ("👤", "تم إضافة العميل", "client"),
        "update_client": ("✏️", "تم تعديل بيانات العميل", "client"),
        "create_invoice": ("📄", "تم إنشاء فاتورة", "invoice"),
        "update_invoice": ("📝", "تم تعديل فاتورة", "invoice"),
        "create_task": ("✅", "تم إنشاء مهمة", "task"),
    }
    for l in logs:
        icon, label, etype = action_map.get(l.action, ("📝", l.action, "activity"))
        events.append({
            "type": etype,
            "icon": icon,
            "title": l.description or label,
            "subtitle": l.user.name if l.user else None,
            "date": l.created_at.isoformat() if l.created_at else None,
            "color": "#6366f1",
            "ref_id": l.entity_id,
        })

    # ── Invoices ──────────────────────────────────────────────────────────
    invoices = db.query(Invoice).filter(Invoice.client_id == client_id).all()
    status_ar = {
        InvoiceStatus.DRAFT: "مسودة", InvoiceStatus.SENT: "مرسلة",
        InvoiceStatus.PAID: "مسددة", InvoiceStatus.PARTIAL: "مسددة جزئياً",
        InvoiceStatus.OVERDUE: "متأخرة", InvoiceStatus.CANCELLED: "ملغاة",
    }
    for inv in invoices:
        events.append({
            "type": "invoice",
            "icon": "📄",
            "title": f"فاتورة #{inv.invoice_number or inv.id} — {status_ar.get(inv.status, inv.status)}",
            "subtitle": f"{inv.total:,.0f} ج.م." if inv.total else None,
            "date": inv.issue_date.isoformat() if inv.issue_date else (inv.created_at.isoformat() if inv.created_at else None),
            "color": "#16a34a" if inv.status == InvoiceStatus.PAID else "#d97706" if inv.status == InvoiceStatus.PARTIAL else "#dc2626" if inv.status == InvoiceStatus.OVERDUE else "#1a2472",
            "ref_id": inv.id,
            "amount": inv.total,
        })

    # ── Payments ──────────────────────────────────────────────────────────
    payments = (
        db.query(Payment)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .filter(Invoice.client_id == client_id)
        .all()
    )
    for p in payments:
        events.append({
            "type": "payment",
            "icon": "💰",
            "title": f"تم استلام دفعة — {p.amount:,.0f} ج.م.",
            "subtitle": p.notes or (p.invoice.invoice_number if p.invoice else None),
            "date": p.created_at.isoformat() if p.created_at else None,
            "color": "#16a34a",
            "ref_id": p.id,
            "amount": p.amount,
        })

    # ── Tasks ──────────────────────────────────────────────────────────────
    tasks = db.query(Task).filter(Task.client_id == client_id).all()
    task_status_ar = {
        TaskStatus.TODO: "⬜ للتنفيذ", TaskStatus.IN_PROGRESS: "🔄 قيد التنفيذ",
        TaskStatus.DONE: "✅ منجزة", TaskStatus.CANCELLED: "❌ ملغاة",
    }
    for t in tasks:
        events.append({
            "type": "task",
            "icon": "✅" if t.status == TaskStatus.DONE else "📋",
            "title": t.title,
            "subtitle": task_status_ar.get(t.status, t.status),
            "date": t.completed_at.isoformat() if t.completed_at else (t.created_at.isoformat() if t.created_at else None),
            "color": "#16a34a" if t.status == TaskStatus.DONE else "#d97706",
            "ref_id": t.id,
        })

    # ── Obligation Instances (submitted/paid only) ─────────────────────────
    obl_insts = db.query(ObligationInstance).filter(
        ObligationInstance.client_id == client_id,
        ObligationInstance.status.in_([ObligationStatus.SUBMITTED, "paid"])
    ).all()
    for oi in obl_insts:
        obl_type = oi.obligation.obligation_type if oi.obligation else ""
        events.append({
            "type": "obligation",
            "icon": "🧾",
            "title": f"تم تقديم: {oi.period_label}",
            "subtitle": obl_type,
            "date": oi.submitted_at.isoformat() if oi.submitted_at else (oi.updated_at.isoformat() if oi.updated_at else None),
            "color": "#16a34a",
            "ref_id": oi.id,
        })

    # ── Documents ─────────────────────────────────────────────────────────
    docs = db.query(Document).filter(
        Document.client_id == client_id,
        Document.is_archived == False
    ).order_by(Document.created_at.desc()).limit(20).all()
    for doc in docs:
        events.append({
            "type": "document",
            "icon": "📁",
            "title": f"ملف مرفوع: {doc.original_name or doc.name}",
            "subtitle": doc.category or None,
            "date": doc.created_at.isoformat() if doc.created_at else None,
            "color": "#6366f1",
            "ref_id": doc.id,
        })

    # Sort by date descending, filter out None dates
    events = [e for e in events if e.get("date")]
    events.sort(key=lambda x: x["date"], reverse=True)

    return {
        "client_id": client_id,
        "total": len(events),
        "events": events[:limit],
    }
