"""
Reports Router — التقارير المالية الشاملة
  /api/reports/aging          — تقرير تقادم الديون
  /api/reports/cashflow       — التدفق النقدي
  /api/reports/summary        — ملخص مالي عام للمكتب
  /api/reports/clients-profit — ربحية كل عميل
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case
from typing import Optional
from datetime import date, timedelta
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.invoice import Invoice, Payment, InvoiceStatus
from app.models.client import Client, ClientStatus
from app.models.collection import CollectionPayment
from app.models.accounting import AccTreasuryTx, AccTreasury

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ── 1. Aging Report ───────────────────────────────────────────────────────────

@router.get("/aging")
def aging_report(
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """تقرير تقادم الديون — يصنف الفواتير غير المدفوعة حسب عمرها"""
    today = as_of or date.today()

    unpaid = db.query(Invoice, Client).join(
        Client, Invoice.client_id == Client.id
    ).filter(
        Invoice.status.in_(["sent", "overdue", "partial"])
    ).all()

    buckets = {
        "current": [],     # 0-30 يوم
        "days_31_60": [],  # 31-60
        "days_61_90": [],  # 61-90
        "over_90": [],     # +90
    }
    totals = {k: 0.0 for k in buckets}
    grand_total = 0.0

    for inv, client in unpaid:
        paid = db.query(func.sum(Payment.amount)).filter(
            Payment.invoice_id == inv.id).scalar() or 0
        remaining = round((inv.total or 0) - paid, 2)
        if remaining <= 0:
            continue

        due = inv.due_date or inv.created_at.date() if inv.created_at else today
        age = (today - due).days if hasattr(due, 'year') else 0

        row = {
            "invoice_id": inv.id,
            "client_id": client.id,
            "client_name": client.name,
            "invoice_number": inv.invoice_number,
            "due_date": str(due),
            "age_days": age,
            "total_amount": inv.total,
            "paid": paid,
            "remaining": remaining,
        }

        if age <= 30:
            buckets["current"].append(row)
            totals["current"] += remaining
        elif age <= 60:
            buckets["days_31_60"].append(row)
            totals["days_31_60"] += remaining
        elif age <= 90:
            buckets["days_61_90"].append(row)
            totals["days_61_90"] += remaining
        else:
            buckets["over_90"].append(row)
            totals["over_90"] += remaining

        grand_total += remaining

    return {
        "as_of": str(today),
        "buckets": buckets,
        "totals": {k: round(v, 2) for k, v in totals.items()},
        "grand_total": round(grand_total, 2),
    }


# ── 2. Cash Flow ──────────────────────────────────────────────────────────────

@router.get("/cashflow")
def cashflow_report(
    year: int = Query(...),
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """تقرير التدفق النقدي من حركات الخزائن"""
    q = db.query(AccTreasuryTx).filter(AccTreasuryTx.date.isnot(None))
    if year:
        q = q.filter(func.extract("year", AccTreasuryTx.date) == year)
    if month:
        q = q.filter(func.extract("month", AccTreasuryTx.date) == month)

    txs = q.all()

    inflows = [t for t in txs if t.tx_type in ("deposit", "transfer_in")]
    outflows = [t for t in txs if t.tx_type in ("withdrawal", "transfer_out")]

    total_in  = round(sum(t.amount for t in inflows), 2)
    total_out = round(sum(t.amount for t in outflows), 2)

    # Payments received on invoices
    inv_q = db.query(func.sum(Payment.amount)).filter(
        func.extract("year", Payment.payment_date) == year)
    if month:
        inv_q = inv_q.filter(func.extract("month", Payment.payment_date) == month)
    inv_received = round(inv_q.scalar() or 0, 2)

    return {
        "year": year,
        "month": month,
        "total_inflows": total_in,
        "total_outflows": total_out,
        "net_cashflow": round(total_in - total_out, 2),
        "invoice_payments_received": inv_received,
        "inflows": [{"date": str(t.date), "amount": t.amount,
                     "type": t.tx_type, "desc": t.description} for t in inflows],
        "outflows": [{"date": str(t.date), "amount": t.amount,
                      "type": t.tx_type, "desc": t.description} for t in outflows],
    }


# ── 3. Office Financial Summary ───────────────────────────────────────────────

@router.get("/summary")
def financial_summary(
    year: int = Query(...),
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """ملخص مالي سريع للمكتب"""
    # Invoices issued
    inv_q = db.query(func.sum(Invoice.total)).filter(
        func.extract("year", Invoice.created_at) == year)
    if month:
        inv_q = inv_q.filter(func.extract("month", Invoice.created_at) == month)
    total_invoiced = round(inv_q.scalar() or 0, 2)

    # Payments received
    pay_q = db.query(func.sum(Payment.amount)).filter(
        func.extract("year", Payment.payment_date) == year)
    if month:
        pay_q = pay_q.filter(func.extract("month", Payment.payment_date) == month)
    total_collected = round(pay_q.scalar() or 0, 2)

    outstanding = round(total_invoiced - total_collected, 2)

    # Count invoices by status
    status_counts = {}
    for s in ["draft", "sent", "paid", "overdue", "partial", "cancelled"]:
        cnt_q = db.query(func.count(Invoice.id)).filter(Invoice.status == s)
        if year:
            cnt_q = cnt_q.filter(func.extract("year", Invoice.created_at) == year)
        status_counts[s] = cnt_q.scalar() or 0

    total_clients = db.query(func.count(Client.id)).scalar() or 0
    active_clients = db.query(func.count(Client.id)).filter(Client.status == ClientStatus.ACTIVE).scalar() or 0

    return {
        "year": year,
        "month": month,
        "total_invoiced": total_invoiced,
        "total_collected": total_collected,
        "outstanding": outstanding,
        "collection_rate": round(total_collected / total_invoiced * 100, 1) if total_invoiced else 0,
        "invoice_status": status_counts,
        "total_clients": total_clients,
        "active_clients": active_clients,
    }


# ── 4. Client Profitability ───────────────────────────────────────────────────

@router.get("/clients-profit")
def clients_profit(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """ربحية كل عميل — إجمالي الأتعاب والمُحصَّل"""
    q = db.query(
        Client.id,
        Client.name,
        func.sum(Invoice.total).label("total_invoiced"),
        func.count(Invoice.id).label("invoice_count")
    ).outerjoin(Invoice, Invoice.client_id == Client.id)

    if year:
        q = q.filter(
            (Invoice.id == None) |
            (func.extract("year", Invoice.created_at) == year)
        )

    rows = q.group_by(Client.id, Client.name).order_by(
        func.sum(Invoice.total).desc().nullslast()
    ).all()

    result = []
    for r in rows:
        pay_q = db.query(func.sum(Payment.amount)).join(
            Invoice, Payment.invoice_id == Invoice.id
        ).filter(Invoice.client_id == r.id)
        if year:
            pay_q = pay_q.filter(func.extract("year", Payment.payment_date) == year)
        collected = round(pay_q.scalar() or 0, 2)
        invoiced  = round(r.total_invoiced or 0, 2)
        result.append({
            "client_id": r.id,
            "client_name": r.name,
            "total_invoiced": invoiced,
            "total_collected": collected,
            "outstanding": round(invoiced - collected, 2),
            "invoice_count": r.invoice_count or 0,
            "collection_rate": round(collected / invoiced * 100, 1) if invoiced else 0,
        })

    return result
