from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel
from datetime import date
from app.database import get_db
from app.models.tax import TaxReturn, TaxReturnType, TaxReturnStatus
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/tax", tags=["tax"])


class TaxReturnCreate(BaseModel):
    client_id: int
    return_type: TaxReturnType
    period_year: int
    period_month: Optional[int] = None
    period_quarter: Optional[int] = None
    due_date: Optional[date] = None
    tax_amount: float = 0
    notes: Optional[str] = None
    assigned_to: Optional[int] = None


class TaxReturnUpdate(BaseModel):
    status: Optional[TaxReturnStatus] = None
    submission_date: Optional[date] = None
    tax_amount: Optional[float] = None
    penalty: Optional[float] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None


RETURN_TYPE_LABELS = {
    TaxReturnType.VAT_MONTHLY: "ضريبة القيمة المضافة - شهري",
    TaxReturnType.VAT_QUARTERLY: "ضريبة القيمة المضافة - ربع سنوي",
    TaxReturnType.INCOME_ANNUAL: "ضريبة الدخل - سنوي",
    TaxReturnType.WITHHOLDING: "ضريبة الخصم والإضافة",
    TaxReturnType.STAMP_TAX: "ضريبة الدمغة",
    TaxReturnType.SALARY_TAX: "ضريبة المرتبات",
}


def tax_to_dict(r: TaxReturn) -> dict:
    return {
        "id": r.id,
        "client_id": r.client_id,
        "client_name": r.client.name if r.client else None,
        "return_type": r.return_type,
        "return_type_label": RETURN_TYPE_LABELS.get(r.return_type, r.return_type),
        "status": r.status,
        "period_year": r.period_year,
        "period_month": r.period_month,
        "period_quarter": r.period_quarter,
        "due_date": r.due_date,
        "submission_date": r.submission_date,
        "tax_amount": r.tax_amount,
        "penalty": r.penalty,
        "reference_number": r.reference_number,
        "notes": r.notes,
        "assigned_to": r.assigned_to,
        "assigned_to_name": r.assigned_user.name if r.assigned_user else None,
        "created_at": r.created_at,
    }


@router.get("/")
async def list_tax_returns(
    client_id: Optional[int] = None,
    status: Optional[TaxReturnStatus] = None,
    return_type: Optional[TaxReturnType] = None,
    year: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(TaxReturn)
    if client_id:
        query = query.filter(TaxReturn.client_id == client_id)
    if status:
        query = query.filter(TaxReturn.status == status)
    if return_type:
        query = query.filter(TaxReturn.return_type == return_type)
    if year:
        query = query.filter(TaxReturn.period_year == year)

    total = query.count()
    items = query.order_by(TaxReturn.due_date.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "items": [tax_to_dict(r) for r in items]}


@router.get("/calendar")
async def tax_calendar(
    year: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime
    year = year or datetime.now().year
    items = db.query(TaxReturn).filter(TaxReturn.period_year == year).order_by(TaxReturn.due_date).all()
    return [tax_to_dict(r) for r in items]


@router.post("/")
async def create_tax_return(
    data: TaxReturnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tr = TaxReturn(**data.dict(), created_by=current_user.id)
    db.add(tr)
    db.commit()
    db.refresh(tr)
    return tax_to_dict(tr)


@router.put("/{tax_id}")
async def update_tax_return(
    tax_id: int,
    data: TaxReturnUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tr = db.query(TaxReturn).filter(TaxReturn.id == tax_id).first()
    if not tr:
        raise HTTPException(status_code=404, detail="الإقرار غير موجود")
    for field, value in data.dict(exclude_none=True).items():
        setattr(tr, field, value)
    db.commit()
    return tax_to_dict(tr)
