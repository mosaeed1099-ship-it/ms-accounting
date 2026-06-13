"""
المركز المالي — Finance Center Router
- التحصيلات: أي موظف يضيف، الموظف يشوف بتاعه اليوم فقط، المدير يشوف الكل دايماً
- المصاريف: تسويات الموظفين (تلقائي) + يدوي للمدير فقط
- الملخص وجريد الأتعاب: للمدير فقط
"""
import json
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.finance_center import FinanceCollection, FinanceManualExpense
from app.models.settlement import EmployeeSettlement
from app.models.client import Client
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/finance", tags=["finance-center"])

OWNER_EMAIL = "ms.owner@mshq.io"

PAYMENT_LABELS = {
    "cash": "كاش", "transfer": "تحويل بنكي",
    "instapay": "إنستاباي", "check": "شيك",
}

MONTH_AR = ["","يناير","فبراير","مارس","أبريل","مايو","يونيو",
            "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]

EXPENSE_CAT_AR = {
    "rent": "إيجار", "electricity": "كهرباء ومياه", "internet": "إنترنت",
    "salaries": "رواتب", "marketing": "تسويق وإعلان",
    "supplies": "مشتريات ومستلزمات", "transport": "نقل ومواصلات",
    "other": "أخرى",
}


def _is_owner(user: User) -> bool:
    return user.email == OWNER_EMAIL or user.role == UserRole.ADMIN


def _require_owner(user: User = Depends(get_current_user)):
    if not _is_owner(user):
        raise HTTPException(403, "هذه الصفحة للمدير فقط")
    return user


def _coll_dict(c: FinanceCollection, user_id: int) -> dict:
    return {
        "id": c.id,
        "date": str(c.date),
        "client_id": c.client_id,
        "client_name": c.client_name,
        "billing_month": c.billing_month,
        "billing_year": c.billing_year,
        "billing_month_label": MONTH_AR[c.billing_month] if 1 <= c.billing_month <= 12 else "",
        "collection_type": c.collection_type or "acc",
        "amount": c.amount,
        "payment_method": c.payment_method,
        "payment_method_label": PAYMENT_LABELS.get(c.payment_method, c.payment_method),
        "note": c.note or "",
        "created_by": c.created_by,
        "created_at": str(c.created_at),
        "mine": c.created_by == user_id,
    }


# ─── Collections ──────────────────────────────────────────────────────────────

class CollectionIn(BaseModel):
    date: date
    client_id: Optional[int] = None
    client_name: str
    billing_month: int
    billing_year: int
    amount: float
    collection_type: str = "acc"   # acc | est
    payment_method: str = "cash"
    note: Optional[str] = None


@router.post("/collections")
def add_collection(
    body: CollectionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = FinanceCollection(
        date=body.date,
        client_id=body.client_id,
        client_name=body.client_name,
        billing_month=body.billing_month,
        billing_year=body.billing_year,
        amount=body.amount,
        collection_type=body.collection_type,
        payment_method=body.payment_method,
        note=body.note,
        created_by=current_user.id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _coll_dict(c, current_user.id)


@router.get("/collections")
def get_collections(
    month: Optional[int] = None,
    year: Optional[int] = Query(None),
    collection_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(FinanceCollection)

    if _is_owner(current_user):
        if month:
            q = q.filter(FinanceCollection.billing_month == month)
        if year:
            q = q.filter(FinanceCollection.billing_year == year)
        if collection_type:
            q = q.filter(FinanceCollection.collection_type == collection_type)
    else:
        today = date.today()
        q = q.filter(
            FinanceCollection.created_by == current_user.id,
            FinanceCollection.date == today,
        )
        if collection_type:
            q = q.filter(FinanceCollection.collection_type == collection_type)

    rows = q.order_by(FinanceCollection.date.desc(), FinanceCollection.created_at.desc()).all()
    return [_coll_dict(r, current_user.id) for r in rows]


@router.delete("/collections/{coll_id}")
def delete_collection(
    coll_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(FinanceCollection).filter(FinanceCollection.id == coll_id).first()
    if not c:
        raise HTTPException(404, "غير موجود")
    # الموظف يحذف بتاعته فقط، المدير يحذف أي حاجة
    if not _is_owner(current_user) and c.created_by != current_user.id:
        raise HTTPException(403, "مش مسموح")
    db.delete(c)
    db.commit()
    return {"ok": True}


# ─── Expenses (Admin Only) ─────────────────────────────────────────────────────

class ManualExpenseIn(BaseModel):
    date: date
    description: str
    category: str = "other"
    amount: float
    payment_method: str = "cash"
    note: Optional[str] = None


@router.get("/expenses")
def get_expenses(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_owner),
):
    today = date.today()
    m = month or today.month
    y = year or today.year

    # تسويات الموظفين (تلقائي)
    settlements = (
        db.query(EmployeeSettlement)
        .filter(EmployeeSettlement.month == m, EmployeeSettlement.year == y)
        .order_by(EmployeeSettlement.date.desc())
        .all()
    )
    auto_expenses = []
    for s in settlements:
        items = []
        try:
            items = json.loads(s.expense_items or "[]")
        except Exception:
            pass
        auto_expenses.append({
            "id": f"s_{s.id}",
            "source": "settlement",
            "date": str(s.date),
            "description": f"تسوية {s.employee_name} — {MONTH_AR[m]}",
            "employee_name": s.employee_name,
            "amount": s.total_spent,
            "items": items,
            "notes": s.notes or "",
            "category": "salaries",
            "category_label": "تسويات الموظفين",
        })

    # مصاريف يدوية
    manual = (
        db.query(FinanceManualExpense)
        .filter(FinanceManualExpense.month == m, FinanceManualExpense.year == y)
        .order_by(FinanceManualExpense.date.desc())
        .all()
    )
    manual_expenses = [
        {
            "id": e.id,
            "source": "manual",
            "date": str(e.date),
            "description": e.description,
            "category": e.category,
            "category_label": EXPENSE_CAT_AR.get(e.category, e.category),
            "amount": e.amount,
            "payment_method": e.payment_method,
            "payment_method_label": PAYMENT_LABELS.get(e.payment_method, e.payment_method),
            "note": e.note or "",
        }
        for e in manual
    ]

    return {
        "month": m,
        "year": y,
        "auto_expenses": auto_expenses,
        "manual_expenses": manual_expenses,
        "total_auto": sum(x["amount"] for x in auto_expenses),
        "total_manual": sum(x["amount"] for x in manual_expenses),
        "total": sum(x["amount"] for x in auto_expenses) + sum(x["amount"] for x in manual_expenses),
    }


@router.post("/expenses/manual")
def add_manual_expense(
    body: ManualExpenseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_owner),
):
    e = FinanceManualExpense(
        date=body.date,
        month=body.date.month,
        year=body.date.year,
        description=body.description,
        category=body.category,
        amount=body.amount,
        payment_method=body.payment_method,
        note=body.note,
        created_by=current_user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id, "ok": True}


@router.delete("/expenses/manual/{exp_id}")
def delete_manual_expense(
    exp_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_owner),
):
    e = db.query(FinanceManualExpense).filter(FinanceManualExpense.id == exp_id).first()
    if not e:
        raise HTTPException(404, "غير موجود")
    db.delete(e)
    db.commit()
    return {"ok": True}


# ─── Summary (Admin Only) ──────────────────────────────────────────────────────

@router.get("/summary")
def get_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_owner),
):
    today = date.today()
    m = month or today.month
    y = year or today.year

    total_collected = (
        db.query(func.sum(FinanceCollection.amount))
        .filter(
            FinanceCollection.billing_month == m,
            FinanceCollection.billing_year == y,
        )
        .scalar() or 0
    )

    settlements_total = (
        db.query(func.sum(EmployeeSettlement.total_spent))
        .filter(EmployeeSettlement.month == m, EmployeeSettlement.year == y)
        .scalar() or 0
    )

    manual_total = (
        db.query(func.sum(FinanceManualExpense.amount))
        .filter(FinanceManualExpense.month == m, FinanceManualExpense.year == y)
        .scalar() or 0
    )

    total_expenses = settlements_total + manual_total
    net = total_collected - total_expenses

    # تفصيل التحصيل حسب الموظف
    by_employee = (
        db.query(User.name, func.sum(FinanceCollection.amount))
        .join(FinanceCollection, User.id == FinanceCollection.created_by)
        .filter(
            FinanceCollection.billing_month == m,
            FinanceCollection.billing_year == y,
        )
        .group_by(User.name)
        .all()
    )

    return {
        "month": m,
        "year": y,
        "month_label": MONTH_AR[m] if 1 <= m <= 12 else str(m),
        "total_collected": total_collected,
        "settlements_total": settlements_total,
        "manual_expenses_total": manual_total,
        "total_expenses": total_expenses,
        "net_profit": net,
        "profit_margin_pct": round(net / total_collected * 100, 1) if total_collected else 0,
        "collections_by_employee": [
            {"name": name or "غير معروف", "amount": float(amt or 0)} for name, amt in by_employee
        ],
    }


# ─── Fees Grid (Admin Only) ────────────────────────────────────────────────────

@router.get("/fees-grid")
def get_fees_grid(
    year: int = Query(default=2025),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clients = (
        db.query(Client)
        .filter(Client.status == "active", Client.monthly_fee > 0)
        .order_by(Client.name)
        .all()
    )

    # تحصيلات السنة كلها
    collections = (
        db.query(FinanceCollection)
        .filter(FinanceCollection.billing_year == year)
        .all()
    )

    # تجميع حسب client_id + billing_month
    coll_map: dict = {}
    for c in collections:
        key = (c.client_id, c.billing_month)
        coll_map[key] = coll_map.get(key, 0) + c.amount

    rows = []
    for client in clients:
        months_data = []
        for m in range(1, 13):
            collected = coll_map.get((client.id, m), 0)
            fee = client.monthly_fee or 0
            if collected == 0:
                status = "unpaid"
            elif collected >= fee:
                status = "paid"
            else:
                status = "partial"
            months_data.append({
                "month": m,
                "fee": fee,
                "collected": collected,
                "status": status,
            })

        total_collected = sum(x["collected"] for x in months_data)
        total_fee = (client.monthly_fee or 0) * 12
        rows.append({
            "client_id": client.id,
            "client_name": client.name,
            "client_type": client.client_type,
            "monthly_fee": client.monthly_fee or 0,
            "months": months_data,
            "total_collected": total_collected,
            "total_fee": total_fee,
            "collection_pct": round(total_collected / total_fee * 100) if total_fee else 0,
        })

    return {"year": year, "clients": rows}
