"""
Tax Obligations Engine Router
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel

from app.database import get_db
from app.core.deps import get_current_user
from app.models.obligation import TaxObligation, ObligationInstance, ObligationStatus, ObligationType, Notification
from app.models.client import Client
from app.models.user import User

router = APIRouter(prefix="/api/obligations", tags=["obligations"])


class ObligationCreate(BaseModel):
    client_id: int
    obligation_type: str
    frequency: Optional[str] = "monthly"
    due_day: Optional[int] = 15
    assigned_to: Optional[int] = None
    notes: Optional[str] = None
    start_date: Optional[str] = None


class InstanceUpdate(BaseModel):
    status: str
    tax_amount: Optional[float] = None
    penalty: Optional[float] = None
    notes: Optional[str] = None
    submitted_at: Optional[str] = None


def generate_instances(obligation: TaxObligation, months_ahead: int = 3):
    """توليد نسخ الالتزام للأشهر القادمة"""
    instances = []
    today = date.today()

    if obligation.frequency == "monthly":
        for i in range(months_ahead):
            month = today.month + i
            year = today.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            due = date(year, month, min(obligation.due_day, 28))
            period = f"{['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][month-1]} {year}"
            instances.append(ObligationInstance(
                obligation_id=obligation.id,
                client_id=obligation.client_id,
                period_label=period,
                period_year=year,
                period_month=month,
                due_date=datetime.combine(due, datetime.min.time()),
                status=ObligationStatus.UPCOMING
            ))
    elif obligation.frequency == "quarterly":
        quarter = (today.month - 1) // 3
        for i in range(2):
            q = (quarter + i) % 4 + 1
            y = today.year + (quarter + i) // 4
            end_month = q * 3
            due = date(y, end_month, min(obligation.due_day, 28))
            instances.append(ObligationInstance(
                obligation_id=obligation.id,
                client_id=obligation.client_id,
                period_label=f"الربع {q} - {y}",
                period_year=y,
                period_quarter=q,
                due_date=datetime.combine(due, datetime.min.time()),
                status=ObligationStatus.UPCOMING
            ))
    elif obligation.frequency == "annual":
        due = date(today.year, 12, 31)
        instances.append(ObligationInstance(
            obligation_id=obligation.id,
            client_id=obligation.client_id,
            period_label=f"السنة {today.year}",
            period_year=today.year,
            due_date=datetime.combine(due, datetime.min.time()),
            status=ObligationStatus.UPCOMING
        ))
    return instances


@router.get("")
def list_obligations(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(TaxObligation).filter(TaxObligation.is_active == True)
    if client_id:
        query = query.filter(TaxObligation.client_id == client_id)
    items = query.all()
    result = []
    for o in items:
        result.append({
            "id": o.id,
            "client_id": o.client_id,
            "client_name": o.client.name if o.client else None,
            "obligation_type": o.obligation_type,
            "frequency": o.frequency,
            "due_day": o.due_day,
            "assigned_to": o.assigned_to,
            "assigned_name": o.assigned_user.name if o.assigned_user else None,
            "is_active": o.is_active,
            "instances_count": len(o.instances),
        })
    return {"total": len(result), "items": result}


@router.post("")
def create_obligation(
    body: ObligationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    start = datetime.fromisoformat(body.start_date) if body.start_date else datetime.utcnow()
    obl = TaxObligation(
        client_id=body.client_id,
        obligation_type=body.obligation_type,
        frequency=body.frequency or "monthly",
        due_day=body.due_day or 15,
        assigned_to=body.assigned_to,
        notes=body.notes,
        start_date=start,
        is_active=True,
        auto_generated=False,
    )
    db.add(obl)
    db.flush()
    # Generate upcoming instances
    instances = generate_instances(obl)
    for inst in instances:
        db.add(inst)
    db.commit()
    return {"id": obl.id, "instances_created": len(instances), "message": "تم إنشاء الالتزام الضريبي"}


@router.get("/upcoming")
def upcoming_obligations(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    until = datetime.utcnow() + timedelta(days=days)
    items = db.query(ObligationInstance).filter(
        ObligationInstance.due_date <= until,
        ObligationInstance.status.in_([ObligationStatus.UPCOMING, ObligationStatus.PENDING])
    ).order_by(ObligationInstance.due_date).limit(50).all()

    obligation_labels = {
        ObligationType.VAT_MONTHLY: "ق.م.م شهري",
        ObligationType.VAT_QUARTERLY: "ق.م.م ربعي",
        ObligationType.INCOME_ANNUAL: "ضريبة الدخل",
        ObligationType.PAYROLL_MONTHLY: "مرتبات شهري",
        ObligationType.WITHHOLDING_MONTHLY: "خصم وإضافة",
        ObligationType.STAMP_QUARTERLY: "دمغة ربعي",
    }
    return [
        {
            "id": i.id,
            "client_name": i.client.name if i.client else None,
            "obligation_type": i.obligation.obligation_type if i.obligation else None,
            "obligation_label": obligation_labels.get(i.obligation.obligation_type if i.obligation else "", ""),
            "period_label": i.period_label,
            "due_date": i.due_date.isoformat(),
            "status": i.status,
            "days_remaining": (i.due_date.date() - date.today()).days,
        }
        for i in items
    ]


@router.put("/instances/{instance_id}")
def update_instance(
    instance_id: int, body: InstanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inst = db.query(ObligationInstance).filter(ObligationInstance.id == instance_id).first()
    if not inst:
        raise HTTPException(404, "الالتزام غير موجود")
    inst.status = body.status
    if body.tax_amount is not None:
        inst.tax_amount = body.tax_amount
    if body.penalty is not None:
        inst.penalty = body.penalty
    if body.notes:
        inst.notes = body.notes
    if body.submitted_at:
        inst.submitted_at = datetime.fromisoformat(body.submitted_at)
    inst.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "تم تحديث الالتزام"}


@router.post("/auto-generate/{client_id}")
def auto_generate_obligations(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """توليد الالتزامات تلقائياً حسب نوع العميل"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")

    created = []
    existing_types = [o.obligation_type for o in db.query(TaxObligation)
                      .filter(TaxObligation.client_id == client_id, TaxObligation.is_active == True).all()]

    # قائمة الالتزامات حسب نوع الضريبة
    obligations_map = {
        "vat": [
            (ObligationType.VAT_MONTHLY, "monthly", 15),
        ],
        "income": [
            (ObligationType.INCOME_ANNUAL, "annual", 31),
            (ObligationType.WITHHOLDING_MONTHLY, "monthly", 15),
        ],
        "both": [
            (ObligationType.VAT_MONTHLY, "monthly", 15),
            (ObligationType.INCOME_ANNUAL, "annual", 31),
            (ObligationType.WITHHOLDING_MONTHLY, "monthly", 15),
        ],
    }

    tax_type = getattr(client, "tax_type", "vat") or "vat"
    to_create = obligations_map.get(tax_type, obligations_map["vat"])

    for obl_type, freq, due_day in to_create:
        if obl_type not in existing_types:
            obl = TaxObligation(
                client_id=client_id, obligation_type=obl_type,
                frequency=freq, due_day=due_day,
                is_active=True, auto_generated=True,
                start_date=datetime.utcnow()
            )
            db.add(obl)
            db.flush()
            for inst in generate_instances(obl):
                db.add(inst)
            created.append(obl_type)

    db.commit()
    return {"created": created, "message": f"تم توليد {len(created)} التزام ضريبي"}


# ── Notifications ─────────────────────────────────
@router.get("/notifications")
def get_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    items = query.order_by(Notification.created_at.desc()).limit(20).all()
    return [{"id": n.id, "title": n.title, "message": n.message, "type": n.type,
             "is_read": n.is_read, "entity_type": n.entity_type, "entity_id": n.entity_id,
             "created_at": n.created_at.isoformat()} for n in items]


@router.put("/notifications/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    n = db.query(Notification).filter(Notification.id == notif_id,
                                       Notification.user_id == current_user.id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"message": "تم التعيين كمقروء"}
