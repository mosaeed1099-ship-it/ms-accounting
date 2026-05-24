from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional
from pydantic import BaseModel
from datetime import date
from app.database import get_db
from app.models.invoice import Invoice, InvoiceItem, Payment, InvoiceStatus, PaymentMethod, ServiceType
from app.models.client import Client
from app.models.activity import ActivityLog
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


class InvoiceItemIn(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float
    tax_percent: float = 0
    sort_order: int = 0


class InvoiceCreate(BaseModel):
    client_id: int
    issue_date: date
    due_date: Optional[date] = None
    service_type: Optional[ServiceType] = ServiceType.ACCOUNTING
    is_monthly_fee: bool = False
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    period_label: Optional[str] = None
    included_obligations: Optional[list] = []
    discount_percent: float = 0
    tax_percent: float = 0
    stamp_tax: float = 0
    withholding_tax: float = 0
    description: Optional[str] = None
    notes: Optional[str] = None
    items: List[InvoiceItemIn]


class PaymentCreate(BaseModel):
    invoice_id: int
    amount: float
    payment_date: date
    payment_method: Optional[PaymentMethod] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


def generate_invoice_number(db: Session) -> str:
    count = db.query(func.count(Invoice.id)).scalar()
    from datetime import datetime
    year = datetime.now().year
    return f"INV-{year}-{str(count + 1).zfill(4)}"


def calculate_invoice(items: List[InvoiceItemIn], discount_percent: float, tax_percent: float,
                       stamp_tax: float, withholding_tax: float) -> dict:
    subtotal = sum(item.quantity * item.unit_price for item in items)
    discount_amount = subtotal * (discount_percent / 100)
    taxable = subtotal - discount_amount
    tax_amount = taxable * (tax_percent / 100)
    total = taxable + tax_amount + stamp_tax - withholding_tax
    return {
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "total": total,
    }


def invoice_to_dict(invoice: Invoice) -> dict:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "client_id": invoice.client_id,
        "client_name": invoice.client.name if invoice.client else None,
        "service_type": invoice.service_type,
        "is_monthly_fee": invoice.is_monthly_fee,
        "period_month": invoice.period_month,
        "period_year": invoice.period_year,
        "period_label": invoice.period_label,
        "included_obligations": invoice.included_obligations or [],
        "status": invoice.status,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "payment_date": invoice.payment_date,
        "subtotal": invoice.subtotal,
        "discount_percent": invoice.discount_percent,
        "discount_amount": invoice.discount_amount,
        "tax_percent": invoice.tax_percent,
        "tax_amount": invoice.tax_amount,
        "stamp_tax": invoice.stamp_tax,
        "withholding_tax": invoice.withholding_tax,
        "total": invoice.total,
        "paid_amount": invoice.paid_amount,
        "remaining": invoice.remaining,
        "description": invoice.description,
        "notes": invoice.notes,
        "payment_method": invoice.payment_method,
        "created_at": invoice.created_at,
        "items": [
            {
                "id": item.id,
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total": item.total,
                "tax_percent": item.tax_percent,
            }
            for item in invoice.items
        ],
        "payments": [
            {
                "id": p.id,
                "amount": p.amount,
                "payment_date": p.payment_date,
                "payment_method": p.payment_method,
                "reference": p.reference,
            }
            for p in invoice.payments
        ],
    }


@router.get("")
async def list_invoices(
    client_id: Optional[int] = None,
    status: Optional[InvoiceStatus] = None,
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Invoice)
    if client_id:
        query = query.filter(Invoice.client_id == client_id)
    if status:
        query = query.filter(Invoice.status == status)
    if q:
        query = query.join(Client).filter(
            Client.name.ilike(f"%{q}%") | Invoice.invoice_number.ilike(f"%{q}%")
        )
    total = query.count()
    invoices = query.order_by(Invoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "items": [invoice_to_dict(i) for i in invoices]}


@router.get("/summary")
async def invoice_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_revenue = db.query(func.sum(Invoice.total)).filter(Invoice.status != InvoiceStatus.CANCELLED).scalar() or 0
    total_paid = db.query(func.sum(Invoice.paid_amount)).scalar() or 0
    total_overdue = db.query(func.sum(Invoice.remaining)).filter(Invoice.status == InvoiceStatus.OVERDUE).scalar() or 0
    count_pending = db.query(func.count(Invoice.id)).filter(Invoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PARTIAL])).scalar()
    return {
        "total_revenue": total_revenue,
        "total_paid": total_paid,
        "total_remaining": total_revenue - total_paid,
        "total_overdue": total_overdue,
        "count_pending": count_pending,
    }


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    return invoice_to_dict(invoice)


@router.post("")
async def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")

    calcs = calculate_invoice(data.items, data.discount_percent, data.tax_percent, data.stamp_tax, data.withholding_tax)

    invoice = Invoice(
        invoice_number=generate_invoice_number(db),
        client_id=data.client_id,
        issue_date=data.issue_date,
        due_date=data.due_date,
        service_type=data.service_type,
        is_monthly_fee=data.is_monthly_fee,
        period_month=data.period_month,
        period_year=data.period_year,
        period_label=data.period_label,
        included_obligations=data.included_obligations or [],
        discount_percent=data.discount_percent,
        tax_percent=data.tax_percent,
        stamp_tax=data.stamp_tax,
        withholding_tax=data.withholding_tax,
        description=data.description,
        notes=data.notes,
        created_by=current_user.id,
        **calcs,
        remaining=calcs["total"],
    )
    db.add(invoice)
    db.flush()

    for item_data in data.items:
        item = InvoiceItem(
            invoice_id=invoice.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            total=item_data.quantity * item_data.unit_price,
            tax_percent=item_data.tax_percent,
            sort_order=item_data.sort_order,
        )
        db.add(item)

    db.commit()
    db.refresh(invoice)
    return invoice_to_dict(invoice)


@router.put("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: int,
    status: InvoiceStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    invoice.status = status
    db.commit()
    return {"message": "تم تحديث حالة الفاتورة", "status": status}


@router.post("/payments")
async def record_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == data.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")

    payment = Payment(
        invoice_id=data.invoice_id,
        client_id=invoice.client_id,
        amount=data.amount,
        payment_date=data.payment_date,
        payment_method=data.payment_method,
        reference=data.reference,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(payment)

    invoice.paid_amount += data.amount
    invoice.remaining = invoice.total - invoice.paid_amount
    if invoice.remaining <= 0:
        invoice.status = InvoiceStatus.PAID
        invoice.payment_date = data.payment_date
    elif invoice.paid_amount > 0:
        invoice.status = InvoiceStatus.PARTIAL

    invoice.client.balance -= data.amount
    db.commit()

    return {"message": "تم تسجيل الدفعة بنجاح", "remaining": invoice.remaining}
