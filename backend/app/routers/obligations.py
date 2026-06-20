"""
Smart Automation Engine — Tax Obligations Rules Engine
يولّد الالتزامات تلقائيًا بناءً على بيانات العميل
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional, List
from datetime import datetime, date, timedelta
from calendar import monthrange
from pydantic import BaseModel

from app.database import get_db
from app.core.deps import get_current_user
from app.models.obligation import TaxObligation, ObligationInstance, ObligationStatus, ObligationType, Notification
from app.models.client import Client
from app.models.user import User

router = APIRouter(prefix="/api/obligations", tags=["obligations"])

# ─────────────────────────────────────────────────────────────────────────────
# EGYPTIAN TAX RULES — قواعد الالتزامات الضريبية المصرية
# ─────────────────────────────────────────────────────────────────────────────
EGYPTIAN_RULES = {
    # ── شهرية (قبل اليوم 15 من الشهر التالي) ──────────────────────────────
    "vat_monthly": {
        "name_ar": "إقرار القيمة المضافة الشهري",
        "frequency": "monthly",
        "due_day": 15,
        "priority": "high",
        "description": "تقديم وسداد إقرار ضريبة القيمة المضافة قبل اليوم 15 من الشهر التالي",
    },
    "payroll_monthly": {
        "name_ar": "نموذج 1 — مرتبات شهري",
        "frequency": "monthly",
        "due_day": 15,
        "priority": "high",
        "description": "تقديم نموذج 1 الخاص بالمرتبات والأجور قبل اليوم 15 من الشهر التالي",
    },
    "withholding_monthly": {
        "name_ar": "خصم وإضافة شهري",
        "frequency": "monthly",
        "due_day": 15,
        "priority": "medium",
        "description": "تسوية الخصم والإضافة على المدفوعات للغير",
    },
    "insurance_monthly": {
        "name_ar": "تأمينات اجتماعية شهرية",
        "frequency": "monthly",
        "due_day": 15,
        "priority": "high",
        "description": "سداد اشتراكات التأمينات الاجتماعية لجميع الموظفين",
    },
    # ── ربع سنوية ──────────────────────────────────────────────────────────
    "vat_quarterly": {
        "name_ar": "إقرار القيمة المضافة الربعي",
        "frequency": "quarterly",
        "due_day": 15,
        "priority": "high",
        "description": "للمنشآت الصغيرة — تقديم إقرار ق.م.م ربعي قبل اليوم 15 من الشهر التالي للربع",
    },
    "stamp_quarterly": {
        "name_ar": "الدمغة النسبية ربعي",
        "frequency": "quarterly",
        "due_day": 15,
        "priority": "medium",
        "description": "سداد ضريبة الدمغة النسبية على المعاملات التجارية",
    },
    # ── سنوية ──────────────────────────────────────────────────────────────
    "income_annual": {
        "name_ar": "إقرار ضريبة الدخل السنوي",
        "frequency": "annual",
        "due_month": 3,   # مارس (أفراد)
        "due_day": 31,
        "priority": "urgent",
        "description": "تقديم الإقرار السنوي لضريبة الدخل — 31 مارس (أفراد) / 30 أبريل (شركات)",
    },
    "form_41": {
        "name_ar": "نموذج 41 — إقرار المرتبات السنوي",
        "frequency": "annual",
        "due_month": 1,   # يناير
        "due_day": 31,
        "priority": "high",
        "description": "تقديم الإقرار السنوي عن المرتبات والأجور — 31 يناير",
    },
    "corporate_tax": {
        "name_ar": "ضريبة الأرباح التجارية السنوية",
        "frequency": "annual",
        "due_month": 4,   # أبريل
        "due_day": 30,
        "priority": "urgent",
        "description": "تقديم وسداد ضريبة الأرباح التجارية والصناعية — 30 أبريل",
    },
    "commercial_register_renewal": {
        "name_ar": "تجديد السجل التجاري",
        "frequency": "annual",
        "due_month": None,   # يُحسب من تاريخ التأسيس
        "due_day": None,
        "priority": "high",
        "description": "تجديد السجل التجاري سنويًا من تاريخ الإصدار",
    },
}

OBL_NAME_AR = {k: v["name_ar"] for k, v in EGYPTIAN_RULES.items()}

# ─────────────────────────────────────────────────────────────────────────────
# Instance Generator — توليد نسخ الالتزام
# ─────────────────────────────────────────────────────────────────────────────
MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
            "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]


def _add_months(dt: date, n: int) -> date:
    month = dt.month - 1 + n
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, monthrange(year, month)[1])
    return date(year, month, day)


def generate_instances_smart(obligation: TaxObligation, months_ahead: int = 12) -> List[ObligationInstance]:
    """توليد نسخ الالتزام للفترة القادمة بناءً على نوع التكرار"""
    instances = []
    today = date.today()
    obl_type = obligation.obligation_type
    rule = EGYPTIAN_RULES.get(obl_type, {})

    # ── شهري ──────────────────────────────────────────────────────────────
    if obligation.frequency == "monthly":
        for i in range(months_ahead):
            target = _add_months(today, i)
            # due date = day X of following month
            next_m = _add_months(target, 1)
            due_day = obligation.due_day or 15
            last_day = monthrange(next_m.year, next_m.month)[1]
            due = date(next_m.year, next_m.month, min(due_day, last_day))

            instances.append(ObligationInstance(
                obligation_id=obligation.id,
                client_id=obligation.client_id,
                period_label=f"{MONTH_AR[target.month-1]} {target.year}",
                period_year=target.year,
                period_month=target.month,
                due_date=datetime.combine(due, datetime.min.time()),
                status=ObligationStatus.UPCOMING,
                assigned_to=obligation.assigned_to,
            ))

    # ── ربع سنوي ──────────────────────────────────────────────────────────
    elif obligation.frequency == "quarterly":
        # Generate next 4 quarters
        current_quarter = (today.month - 1) // 3
        for i in range(4):
            q_idx = (current_quarter + i) % 4   # 0-based quarter (0=Q1 Jan-Mar)
            year_offset = (current_quarter + i) // 4
            q_year = today.year + year_offset
            q_num = q_idx + 1  # 1-based

            # Quarter end month
            q_end_month = q_num * 3  # 3, 6, 9, 12
            # Due = day 15 of month AFTER quarter end
            due_month = q_end_month % 12 + 1
            due_year = q_year if q_end_month < 12 else q_year + 1
            due_day = obligation.due_day or 15
            last_day = monthrange(due_year, due_month)[1]
            due = date(due_year, due_month, min(due_day, last_day))

            q_start = MONTH_AR[(q_num-1)*3]
            q_end = MONTH_AR[q_num*3-1]
            instances.append(ObligationInstance(
                obligation_id=obligation.id,
                client_id=obligation.client_id,
                period_label=f"الربع {q_num} ({q_start} – {q_end}) {q_year}",
                period_year=q_year,
                period_quarter=q_num,
                due_date=datetime.combine(due, datetime.min.time()),
                status=ObligationStatus.UPCOMING,
                assigned_to=obligation.assigned_to,
            ))

    # ── سنوي ──────────────────────────────────────────────────────────────
    elif obligation.frequency == "annual":
        due_month = rule.get("due_month") or 12
        due_day_val = obligation.due_day or rule.get("due_day") or 31
        # Generate current year + next year
        for y in [today.year, today.year + 1]:
            last_day = monthrange(y, due_month)[1]
            due = date(y, due_month, min(due_day_val, last_day))
            instances.append(ObligationInstance(
                obligation_id=obligation.id,
                client_id=obligation.client_id,
                period_label=f"السنة المالية {y}",
                period_year=y,
                due_date=datetime.combine(due, datetime.min.time()),
                status=ObligationStatus.UPCOMING,
                assigned_to=obligation.assigned_to,
            ))

    return instances


def _existing_periods(db: Session, obligation_id: int) -> set:
    """Return set of (year, month/quarter) tuples already in DB for this obligation."""
    rows = db.query(
        ObligationInstance.period_year,
        ObligationInstance.period_month,
        ObligationInstance.period_quarter,
    ).filter(ObligationInstance.obligation_id == obligation_id).all()
    return {(r.period_year, r.period_month, r.period_quarter) for r in rows}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────
class ObligationCreate(BaseModel):
    client_id: int
    obligation_type: str
    frequency: Optional[str] = None   # auto-detected from rules if omitted
    due_day: Optional[int] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None
    start_date: Optional[str] = None


class InstanceUpdate(BaseModel):
    status: str
    tax_amount: Optional[float] = None
    penalty: Optional[float] = None
    notes: Optional[str] = None
    submitted_at: Optional[str] = None
    assigned_to: Optional[int] = None


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/rules")
def list_rules(current_user: User = Depends(get_current_user)):
    """Return all Egyptian tax obligation rules"""
    return [
        {"type": k, **v}
        for k, v in EGYPTIAN_RULES.items()
    ]


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
        rule = EGYPTIAN_RULES.get(o.obligation_type, {})
        result.append({
            "id": o.id,
            "client_id": o.client_id,
            "client_name": o.client.name if o.client else None,
            "obligation_type": o.obligation_type,
            "name_ar": rule.get("name_ar", o.obligation_type),
            "frequency": o.frequency,
            "due_day": o.due_day,
            "assigned_to": o.assigned_to,
            "assigned_name": o.assigned_user.name if o.assigned_user else None,
            "is_active": o.is_active,
            "instances_count": len(o.instances),
            "priority": rule.get("priority", "medium"),
        })
    return {"total": len(result), "items": result}


@router.post("")
def create_obligation(
    body: ObligationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rule = EGYPTIAN_RULES.get(body.obligation_type, {})
    frequency = body.frequency or rule.get("frequency", "monthly")
    due_day = body.due_day or rule.get("due_day", 15)
    start = datetime.fromisoformat(body.start_date) if body.start_date else datetime.utcnow()

    obl = TaxObligation(
        client_id=body.client_id,
        obligation_type=body.obligation_type,
        frequency=frequency,
        due_day=due_day,
        assigned_to=body.assigned_to,
        notes=body.notes,
        start_date=start,
        is_active=True,
        auto_generated=False,
    )
    db.add(obl)
    db.flush()
    instances = generate_instances_smart(obl)
    for inst in instances:
        db.add(inst)
    db.commit()
    return {"id": obl.id, "instances_created": len(instances), "message": "تم إنشاء الالتزام الضريبي"}


@router.get("/instances")
def list_instances(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    obligation_type: Optional[str] = None,
    days_ahead: Optional[int] = None,
    overdue_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(ObligationInstance)
    if client_id:
        query = query.filter(ObligationInstance.client_id == client_id)
    if status:
        query = query.filter(ObligationInstance.status == status)
    if obligation_type:
        # join to filter by obligation type
        query = query.join(TaxObligation).filter(TaxObligation.obligation_type == obligation_type)
    if days_ahead is not None:
        until = datetime.utcnow() + timedelta(days=days_ahead)
        query = query.filter(ObligationInstance.due_date <= until)
    if overdue_only:
        query = query.filter(
            ObligationInstance.due_date < datetime.utcnow(),
            ObligationInstance.status.in_([ObligationStatus.UPCOMING, ObligationStatus.PENDING])
        )
    total = query.count()
    items = (
        query
        .options(
            joinedload(ObligationInstance.client),
            joinedload(ObligationInstance.obligation),
            joinedload(ObligationInstance.assigned_user),
        )
        .order_by(ObligationInstance.due_date)
        .offset((page-1)*page_size)
        .limit(page_size)
        .all()
    )

    return {
        "total": total,
        "items": [_serialize_instance(i) for i in items]
    }


def _serialize_instance(i: ObligationInstance) -> dict:
    rule = EGYPTIAN_RULES.get(
        i.obligation.obligation_type if i.obligation else "", {}
    )
    days_left = (i.due_date.date() - date.today()).days if i.due_date else None
    return {
        "id": i.id,
        "obligation_id": i.obligation_id,
        "client_id": i.client_id,
        "client_name": i.client.name if i.client else None,
        "obligation_type": i.obligation.obligation_type if i.obligation else None,
        "name_ar": rule.get("name_ar", ""),
        "priority": rule.get("priority", "medium"),
        "period_label": i.period_label,
        "period_year": i.period_year,
        "period_month": i.period_month,
        "period_quarter": i.period_quarter,
        "due_date": i.due_date.isoformat() if i.due_date else None,
        "days_remaining": days_left,
        "status": i.status,
        "tax_amount": i.tax_amount,
        "penalty": i.penalty,
        "notes": i.notes,
        "assigned_to": i.assigned_to,
        "assigned_name": i.assigned_user.name if i.assigned_user else None,
        "submitted_at": i.submitted_at.isoformat() if i.submitted_at else None,
        "paid_at": i.paid_at.isoformat() if i.paid_at else None,
    }


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
    ).order_by(ObligationInstance.due_date).limit(100).all()
    return [_serialize_instance(i) for i in items]


@router.get("/stats")
def obligations_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = datetime.utcnow()
    week_ahead = today + timedelta(days=7)
    month_ahead = today + timedelta(days=30)

    total_active = db.query(func.count(TaxObligation.id)).filter(TaxObligation.is_active == True).scalar() or 0
    upcoming_30 = db.query(func.count(ObligationInstance.id)).filter(
        ObligationInstance.due_date <= month_ahead,
        ObligationInstance.status.in_([ObligationStatus.UPCOMING, ObligationStatus.PENDING])
    ).scalar() or 0
    due_this_week = db.query(func.count(ObligationInstance.id)).filter(
        ObligationInstance.due_date <= week_ahead,
        ObligationInstance.due_date >= today,
        ObligationInstance.status.in_([ObligationStatus.UPCOMING, ObligationStatus.PENDING])
    ).scalar() or 0
    overdue = db.query(func.count(ObligationInstance.id)).filter(
        ObligationInstance.due_date < today,
        ObligationInstance.status.in_([ObligationStatus.UPCOMING, ObligationStatus.PENDING])
    ).scalar() or 0
    submitted_month = db.query(func.count(ObligationInstance.id)).filter(
        ObligationInstance.status == ObligationStatus.SUBMITTED,
        ObligationInstance.submitted_at >= date(today.year, today.month, 1),
    ).scalar() or 0
    clients_with_obligations = db.query(func.count(func.distinct(TaxObligation.client_id))).filter(
        TaxObligation.is_active == True
    ).scalar() or 0

    return {
        "total_active_obligations": total_active,
        "upcoming_30_days": upcoming_30,
        "due_this_week": due_this_week,
        "overdue": overdue,
        "submitted_this_month": submitted_month,
        "clients_with_obligations": clients_with_obligations,
    }


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
    if body.assigned_to is not None:
        inst.assigned_to = body.assigned_to
    inst.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "تم تحديث الالتزام"}


@router.delete("/{obl_id}")
def delete_obligation(
    obl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    obl = db.query(TaxObligation).filter(TaxObligation.id == obl_id).first()
    if not obl:
        raise HTTPException(404, "الالتزام غير موجود")
    obl.is_active = False
    db.commit()
    return {"message": "تم إلغاء الالتزام"}


# ─────────────────────────────────────────────────────────────────────────────
# Smart Auto-Generate — المحرك التلقائي
# ─────────────────────────────────────────────────────────────────────────────
def _auto_generate_for_client(db: Session, client: Client, months_ahead: int = 12) -> List[str]:
    """
    Core rules engine: read client.tax_obligations JSON list,
    match each to EGYPTIAN_RULES, create TaxObligation + instances.
    Returns list of created obligation types.
    """
    obligations_list = client.tax_obligations or []
    if not obligations_list:
        return []

    existing_types = {
        o.obligation_type for o in
        db.query(TaxObligation).filter(
            TaxObligation.client_id == client.id,
            TaxObligation.is_active == True
        ).all()
    }

    created = []
    for obl_type in obligations_list:
        if obl_type in existing_types:
            # ensure there are upcoming instances, generate more if needed
            obl = db.query(TaxObligation).filter(
                TaxObligation.client_id == client.id,
                TaxObligation.obligation_type == obl_type,
                TaxObligation.is_active == True,
            ).first()
            if obl:
                existing = _existing_periods(db, obl.id)
                new_instances = generate_instances_smart(obl, months_ahead)
                for inst in new_instances:
                    key = (inst.period_year, inst.period_month, inst.period_quarter)
                    if key not in existing:
                        db.add(inst)
                        existing.add(key)
            continue

        rule = EGYPTIAN_RULES.get(obl_type)
        if not rule:
            continue  # unknown obligation type — skip

        frequency = rule.get("frequency", "monthly")
        due_day = rule.get("due_day", 15)

        obl = TaxObligation(
            client_id=client.id,
            obligation_type=obl_type,
            frequency=frequency,
            due_day=due_day,
            assigned_to=client.assigned_accountant_id,
            is_active=True,
            auto_generated=True,
            start_date=datetime.utcnow(),
        )
        db.add(obl)
        db.flush()

        instances = generate_instances_smart(obl, months_ahead)
        for inst in instances:
            db.add(inst)

        created.append(obl_type)

    db.commit()
    return created


@router.post("/auto-generate/{client_id}")
def auto_generate_obligations(
    client_id: int,
    months_ahead: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Rules Engine: توليد الالتزامات تلقائياً لعميل واحد
    بناءً على client.tax_obligations JSON list
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")

    created = _auto_generate_for_client(db, client, months_ahead)
    return {
        "client_id": client_id,
        "client_name": client.name,
        "created": created,
        "obligations_list": client.tax_obligations or [],
        "message": f"تم توليد {len(created)} التزام جديد"
    }


@router.post("/bulk-generate")
def bulk_generate_obligations(
    months_ahead: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Rules Engine: توليد الالتزامات لجميع العملاء النشطين
    """
    from app.models.client import ClientStatus
    clients = db.query(Client).filter(
        Client.status == ClientStatus.ACTIVE,
        Client.tax_obligations.isnot(None),
    ).all()

    results = []
    total_created = 0
    for client in clients:
        if not client.tax_obligations:
            continue
        try:
            created = _auto_generate_for_client(db, client, months_ahead)
            if created:
                results.append({"client": client.name, "created": created})
                total_created += len(created)
        except Exception as e:
            results.append({"client": client.name, "error": str(e)})

    return {
        "processed_clients": len(clients),
        "total_obligations_created": total_created,
        "details": results,
        "message": f"تم المسح: {len(clients)} عميل — {total_created} التزام جديد"
    }


# ─────────────────────────────────────────────────────────────────────────────
# Smart Notification Generator — مولّد الإشعارات الذكي
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/refresh-notifications")
def refresh_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Scan upcoming/overdue obligations and create in-app notifications.
    Runs deduplication to avoid duplicate notifications.
    """
    today = datetime.utcnow()
    week_ahead = today + timedelta(days=7)

    # Get all admin/manager users to notify
    from app.models.user import UserRole
    admins = db.query(User).filter(
        User.is_active == True,
        User.role.in_([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT])
    ).all()
    if not admins:
        admins = [current_user]

    # Overdue instances
    overdue = db.query(ObligationInstance).filter(
        ObligationInstance.due_date < today,
        ObligationInstance.status.in_([ObligationStatus.UPCOMING, ObligationStatus.PENDING])
    ).limit(100).all()

    # Due within 7 days
    upcoming = db.query(ObligationInstance).filter(
        ObligationInstance.due_date >= today,
        ObligationInstance.due_date <= week_ahead,
        ObligationInstance.status.in_([ObligationStatus.UPCOMING, ObligationStatus.PENDING])
    ).limit(100).all()

    created_count = 0
    for user in admins:
        # Check existing notification entity IDs for this user (last 7 days)
        existing_entities = {
            n.entity_id for n in
            db.query(Notification.entity_id).filter(
                Notification.user_id == user.id,
                Notification.created_at >= today - timedelta(days=7),
                Notification.entity_type == "obligation_instance",
            ).all()
        }

        for inst in overdue:
            if inst.id in existing_entities:
                continue
            rule = EGYPTIAN_RULES.get(
                inst.obligation.obligation_type if inst.obligation else "", {}
            )
            n = Notification(
                user_id=user.id,
                title=f"⚠️ التزام متأخر — {inst.client.name if inst.client else ''}",
                message=f"{rule.get('name_ar', inst.obligation.obligation_type if inst.obligation else '')} | {inst.period_label} | متأخر {abs((inst.due_date.date()-date.today()).days)} يوم",
                type="warning",
                entity_type="obligation_instance",
                entity_id=inst.id,
                link=f"#obligations",
            )
            db.add(n)
            created_count += 1

        for inst in upcoming:
            if inst.id in existing_entities:
                continue
            days_left = (inst.due_date.date() - date.today()).days
            rule = EGYPTIAN_RULES.get(
                inst.obligation.obligation_type if inst.obligation else "", {}
            )
            n = Notification(
                user_id=user.id,
                title=f"📅 التزام قادم — {inst.client.name if inst.client else ''}",
                message=f"{rule.get('name_ar', '')} | {inst.period_label} | باقي {days_left} {'يوم' if days_left != 1 else 'يوم'}",
                type="info" if days_left > 3 else "warning",
                entity_type="obligation_instance",
                entity_id=inst.id,
                link=f"#obligations",
            )
            db.add(n)
            created_count += 1

    db.commit()
    return {"created_notifications": created_count, "message": f"تم إنشاء {created_count} إشعار جديد"}


# ─────────────────────────────────────────────────────────────────────────────
# Notifications CRUD
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/notifications")
def get_notifications(
    unread_only: bool = False,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    items = query.order_by(Notification.created_at.desc()).limit(limit).all()
    unread_count = db.query(func.count(Notification.id)).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).scalar() or 0
    return {
        "unread_count": unread_count,
        "items": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "link": n.link,
                "is_read": n.is_read,
                "entity_type": n.entity_type,
                "entity_id": n.entity_id,
                "created_at": n.created_at.isoformat()
            }
            for n in items
        ]
    }


@router.put("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "تم تعيين الكل كمقروء"}


@router.put("/notifications/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id
    ).first()
    if n:
        n.is_read = True
        db.commit()
    return {"message": "تم التعيين كمقروء"}


# ─────────────────────────────────────────────────────────────────────────────
# Client Health Score
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/health-score/{client_id}")
def client_health_score(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    حساب نقاط صحة العميل بناءً على:
    - انتظام الدفع (30 نقطة)
    - الالتزام بالإقرارات (30 نقطة)
    - اكتمال الملفات (20 نقطة)
    - إتمام المهام (20 نقطة)
    """
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.task import Task, TaskStatus
    from app.models.document import Document

    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")

    score = 0
    details = {}

    # ── 1. انتظام الدفع (30 نقطة) ────────────────────────────────────────
    total_invoices = db.query(func.count(Invoice.id)).filter(
        Invoice.client_id == client_id,
        Invoice.status != InvoiceStatus.CANCELLED
    ).scalar() or 0
    paid_invoices = db.query(func.count(Invoice.id)).filter(
        Invoice.client_id == client_id,
        Invoice.status == InvoiceStatus.PAID
    ).scalar() or 0
    overdue_invoices = db.query(func.count(Invoice.id)).filter(
        Invoice.client_id == client_id,
        Invoice.status == InvoiceStatus.OVERDUE
    ).scalar() or 0

    if total_invoices > 0:
        payment_rate = paid_invoices / total_invoices
        payment_score = round(payment_rate * 30)
        if overdue_invoices > 0:
            payment_score = max(0, payment_score - overdue_invoices * 5)
    else:
        payment_score = 20  # default for new clients
    payment_score = min(30, max(0, payment_score))
    score += payment_score
    details["payment"] = {
        "score": payment_score,
        "max": 30,
        "paid": paid_invoices,
        "total": total_invoices,
        "overdue": overdue_invoices,
    }

    # ── 2. الالتزام بالإقرارات (30 نقطة) ──────────────────────────────────
    total_instances = db.query(func.count(ObligationInstance.id)).filter(
        ObligationInstance.client_id == client_id
    ).scalar() or 0
    submitted = db.query(func.count(ObligationInstance.id)).filter(
        ObligationInstance.client_id == client_id,
        ObligationInstance.status.in_([ObligationStatus.SUBMITTED, "paid"])
    ).scalar() or 0
    late_instances = db.query(func.count(ObligationInstance.id)).filter(
        ObligationInstance.client_id == client_id,
        ObligationInstance.status == ObligationStatus.LATE
    ).scalar() or 0

    if total_instances > 0:
        compliance_rate = submitted / total_instances
        compliance_score = round(compliance_rate * 30)
        compliance_score = max(0, compliance_score - late_instances * 3)
    else:
        compliance_score = 20
    compliance_score = min(30, max(0, compliance_score))
    score += compliance_score
    details["compliance"] = {
        "score": compliance_score,
        "max": 30,
        "submitted": submitted,
        "total": total_instances,
        "late": late_instances,
    }

    # ── 3. اكتمال الملفات (20 نقطة) ───────────────────────────────────────
    doc_count = db.query(func.count(Document.id)).filter(
        Document.client_id == client_id,
        Document.is_archived == False
    ).scalar() or 0
    # 5+ docs = full score, scale linearly
    doc_score = min(20, doc_count * 4)
    score += doc_score
    details["documents"] = {
        "score": doc_score,
        "max": 20,
        "count": doc_count,
    }

    # ── 4. إتمام المهام (20 نقطة) ─────────────────────────────────────────
    total_tasks = db.query(func.count(Task.id)).filter(
        Task.client_id == client_id
    ).scalar() or 0
    done_tasks = db.query(func.count(Task.id)).filter(
        Task.client_id == client_id,
        Task.status == TaskStatus.DONE
    ).scalar() or 0

    if total_tasks > 0:
        task_rate = done_tasks / total_tasks
        task_score = round(task_rate * 20)
    else:
        task_score = 15
    score += task_score
    details["tasks"] = {
        "score": task_score,
        "max": 20,
        "done": done_tasks,
        "total": total_tasks,
    }

    # ── Rating ─────────────────────────────────────────────────────────────
    if score >= 80:
        rating = "excellent"
        rating_ar = "ممتاز"
        color = "#16a34a"
    elif score >= 60:
        rating = "good"
        rating_ar = "جيد"
        color = "#2563eb"
    elif score >= 40:
        rating = "average"
        rating_ar = "متوسط"
        color = "#d97706"
    else:
        rating = "at_risk"
        rating_ar = "عالي الخطورة"
        color = "#dc2626"

    return {
        "client_id": client_id,
        "client_name": client.name,
        "score": score,
        "max_score": 100,
        "rating": rating,
        "rating_ar": rating_ar,
        "color": color,
        "details": details,
    }
