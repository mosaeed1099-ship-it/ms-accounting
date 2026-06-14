"""
Monthly Fees — المدفوعات الشهرية
All authenticated users can view. Admin only can create/edit/import.
"""
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.monthly_fees import MonthlyFeeClient, MonthlyFeeRecord, MFClientStatus
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/monthly-fees", tags=["monthly-fees"])

MONTH_AR = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
            "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]


def _auth(cu: User = Depends(get_current_user)):
    return cu


def _admin(cu: User = Depends(get_current_user)):
    if cu.role != UserRole.ADMIN:
        raise HTTPException(403, "للمدير فقط")
    return cu


def _client_dict(c: MonthlyFeeClient) -> dict:
    return {
        "id": c.id, "name": c.name,
        "monthly_fee": c.monthly_fee,
        "status": c.status.value if hasattr(c.status, 'value') else c.status,
        "notes": c.notes,
        "created_at": str(c.created_at) if c.created_at else None,
    }


def _record_dict(r: MonthlyFeeRecord) -> dict:
    return {
        "id": r.id, "client_id": r.client_id,
        "year": r.year, "month": r.month,
        "month_label": MONTH_AR[r.month] if 1 <= r.month <= 12 else str(r.month),
        "fee_amount": r.fee_amount,
        "balance_carried": r.balance_carried,
        "total_due": r.total_due,
        "paid_amount": r.paid_amount,
        "remaining": r.remaining,
        "paid": r.paid,
        "paid_date": str(r.paid_date) if r.paid_date else None,
        "bayan": r.bayan,
        "notes": r.notes,
    }


# ── Dashboard ─────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(
    year: int = Query(default=None),
    month: int = Query(default=None),
    db: Session = Depends(get_db),
    cu: User = Depends(_auth),
):
    today = date.today()
    yr = year or today.year
    mo = month or today.month

    active = db.query(MonthlyFeeClient).filter(MonthlyFeeClient.status == MFClientStatus.ACTIVE).all()
    all_clients = db.query(MonthlyFeeClient).all()
    records_month = db.query(MonthlyFeeRecord).filter(
        MonthlyFeeRecord.year == yr, MonthlyFeeRecord.month == mo
    ).all()

    total_due = sum(r.total_due for r in records_month)
    total_paid = sum(r.paid_amount for r in records_month)
    total_remaining = sum(r.remaining for r in records_month)
    paid_count = sum(1 for r in records_month if r.paid)
    unpaid_count = sum(1 for r in records_month if not r.paid)
    collection_pct = round(total_paid / total_due * 100, 1) if total_due else 0

    client_map = {c.id: c.name for c in all_clients}
    top_debtors = sorted(
        [r for r in records_month if r.remaining > 0],
        key=lambda r: r.remaining, reverse=True
    )[:5]

    return {
        "year": yr, "month": mo,
        "month_label": MONTH_AR[mo],
        "summary": {
            "total_due": total_due,
            "total_paid": total_paid,
            "total_remaining": total_remaining,
            "collection_pct": collection_pct,
        },
        "clients": {
            "active": len(active),
            "paid_this_month": paid_count,
            "unpaid_this_month": unpaid_count,
        },
        "top_debtors": [
            {"name": client_map.get(r.client_id, "—"), "remaining": r.remaining}
            for r in top_debtors
        ],
    }


# ── Clients ───────────────────────────────────────────────

@router.get("/clients")
def list_clients(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    cu: User = Depends(_auth),
):
    q = db.query(MonthlyFeeClient)
    if status:
        q = q.filter(MonthlyFeeClient.status == status)
    return [_client_dict(c) for c in q.order_by(MonthlyFeeClient.name).all()]


class ClientIn(BaseModel):
    name: str
    monthly_fee: float = 0
    status: str = "active"
    notes: Optional[str] = None


@router.post("/clients", status_code=201)
def create_client(
    data: ClientIn,
    db: Session = Depends(get_db),
    cu: User = Depends(_admin),
):
    existing = db.query(MonthlyFeeClient).filter(MonthlyFeeClient.name == data.name).first()
    if existing:
        raise HTTPException(400, f"شركة بهذا الاسم موجودة بالفعل: {data.name}")
    try:
        status_val = MFClientStatus(data.status)
    except ValueError:
        status_val = MFClientStatus.ACTIVE
    obj = MonthlyFeeClient(
        name=data.name,
        monthly_fee=data.monthly_fee,
        status=status_val,
        notes=data.notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _client_dict(obj)


class ClientUpdateIn(BaseModel):
    name: Optional[str] = None
    monthly_fee: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.put("/clients/{client_id}")
def update_client(
    client_id: int,
    data: ClientUpdateIn,
    db: Session = Depends(get_db),
    cu: User = Depends(_admin),
):
    c = db.query(MonthlyFeeClient).filter(MonthlyFeeClient.id == client_id).first()
    if not c:
        raise HTTPException(404, "عميل غير موجود")
    if data.name is not None:
        existing = db.query(MonthlyFeeClient).filter(
            MonthlyFeeClient.name == data.name,
            MonthlyFeeClient.id != client_id,
        ).first()
        if existing:
            raise HTTPException(400, f"اسم مستخدم بالفعل: {data.name}")
        c.name = data.name
    if data.monthly_fee is not None:
        c.monthly_fee = data.monthly_fee
    if data.status is not None:
        try:
            c.status = MFClientStatus(data.status)
        except ValueError:
            pass
    if data.notes is not None:
        c.notes = data.notes
    db.commit()
    return _client_dict(c)


@router.get("/clients/{client_id}/history")
def client_history(
    client_id: int,
    db: Session = Depends(get_db),
    cu: User = Depends(_auth),
):
    c = db.query(MonthlyFeeClient).filter(MonthlyFeeClient.id == client_id).first()
    if not c:
        raise HTTPException(404, "عميل غير موجود")
    records = db.query(MonthlyFeeRecord).filter(
        MonthlyFeeRecord.client_id == client_id
    ).order_by(MonthlyFeeRecord.year, MonthlyFeeRecord.month).all()

    total_paid = sum(r.paid_amount for r in records)
    total_due = sum(r.total_due for r in records)
    total_remaining = sum(r.remaining for r in records)
    last_paid = max((r.paid_date for r in records if r.paid_date), default=None)

    return {
        "client": _client_dict(c),
        "records": [_record_dict(r) for r in records],
        "summary": {
            "total_paid": total_paid,
            "total_due": total_due,
            "total_remaining": total_remaining,
            "last_paid_date": str(last_paid) if last_paid else None,
        }
    }


# ── Records (month view) ──────────────────────────────────

@router.get("/records")
def list_records(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    cu: User = Depends(_auth),
):
    records = db.query(MonthlyFeeRecord).filter(
        MonthlyFeeRecord.year == year,
        MonthlyFeeRecord.month == month,
    ).join(MonthlyFeeClient).order_by(MonthlyFeeClient.name).all()

    result = []
    for r in records:
        d = _record_dict(r)
        d["client_name"] = r.client.name
        d["monthly_fee"] = r.client.monthly_fee
        result.append(d)
    return result


class PaymentIn(BaseModel):
    paid_amount: float
    paid_date: Optional[date] = None
    bayan: Optional[str] = None
    notes: Optional[str] = None


@router.put("/records/{record_id}/pay")
def record_payment(
    record_id: int,
    data: PaymentIn,
    db: Session = Depends(get_db),
    cu: User = Depends(_admin),
):
    r = db.query(MonthlyFeeRecord).filter(MonthlyFeeRecord.id == record_id).first()
    if not r:
        raise HTTPException(404)
    r.paid_amount = data.paid_amount
    r.remaining = max(0, r.total_due - r.paid_amount)
    r.paid = r.remaining == 0
    r.paid_date = data.paid_date or date.today()
    if data.bayan:
        r.bayan = data.bayan
    if data.notes:
        r.notes = data.notes
    db.commit()
    return _record_dict(r)


class RecordUpdateIn(BaseModel):
    fee_amount: Optional[float] = None
    bayan: Optional[str] = None
    notes: Optional[str] = None


@router.put("/records/{record_id}")
def update_record(
    record_id: int,
    data: RecordUpdateIn,
    db: Session = Depends(get_db),
    cu: User = Depends(_admin),
):
    r = db.query(MonthlyFeeRecord).filter(MonthlyFeeRecord.id == record_id).first()
    if not r:
        raise HTTPException(404)
    if data.fee_amount is not None:
        r.fee_amount = data.fee_amount
        r.total_due = r.fee_amount + r.balance_carried
        r.remaining = max(0, r.total_due - r.paid_amount)
        r.paid = r.remaining == 0
    if data.bayan is not None:
        r.bayan = data.bayan
    if data.notes is not None:
        r.notes = data.notes
    db.commit()
    return _record_dict(r)


# ── Generate records for a month (create missing rows) ───

@router.post("/records/generate")
def generate_month_records(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    cu: User = Depends(_admin),
):
    """Create MonthlyFeeRecord rows for all active clients if they don't exist yet."""
    active = db.query(MonthlyFeeClient).filter(
        MonthlyFeeClient.status == MFClientStatus.ACTIVE
    ).all()

    # Previous month for carry-forward
    prev_mo = month - 1 if month > 1 else 12
    prev_yr = year if month > 1 else year - 1

    created = 0
    for c in active:
        exists = db.query(MonthlyFeeRecord).filter(
            MonthlyFeeRecord.client_id == c.id,
            MonthlyFeeRecord.year == year,
            MonthlyFeeRecord.month == month,
        ).first()
        if exists:
            continue

        prev = db.query(MonthlyFeeRecord).filter(
            MonthlyFeeRecord.client_id == c.id,
            MonthlyFeeRecord.year == prev_yr,
            MonthlyFeeRecord.month == prev_mo,
        ).first()
        carry = prev.remaining if prev else 0.0
        total = c.monthly_fee + carry

        obj = MonthlyFeeRecord(
            client_id=c.id,
            year=year,
            month=month,
            fee_amount=c.monthly_fee,
            balance_carried=carry,
            total_due=total,
            paid_amount=0,
            remaining=total,
            paid=False,
        )
        db.add(obj)
        created += 1

    db.commit()
    return {"created": created, "skipped": len(active) - created}


# ── Bulk Import (called by import script) ─────────────────

class ImportClientIn(BaseModel):
    name: str
    monthly_fee: float = 0
    status: str = "active"
    notes: Optional[str] = None


class ImportRecordIn(BaseModel):
    client_name: str
    year: int
    month: int
    fee_amount: float = 0
    paid: bool = False
    bayan: Optional[str] = None


class BulkImportIn(BaseModel):
    clients: List[ImportClientIn]
    records: List[ImportRecordIn]


@router.post("/import")
def bulk_import(
    data: BulkImportIn,
    db: Session = Depends(get_db),
    cu: User = Depends(_admin),
):
    name_to_id = {}
    for ci in data.clients:
        existing = db.query(MonthlyFeeClient).filter(
            MonthlyFeeClient.name == ci.name
        ).first()
        if existing:
            existing.monthly_fee = ci.monthly_fee
            existing.status = ci.status
            db.commit()
            name_to_id[ci.name] = existing.id
        else:
            obj = MonthlyFeeClient(
                name=ci.name,
                monthly_fee=ci.monthly_fee,
                status=ci.status,
                notes=ci.notes,
            )
            db.add(obj)
            db.commit()
            db.refresh(obj)
            name_to_id[ci.name] = obj.id

    records_saved = 0
    for ri in data.records:
        cid = name_to_id.get(ri.client_name)
        if not cid:
            continue
        existing = db.query(MonthlyFeeRecord).filter(
            MonthlyFeeRecord.client_id == cid,
            MonthlyFeeRecord.year == ri.year,
            MonthlyFeeRecord.month == ri.month,
        ).first()
        if existing:
            existing.fee_amount = ri.fee_amount
            existing.total_due = ri.fee_amount
            existing.paid = ri.paid
            existing.paid_amount = ri.fee_amount if ri.paid else 0
            existing.remaining = 0 if ri.paid else ri.fee_amount
            existing.bayan = ri.bayan
            db.commit()
        else:
            obj = MonthlyFeeRecord(
                client_id=cid,
                year=ri.year,
                month=ri.month,
                fee_amount=ri.fee_amount,
                total_due=ri.fee_amount,
                paid=ri.paid,
                paid_amount=ri.fee_amount if ri.paid else 0,
                remaining=0 if ri.paid else ri.fee_amount,
                bayan=ri.bayan or ("تم دفع" if ri.paid else ""),
            )
            db.add(obj)
            db.commit()
            records_saved += 1

    if data.records:
        _recalc_carry_forward(db, name_to_id)

    return {"clients_imported": len(name_to_id), "records_saved": records_saved}


def _recalc_carry_forward(db: Session, name_to_id: dict):
    MONTHS_ORDER = [
        (2025, 10), (2025, 11), (2025, 12),
        (2026, 1), (2026, 2), (2026, 3), (2026, 4), (2026, 5), (2026, 6),
        (2026, 7), (2026, 8), (2026, 9), (2026, 10), (2026, 11), (2026, 12),
    ]
    client_ids = list(name_to_id.values())
    all_records = db.query(MonthlyFeeRecord).filter(
        MonthlyFeeRecord.client_id.in_(client_ids)
    ).all()
    rec_map = {(r.client_id, r.year, r.month): r for r in all_records}

    for cid in client_ids:
        carry = 0.0
        for yr, mo in MONTHS_ORDER:
            r = rec_map.get((cid, yr, mo))
            if not r:
                carry = 0.0
                continue
            r.balance_carried = carry
            r.total_due = r.fee_amount + carry
            r.remaining = max(0, r.total_due - r.paid_amount)
            r.paid = r.remaining == 0
            carry = r.remaining
    db.commit()
