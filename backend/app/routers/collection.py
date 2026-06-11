"""
نظام التحصيلات — Collections Router
يدير تحصيلات التأسيس والأتعاب الشهرية المتكررة
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime

from app.database import get_db
from app.core.deps import get_current_user
from app.models.collection import (
    CollectionContract, CollectionPayment, CollectionExpense, MonthlyDue,
    CollectionType, PaymentStatus, PaymentMethod
)
from app.models.client import Client
from app.models.user import User

router = APIRouter(prefix="/api/collections", tags=["collections"])

ARABIC_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
                  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class ContractCreate(BaseModel):
    client_id: Optional[int] = None
    client_name_free: Optional[str] = None     # اسم حر — بديل عن client_id
    collection_type: CollectionType
    title: str
    agreed_amount: float
    service_description: Optional[str] = None
    monthly_amount: Optional[float] = 0
    is_recurring: Optional[bool] = False
    recurring_day: Optional[int] = 1
    assigned_to: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None


class ExpenseCreate(BaseModel):
    description: str
    category: Optional[str] = None
    amount: float
    expense_date: Optional[date] = None
    notes: Optional[str] = None


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    agreed_amount: Optional[float] = None
    service_description: Optional[str] = None
    monthly_amount: Optional[float] = None
    is_recurring: Optional[bool] = None
    recurring_day: Optional[int] = None
    assigned_to: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class PaymentCreate(BaseModel):
    contract_id: int
    amount: float
    payment_date: date
    payment_method: Optional[PaymentMethod] = PaymentMethod.CASH
    reference: Optional[str] = None
    notes: Optional[str] = None
    period_month: Optional[int] = None
    period_year: Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def contract_to_dict(c: CollectionContract) -> dict:
    total_expenses = sum(e.amount for e in c.expenses) if c.expenses else 0
    net_profit = (c.total_paid or 0) - total_expenses
    profit_pct = round(net_profit / c.total_paid * 100, 1) if c.total_paid else 0
    return {
        "id": c.id,
        "client_id": c.client_id,
        "client_name": c.client.name if c.client else (c.client_name_free or None),
        "client_name_free": c.client_name_free,
        "collection_type": c.collection_type,
        "title": c.title,
        "agreed_amount": c.agreed_amount,
        "service_description": c.service_description,
        "monthly_amount": c.monthly_amount,
        "is_recurring": c.is_recurring,
        "recurring_day": c.recurring_day,
        "total_paid": c.total_paid,
        "total_remaining": c.total_remaining,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "profit_pct": profit_pct,
        "status": c.status,
        "assigned_to": c.assigned_to,
        "assigned_name": c.assigned_user.name if c.assigned_user else None,
        "start_date": c.start_date,
        "end_date": c.end_date,
        "is_active": c.is_active,
        "notes": c.notes,
        "created_at": c.created_at,
        "payments_count": len(c.payments),
        "payments": [
            {
                "id": p.id,
                "amount": p.amount,
                "payment_date": p.payment_date,
                "payment_method": p.payment_method,
                "reference": p.reference,
                "notes": p.notes,
                "period_month": p.period_month,
                "period_year": p.period_year,
                "collected_by": p.collected_by,
                "collector_name": p.collector.name if p.collector else None,
                "created_at": p.created_at,
            }
            for p in c.payments
        ],
        "expenses": [
            {
                "id": e.id,
                "description": e.description,
                "category": e.category,
                "amount": e.amount,
                "expense_date": e.expense_date,
                "notes": e.notes,
            }
            for e in c.expenses
        ],
    }


def update_contract_totals(contract: CollectionContract, db: Session):
    """إعادة حساب المدفوع والمتبقي وتحديث الحالة"""
    total_paid = db.query(func.sum(CollectionPayment.amount)).filter(
        CollectionPayment.contract_id == contract.id
    ).scalar() or 0
    contract.total_paid = total_paid
    contract.total_remaining = max(0, contract.agreed_amount - total_paid)

    if total_paid == 0:
        contract.status = PaymentStatus.UNPAID.value
    elif contract.total_remaining <= 0:
        contract.status = PaymentStatus.PAID.value
    else:
        contract.status = PaymentStatus.PARTIAL.value


# ── Contracts CRUD ────────────────────────────────────────────────────────────

@router.get("")
def list_contracts(
    client_id: Optional[int] = None,
    collection_type: Optional[CollectionType] = None,
    status: Optional[PaymentStatus] = None,
    is_active: Optional[bool] = None,
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(CollectionContract)
    if client_id:
        query = query.filter(CollectionContract.client_id == client_id)
    if collection_type:
        query = query.filter(CollectionContract.collection_type == collection_type)
    if status:
        query = query.filter(CollectionContract.status == status)
    if is_active is not None:
        query = query.filter(CollectionContract.is_active == is_active)
    if q:
        query = query.join(Client).filter(
            Client.name.ilike(f"%{q}%") | Client.trade_name.ilike(f"%{q}%") | CollectionContract.title.ilike(f"%{q}%")
        )
    total = query.count()
    contracts = query.order_by(CollectionContract.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "items": [contract_to_dict(c) for c in contracts]}


@router.get("/summary")
def collections_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """إجماليات التحصيلات للداشبورد"""
    total_agreed = db.query(func.sum(CollectionContract.agreed_amount)).filter(
        CollectionContract.is_active == True
    ).scalar() or 0
    total_collected = db.query(func.sum(CollectionContract.total_paid)).filter(
        CollectionContract.is_active == True
    ).scalar() or 0
    total_remaining = db.query(func.sum(CollectionContract.total_remaining)).filter(
        CollectionContract.is_active == True
    ).scalar() or 0
    overdue_count = db.query(func.count(CollectionContract.id)).filter(
        CollectionContract.status == PaymentStatus.OVERDUE
    ).scalar() or 0

    # monthly dues stats
    current_month = datetime.now().month
    current_year = datetime.now().year
    monthly_due = db.query(func.sum(MonthlyDue.amount_due)).filter(
        MonthlyDue.period_month == current_month,
        MonthlyDue.period_year == current_year
    ).scalar() or 0
    monthly_paid = db.query(func.sum(MonthlyDue.amount_paid)).filter(
        MonthlyDue.period_month == current_month,
        MonthlyDue.period_year == current_year
    ).scalar() or 0

    return {
        "total_agreed": total_agreed,
        "total_collected": total_collected,
        "total_remaining": total_remaining,
        "overdue_count": overdue_count,
        "current_month_due": monthly_due,
        "current_month_paid": monthly_paid,
        "current_month_remaining": monthly_due - monthly_paid,
    }


@router.get("/{contract_id}")
def get_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(CollectionContract).filter(CollectionContract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "عقد التحصيل غير موجود")
    return contract_to_dict(c)


@router.post("")
def create_contract(
    data: ContractCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.client_id and not data.client_name_free:
        raise HTTPException(400, "يجب تحديد العميل أو كتابة اسمه")

    client = None
    if data.client_id:
        client = db.query(Client).filter(Client.id == data.client_id).first()
        if not client:
            raise HTTPException(404, "العميل غير موجود")

    contract = CollectionContract(
        client_id=data.client_id,
        client_name_free=data.client_name_free,
        collection_type=data.collection_type,
        title=data.title,
        agreed_amount=data.agreed_amount,
        service_description=data.service_description,
        monthly_amount=data.monthly_amount or 0,
        is_recurring=data.is_recurring or False,
        recurring_day=data.recurring_day or 1,
        assigned_to=data.assigned_to,
        start_date=data.start_date,
        end_date=data.end_date,
        notes=data.notes,
        total_paid=0,
        total_remaining=data.agreed_amount,
        status=PaymentStatus.UNPAID,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(contract)
    db.flush()

    # إنشاء الاستحقاقات الشهرية إذا كان أتعاب شهرية متكررة
    if data.collection_type == CollectionType.MONTHLY_FEE and data.is_recurring and data.monthly_amount:
        _generate_monthly_dues(contract, db, months=3)

    db.commit()
    db.refresh(contract)
    return contract_to_dict(contract)


@router.put("/{contract_id}")
def update_contract(
    contract_id: int,
    data: ContractUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = db.query(CollectionContract).filter(CollectionContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "عقد التحصيل غير موجود")

    updates = data.dict(exclude_none=True)
    for field, value in updates.items():
        setattr(contract, field, value)

    db.commit()
    db.refresh(contract)
    return contract_to_dict(contract)


@router.delete("/{contract_id}")
def delete_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = db.query(CollectionContract).filter(CollectionContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "عقد التحصيل غير موجود")
    # حذف الاستحقاقات الشهرية أولاً (FK constraint)
    db.query(MonthlyDue).filter(MonthlyDue.contract_id == contract_id).delete(synchronize_session=False)
    db.delete(contract)
    db.commit()
    return {"message": "تم حذف عقد التحصيل"}


# ── Payments ──────────────────────────────────────────────────────────────────

@router.post("/payments")
def add_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = db.query(CollectionContract).filter(CollectionContract.id == data.contract_id).first()
    if not contract:
        raise HTTPException(404, "عقد التحصيل غير موجود")

    # Explicitly use .value to avoid Python 3.11 str(Enum) returning "EnumClass.NAME"
    pm_val = data.payment_method.value if hasattr(data.payment_method, 'value') else str(data.payment_method)
    payment = CollectionPayment(
        contract_id=data.contract_id,
        client_id=contract.client_id or None,
        amount=data.amount,
        payment_date=data.payment_date,
        payment_method=pm_val,
        reference=data.reference,
        notes=data.notes,
        period_month=data.period_month,
        period_year=data.period_year,
        collected_by=current_user.id,
    )
    db.add(payment)
    db.flush()

    # تحديث الإجماليات
    update_contract_totals(contract, db)

    # تحديث الاستحقاق الشهري إذا وُجد
    if data.period_month and data.period_year:
        due = db.query(MonthlyDue).filter(
            MonthlyDue.contract_id == data.contract_id,
            MonthlyDue.period_month == data.period_month,
            MonthlyDue.period_year == data.period_year,
        ).first()
        if due:
            due.amount_paid = (due.amount_paid or 0) + data.amount
            due.amount_remaining = max(0, due.amount_due - due.amount_paid)
            if due.amount_remaining <= 0:
                due.status = PaymentStatus.PAID
                due.paid_date = data.payment_date
            elif due.amount_paid > 0:
                due.status = PaymentStatus.PARTIAL

    # Auto-capture → Office Revenue
    try:
        from app.routers.office_finance import auto_capture_revenue
        from app.models.client import Client
        client = db.query(Client).filter(Client.id == contract.client_id).first() if contract.client_id else None
        client_display = client.name if client else (contract.client_name_free or str(contract.client_id or ''))
        auto_capture_revenue(
            db, amount=data.amount, category="accounting",
            tx_date=data.payment_date,
            description=f"تحصيل محاسبة — {client_display}",
            client_name=client_display,
            source_type="collection", source_id=payment.id,
            created_by=current_user.id,
        )
    except Exception:
        pass  # never break the main flow
    db.commit()
    return {"message": "تم تسجيل الدفعة بنجاح", "remaining": contract.total_remaining}


@router.delete("/payments/{payment_id}")
def delete_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = db.query(CollectionPayment).filter(CollectionPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "الدفعة غير موجودة")
    contract = payment.contract
    db.delete(payment)
    db.flush()
    update_contract_totals(contract, db)
    db.commit()
    return {"message": "تم حذف الدفعة"}


# ── Expenses ─────────────────────────────────────────────────────────────────

@router.post("/{contract_id}/expenses")
def add_expense(
    contract_id: int,
    data: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = db.query(CollectionContract).filter(CollectionContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "العقد غير موجود")
    expense = CollectionExpense(
        contract_id=contract_id,
        description=data.description,
        category=data.category,
        amount=data.amount,
        expense_date=data.expense_date,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(contract)
    return contract_to_dict(contract)


@router.delete("/{contract_id}/expenses/{expense_id}")
def delete_expense(
    contract_id: int,
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = db.query(CollectionExpense).filter(
        CollectionExpense.id == expense_id,
        CollectionExpense.contract_id == contract_id,
    ).first()
    if not expense:
        raise HTTPException(404, "المصروف غير موجود")
    db.delete(expense)
    db.commit()
    return {"message": "تم حذف المصروف"}


# ── Monthly Dues ──────────────────────────────────────────────────────────────

@router.get("/monthly-dues/list")
def list_monthly_dues(
    month: Optional[int] = None,
    year: Optional[int] = None,
    client_id: Optional[int] = None,
    status: Optional[PaymentStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(MonthlyDue)
    if month:
        query = query.filter(MonthlyDue.period_month == month)
    if year:
        query = query.filter(MonthlyDue.period_year == year)
    if client_id:
        query = query.filter(MonthlyDue.client_id == client_id)
    if status:
        query = query.filter(MonthlyDue.status == status)
    items = query.order_by(MonthlyDue.period_year.desc(), MonthlyDue.period_month.desc()).all()
    return [
        {
            "id": d.id,
            "contract_id": d.contract_id,
            "client_id": d.client_id,
            "client_name": d.client.name if d.client else None,
            "period_month": d.period_month,
            "period_year": d.period_year,
            "period_label": d.period_label,
            "amount_due": d.amount_due,
            "amount_paid": d.amount_paid,
            "amount_remaining": d.amount_remaining,
            "status": d.status,
            "due_date": d.due_date,
            "paid_date": d.paid_date,
        }
        for d in items
    ]


@router.post("/monthly-dues/generate")
def generate_monthly_dues(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """توليد الاستحقاقات الشهرية لشهر معين لجميع العقود المتكررة"""
    contracts = db.query(CollectionContract).filter(
        CollectionContract.collection_type == CollectionType.MONTHLY_FEE,
        CollectionContract.is_recurring == True,
        CollectionContract.is_active == True,
    ).all()

    created = 0
    for contract in contracts:
        exists = db.query(MonthlyDue).filter(
            MonthlyDue.contract_id == contract.id,
            MonthlyDue.period_month == month,
            MonthlyDue.period_year == year,
        ).first()
        if not exists:
            due_day = contract.recurring_day or 1
            try:
                due_date = date(year, month, min(due_day, 28))
            except ValueError:
                due_date = date(year, month, 1)
            period_label = f"{ARABIC_MONTHS[month-1]} {year}"
            monthly_due = MonthlyDue(
                contract_id=contract.id,
                client_id=contract.client_id,
                period_month=month,
                period_year=year,
                period_label=period_label,
                amount_due=contract.monthly_amount,
                amount_paid=0,
                amount_remaining=contract.monthly_amount,
                status=PaymentStatus.UNPAID,
                due_date=due_date,
            )
            db.add(monthly_due)
            created += 1

    db.commit()
    period_label = f"{ARABIC_MONTHS[month-1]} {year}"
    return {"message": f"تم إنشاء {created} استحقاق شهري لشهر {period_label}", "created": created}


# ── Internal Helper ───────────────────────────────────────────────────────────

def _generate_monthly_dues(contract: CollectionContract, db: Session, months: int = 3):
    """إنشاء استحقاقات شهرية للأشهر القادمة"""
    today = datetime.now()
    for i in range(months):
        m = today.month + i
        y = today.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        exists = db.query(MonthlyDue).filter(
            MonthlyDue.contract_id == contract.id,
            MonthlyDue.period_month == m,
            MonthlyDue.period_year == y,
        ).first()
        if not exists:
            due_day = contract.recurring_day or 1
            try:
                due_date = date(y, m, min(due_day, 28))
            except ValueError:
                due_date = date(y, m, 1)
            period_label = f"{ARABIC_MONTHS[m-1]} {y}"
            db.add(MonthlyDue(
                contract_id=contract.id,
                client_id=contract.client_id,
                period_month=m,
                period_year=y,
                period_label=period_label,
                amount_due=contract.monthly_amount,
                amount_paid=0,
                amount_remaining=contract.monthly_amount,
                status=PaymentStatus.UNPAID,
                due_date=due_date,
            ))
