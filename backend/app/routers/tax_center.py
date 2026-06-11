"""
Tax Center Router — Egyptian Tax Module
/api/tax-center/*
"""
import logging
from datetime import datetime, date
from typing import Optional, List
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.tax_center import (
    VATReturn, VATReturnLine, WithholdingEntry, WithholdingReturn,
    WithholdingType, CorporateEstimate, SalaryTaxReturn,
    TaxPeriod, TaxCalendarEvent, TaxAuditLog,
    WHT_TYPE_SEEDS,
)
from app.services.vat_calculator import build_vat_return, recompute_totals, compute_penalty
from app.services.withholding_calculator import compute_withholding, build_withholding_return
from app.services.corporate_tax_calculator import (
    build_corporate_estimate, compute_monthly_salary_tax, compute_quarterly_installments
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tax-center", tags=["Tax Center"])

MONTH_NAMES_AR = [
    "يناير","فبراير","مارس","أبريل","مايو","يونيو",
    "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"
]

PORTAL_URLS = {
    "vat_monthly":         "https://mytax.eta.gov.eg",
    "withholding_monthly": "https://mytax.eta.gov.eg",
    "salary_monthly":      "https://mytax.eta.gov.eg",
    "corp_tax_q1":         "https://mytax.eta.gov.eg",
    "corp_tax_annual":     "https://mytax.eta.gov.eg",
    "stamp_quarterly":     "https://mytax.eta.gov.eg",
    "form_41":             "https://mytax.eta.gov.eg",
}


def _log(db, client_id, user_id, entity_type, entity_id, action, old=None, new=None, notes=None):
    db.add(TaxAuditLog(
        client_id=client_id, user_id=user_id,
        entity_type=entity_type, entity_id=entity_id,
        action=action, old_values=old, new_values=new, notes=notes,
    ))


def _user_name(db, user_id):
    if not user_id: return None
    from app.models.user import User as _User
    u = db.query(_User).get(user_id)
    return u.name if u else str(user_id)

def _vat_dict(r: VATReturn, db=None) -> dict:
    return {
        "id": r.id, "client_id": r.client_id,
        "period_year": r.period_year, "period_month": r.period_month,
        "period_label": MONTH_NAMES_AR[r.period_month - 1] + f" {r.period_year}",
        "status": r.status,
        "out_std_taxable": float(r.out_std_taxable or 0),
        "out_std_vat": float(r.out_std_vat or 0),
        "out_credit_taxable": float(r.out_credit_taxable or 0),
        "out_credit_vat": float(r.out_credit_vat or 0),
        "out_manual_adjustment": float(r.out_manual_adjustment or 0),
        "in_std_taxable": float(r.in_std_taxable or 0),
        "in_std_vat": float(r.in_std_vat or 0),
        "in_credit_vat": float(r.in_credit_vat or 0),
        "in_capital_vat": float(r.in_capital_vat or 0),
        "in_manual_adjustment": float(r.in_manual_adjustment or 0),
        "total_output_vat": float(r.total_output_vat or 0),
        "total_input_vat": float(r.total_input_vat or 0),
        "previous_period_credit": float(r.previous_period_credit or 0),
        "net_vat_before_credit": float(r.net_vat_before_credit or 0),
        "net_vat_due": float(r.net_vat_due or 0),
        "carry_forward_amount": float(r.carry_forward_amount or 0),
        "eta_outgoing_doc_count": r.eta_outgoing_doc_count or 0,
        "eta_incoming_doc_count": r.eta_incoming_doc_count or 0,
        "due_date": str(r.due_date) if r.due_date else None,
        "late_days": r.late_days or 0,
        "penalty_amount": float(r.penalty_amount or 0),
        "submission_ref": r.submission_ref,
        "submitted_at": str(r.submitted_at) if r.submitted_at else None,
        "paid_at": str(r.paid_at) if r.paid_at else None,
        "built_at": str(r.built_at) if r.built_at else None,
        "reviewed_at": str(r.reviewed_at) if r.reviewed_at else None,
        "approved_at": str(r.approved_at) if r.approved_at else None,
        "is_amendment": r.is_amendment,
        # Workflow actor names (only when db passed)
        "built_by_name":    _user_name(db, r.built_by)    if db else None,
        "reviewed_by_name": _user_name(db, r.reviewed_by) if db else None,
        "approved_by_name": _user_name(db, r.approved_by) if db else None,
    }


# ════════════════════════════════════════════════════════════
#  VAT RETURNS
# ════════════════════════════════════════════════════════════

class VATBuildRequest(BaseModel):
    client_id:           int
    year:                int = Field(ge=2020, le=2035)
    month:               int = Field(ge=1, le=12)
    previous_credit:     float = 0.0
    manual_output_vat:   float = 0.0
    manual_input_vat:    float = 0.0
    manual_notes:        str = ""
    partial_recovery_pct: float = Field(default=100.0, ge=1, le=100)
    force_rebuild:       bool = False


class VATUpdateRequest(BaseModel):
    previous_period_credit: Optional[float] = None
    manual_output_vat:      Optional[float] = None
    manual_input_vat:       Optional[float] = None
    manual_notes:           Optional[str] = None
    in_partial_recovery_pct: Optional[float] = None
    refund_requested:       Optional[bool] = None


class VATSubmitRequest(BaseModel):
    submission_ref:  str = Field(min_length=3, max_length=100)
    submission_date: date


class VATPayRequest(BaseModel):
    payment_ref:    str
    payment_amount: float
    paid_at:        date


@router.post("/vat/build")
def build_vat(
    req: VATBuildRequest,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    # Check period not locked
    period = db.query(TaxPeriod).filter_by(
        client_id=req.client_id, period_year=req.year, period_month=req.month
    ).first()
    if period and period.status == "locked":
        raise HTTPException(403, "الفترة مقفولة — لا يمكن تعديل الإقرار")

    ret = build_vat_return(
        db, req.client_id, req.year, req.month,
        req.previous_credit, req.manual_output_vat, req.manual_input_vat,
        req.manual_notes, req.partial_recovery_pct, req.force_rebuild,
        built_by=cu.id,
    )
    _log(db, req.client_id, cu.id, "vat_return", ret.id, "created")
    db.commit()

    result = _vat_dict(ret)
    result["warnings"] = getattr(ret, "_warnings", [])
    return result


@router.get("/vat/{client_id}")
def list_vat_returns(
    client_id: int,
    year: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    q = db.query(VATReturn).filter(VATReturn.client_id == client_id)
    if year:
        q = q.filter(VATReturn.period_year == year)
    if status:
        q = q.filter(VATReturn.status == status)
    total = q.count()
    items = q.order_by(VATReturn.period_year.desc(), VATReturn.period_month.desc()) \
             .offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_vat_dict(r, db) for r in items], "total": total}


@router.get("/vat/{client_id}/{year}/{month}")
def get_vat_return(
    client_id: int, year: int, month: int,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    ret = db.query(VATReturn).filter_by(
        client_id=client_id, period_year=year, period_month=month
    ).first()
    if not ret:
        raise HTTPException(404, "لا يوجد إقرار لهذه الفترة")
    return _vat_dict(ret, db)


@router.get("/vat/{vat_id}/detail")
def get_vat_return_detail(
    vat_id: int,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    """Returns full return data + audit trail for workflow review page."""
    ret = db.get(VATReturn, vat_id)
    if not ret: raise HTTPException(404)
    d = _vat_dict(ret, db)
    # Audit trail for this return
    logs = db.query(TaxAuditLog).filter(
        TaxAuditLog.entity_type == "vat_return",
        TaxAuditLog.entity_id == vat_id,
    ).order_by(TaxAuditLog.created_at.asc()).all()
    d["audit_trail"] = [
        {
            "id": l.id,
            "action": l.action,
            "actor": _user_name(db, l.user_id),
            "notes": l.notes,
            "old_values": l.old_values,
            "new_values": l.new_values,
            "created_at": str(l.created_at),
        }
        for l in logs
    ]
    return d


@router.get("/vat/{vat_id}/lines")
def get_vat_lines(
    vat_id: int,
    line_type: Optional[str] = None,
    included_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    q = db.query(VATReturnLine).filter(VATReturnLine.vat_return_id == vat_id)
    if line_type:
        q = q.filter(VATReturnLine.line_type == line_type)
    if included_only:
        q = q.filter(VATReturnLine.is_included == True)
    total = q.count()
    items = q.order_by(VATReturnLine.doc_date.desc()).offset((page-1)*page_size).limit(page_size).all()
    return {
        "total": total,
        "items": [{
            "id": l.id, "line_type": l.line_type, "eta_doc_uuid": l.eta_doc_uuid,
            "doc_date": str(l.doc_date) if l.doc_date else None,
            "doc_type": l.doc_type, "internal_id": l.internal_id,
            "counterparty_name": l.counterparty_name, "counterparty_tin": l.counterparty_tin,
            "taxable_amount": float(l.taxable_amount or 0),
            "vat_rate": float(l.vat_rate or 0), "vat_amount": float(l.vat_amount or 0),
            "total_amount": float(l.total_amount or 0),
            "is_included": l.is_included, "exclude_reason": l.exclude_reason,
        } for l in items],
    }


@router.put("/vat/{vat_id}/lines/{line_id}")
def update_vat_line(
    vat_id: int, line_id: int,
    is_included: bool,
    exclude_reason: Optional[str] = None,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    line = db.query(VATReturnLine).filter_by(id=line_id, vat_return_id=vat_id).first()
    if not line:
        raise HTTPException(404, "السطر غير موجود")
    ret = db.get(VATReturn, vat_id)
    if ret and ret.status not in ("draft", "reviewed"):
        raise HTTPException(400, "لا يمكن تعديل إقرار في حالة " + ret.status)
    line.is_included   = is_included
    line.exclude_reason = exclude_reason
    line.excluded_by   = cu.id if not is_included else None
    # Recompute return totals
    if ret:
        recompute_totals(ret)
    db.commit()
    return {"message": "تم التحديث"}


@router.put("/vat/{vat_id}")
def update_vat_return(
    vat_id: int, req: VATUpdateRequest,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    ret = db.get(VATReturn, vat_id)
    if not ret:
        raise HTTPException(404, "الإقرار غير موجود")
    if ret.status not in ("draft", "reviewed"):
        raise HTTPException(400, "لا يمكن تعديل إقرار في حالة " + ret.status)

    if req.previous_period_credit is not None:
        ret.previous_period_credit = req.previous_period_credit
    if req.manual_output_vat is not None:
        ret.out_manual_adjustment = req.manual_output_vat
    if req.manual_input_vat is not None:
        ret.in_manual_adjustment = req.manual_input_vat
    if req.manual_notes is not None:
        ret.out_manual_notes = req.manual_notes
    if req.in_partial_recovery_pct is not None:
        ret.in_partial_recovery_pct = req.in_partial_recovery_pct
    if req.refund_requested is not None:
        ret.refund_requested = req.refund_requested

    recompute_totals(ret)
    late_days, penalty = compute_penalty(float(ret.net_vat_due or 0), ret.due_date)
    ret.late_days = late_days
    ret.penalty_amount = penalty

    db.commit()
    return _vat_dict(ret)


@router.post("/vat/{vat_id}/review")
def review_vat_return(
    vat_id: int,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    ret = db.get(VATReturn, vat_id)
    if not ret:
        raise HTTPException(404)
    if ret.status != "draft":
        raise HTTPException(400, f"الإقرار في حالة '{ret.status}' — يجب أن يكون مسودة")
    old = ret.status
    ret.status      = "reviewed"
    ret.reviewed_by = cu.id
    ret.reviewed_at = datetime.utcnow()
    _log(db, ret.client_id, cu.id, "vat_return", ret.id, "status_changed",
         {"status": old}, {"status": "reviewed"})
    db.commit()
    return {"status": "reviewed", "reviewed_at": str(ret.reviewed_at)}


@router.post("/vat/{vat_id}/approve")
def approve_vat_return(
    vat_id: int,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    ret = db.get(VATReturn, vat_id)
    if not ret:
        raise HTTPException(404)
    if ret.status != "reviewed":
        raise HTTPException(400, "يجب مراجعة الإقرار قبل الاعتماد")
    ret.status      = "approved"
    ret.approved_by = cu.id
    ret.approved_at = datetime.utcnow()
    _log(db, ret.client_id, cu.id, "vat_return", ret.id, "approved")
    db.commit()
    return {"status": "approved"}


@router.post("/vat/{vat_id}/submit")
def submit_vat_return(
    vat_id: int, req: VATSubmitRequest,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    ret = db.get(VATReturn, vat_id)
    if not ret:
        raise HTTPException(404)
    if ret.status not in ("approved", "reviewed"):
        raise HTTPException(400, f"الإقرار في حالة '{ret.status}'")
    ret.status         = "submitted"
    ret.submission_ref = req.submission_ref
    ret.submitted_at   = datetime.utcnow()
    # Update late days / penalty at submission
    late, penalty = compute_penalty(float(ret.net_vat_due or 0), ret.due_date)
    ret.late_days      = late
    ret.penalty_amount = penalty
    ret.submitted_by   = cu.id
    _log(db, ret.client_id, cu.id, "vat_return", ret.id, "submitted",
         new_values={"submission_ref": req.submission_ref})
    db.commit()
    return {"status": "submitted", "submission_ref": req.submission_ref,
            "penalty_amount": float(ret.penalty_amount or 0)}


@router.post("/vat/{vat_id}/pay")
def pay_vat_return(
    vat_id: int, req: VATPayRequest,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    ret = db.get(VATReturn, vat_id)
    if not ret:
        raise HTTPException(404)
    if ret.status != "submitted":
        raise HTTPException(400, "يجب تقديم الإقرار قبل تسجيل الدفع")
    ret.status         = "paid"
    ret.payment_ref    = req.payment_ref
    ret.payment_amount = req.payment_amount
    ret.paid_at        = datetime.utcnow()
    _log(db, ret.client_id, cu.id, "vat_return", ret.id, "paid")
    db.commit()
    return {"status": "paid"}


# ════════════════════════════════════════════════════════════
#  WITHHOLDING TAX
# ════════════════════════════════════════════════════════════

@router.get("/withholding/types")
def get_wht_types(db: Session = Depends(get_db), cu: User = Depends(get_current_user)):
    types = db.query(WithholdingType).filter_by(is_active=True).all()
    return [{"code": t.code, "name_ar": t.name_ar, "category": t.category,
             "rate_company": float(t.rate_company), "rate_individual": float(t.rate_individual),
             "rate_foreign": float(t.rate_foreign), "legal_reference": t.legal_reference}
            for t in types]


class WHTEntryCreate(BaseModel):
    client_id:        int
    transaction_date: date
    transaction_type: str
    invoice_number:   Optional[str] = None
    description:      Optional[str] = None
    payee_name:       str
    payee_tin:        Optional[str] = None
    payee_national_id: Optional[str] = None
    payee_type:       str = "company"
    payee_country:    str = "Egypt"
    gross_amount:     float = Field(gt=0)
    treaty_applies:   bool = False
    treaty_rate:      Optional[float] = None
    eta_doc_uuid:     Optional[str] = None
    notes:            Optional[str] = None


@router.post("/withholding/entries")
def create_wht_entry(
    req: WHTEntryCreate,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    wht_type = db.query(WithholdingType).get(req.transaction_type)
    if not wht_type:
        raise HTTPException(400, f"نوع المعاملة '{req.transaction_type}' غير موجود")

    gross = Decimal(str(req.gross_amount))
    treaty = Decimal(str(req.treaty_rate)) if req.treaty_applies and req.treaty_rate else None
    rate, wht_amount, net = compute_withholding(gross, req.transaction_type, req.payee_type, treaty)

    entry = WithholdingEntry(
        client_id=req.client_id,
        period_year=req.transaction_date.year,
        period_month=req.transaction_date.month,
        transaction_date=req.transaction_date,
        transaction_type=req.transaction_type,
        invoice_number=req.invoice_number,
        description=req.description,
        payee_name=req.payee_name,
        payee_tin=req.payee_tin,
        payee_national_id=req.payee_national_id,
        payee_type=req.payee_type,
        payee_country=req.payee_country,
        treaty_applies=req.treaty_applies,
        treaty_rate=req.treaty_rate,
        gross_amount=float(gross),
        withholding_rate=float(rate),
        withholding_amount=float(wht_amount),
        net_amount=float(net),
        eta_doc_uuid=req.eta_doc_uuid,
        notes=req.notes,
        created_by=cu.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "withholding_rate": float(rate),
            "withholding_amount": float(wht_amount), "net_amount": float(net)}


@router.get("/withholding/entries")
def list_wht_entries(
    client_id: int,
    year: Optional[int] = None,
    month: Optional[int] = None,
    payee_tin: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    q = db.query(WithholdingEntry).filter(WithholdingEntry.client_id == client_id)
    if year:  q = q.filter(WithholdingEntry.period_year == year)
    if month: q = q.filter(WithholdingEntry.period_month == month)
    if payee_tin: q = q.filter(WithholdingEntry.payee_tin == payee_tin)
    total = q.count()
    items = q.order_by(WithholdingEntry.transaction_date.desc())\
             .offset((page-1)*page_size).limit(page_size).all()
    return {
        "total": total,
        "items": [{
            "id": e.id, "transaction_date": str(e.transaction_date),
            "transaction_type": e.transaction_type, "payee_name": e.payee_name,
            "payee_tin": e.payee_tin, "payee_type": e.payee_type,
            "gross_amount": float(e.gross_amount or 0),
            "withholding_rate": float(e.withholding_rate or 0),
            "withholding_amount": float(e.withholding_amount or 0),
            "net_amount": float(e.net_amount or 0),
            "invoice_number": e.invoice_number, "return_id": e.return_id,
        } for e in items],
    }


@router.post("/withholding/returns/build")
def build_wht_return(
    client_id: int, year: int, month: int,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    ret = build_withholding_return(db, client_id, year, month, cu.id)
    _log(db, client_id, cu.id, "wht_return", ret.id, "created")
    db.commit()
    return {
        "id": ret.id, "client_id": ret.client_id,
        "period_year": ret.period_year, "period_month": ret.period_month,
        "total_gross": float(ret.total_gross or 0),
        "total_withholding": float(ret.total_withholding or 0),
        "total_entries": ret.total_entries,
        "due_date": str(ret.due_date) if ret.due_date else None,
        "status": ret.status,
    }


@router.get("/withholding/returns")
def list_wht_returns(
    client_id: int, year: Optional[int] = None,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    q = db.query(WithholdingReturn).filter(WithholdingReturn.client_id == client_id)
    if year: q = q.filter(WithholdingReturn.period_year == year)
    items = q.order_by(WithholdingReturn.period_year.desc(), WithholdingReturn.period_month.desc()).all()
    return [{"id": r.id, "period_year": r.period_year, "period_month": r.period_month,
             "period_label": MONTH_NAMES_AR[r.period_month-1] + f" {r.period_year}",
             "total_gross": float(r.total_gross or 0), "total_withholding": float(r.total_withholding or 0),
             "total_entries": r.total_entries, "status": r.status,
             "due_date": str(r.due_date) if r.due_date else None,
             "submission_ref": r.submission_ref} for r in items]


class WHTSubmitRequest(BaseModel):
    submission_ref: str
    submission_date: date


@router.post("/withholding/returns/{ret_id}/submit")
def submit_wht_return(
    ret_id: int, req: WHTSubmitRequest,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    ret = db.get(WithholdingReturn, ret_id)
    if not ret:
        raise HTTPException(404)
    ret.status         = "submitted"
    ret.submission_ref = req.submission_ref
    ret.submitted_at   = datetime.utcnow()
    _log(db, ret.client_id, cu.id, "wht_return", ret.id, "submitted")
    db.commit()
    return {"status": "submitted"}


# ════════════════════════════════════════════════════════════
#  CORPORATE TAX
# ════════════════════════════════════════════════════════════

class CorpTaxPayload(BaseModel):
    revenue_domestic_taxable: float = 0
    revenue_domestic_exempt:  float = 0
    revenue_export:           float = 0
    revenue_other:            float = 0
    cogs:                     float = 0
    exp_salaries:             float = 0
    exp_social_insurance:     float = 0
    exp_rent:                 float = 0
    exp_utilities:            float = 0
    exp_depreciation_accounting: float = 0
    exp_depreciation_tax:     float = 0
    exp_advertising:          float = 0
    exp_other_deductible:     float = 0
    nd_entertainment:         float = 0
    nd_fines_penalties:       float = 0
    nd_donations_non_approved: float = 0
    nd_other:                 float = 0
    exempt_dividends:         float = 0
    exempt_other:             float = 0
    prior_year_losses:        float = 0
    losses_detail:            Optional[list] = None
    withholding_credited:     float = 0
    advance_payments_made:    float = 0
    notes:                    Optional[str] = None


@router.put("/corporate/{client_id}/{year}")
def save_corp_estimate(
    client_id: int, year: int, req: CorpTaxPayload,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    est, installs = build_corporate_estimate(db, client_id, year, req.dict(), cu.id)
    _log(db, client_id, cu.id, "corp_estimate", est.id, "updated")
    db.commit()
    return {
        "id": est.id, "fiscal_year": est.fiscal_year,
        "accounting_profit": float(est.accounting_profit or 0),
        "taxable_income": float(est.taxable_income or 0),
        "applicable_tax_rate": float(est.applicable_tax_rate or 0),
        "gross_tax": float(est.gross_tax or 0),
        "withholding_credited": float(est.withholding_credited or 0),
        "advance_payments_made": float(est.advance_payments_made or 0),
        "final_tax_due": float(est.final_tax_due or 0),
        "deferred_tax_net": float(est.deferred_tax_net or 0),
        "quarterly_installments": installs,
        "annual_return_due_date": str(est.annual_return_due_date) if est.annual_return_due_date else None,
        "status": est.status,
    }


@router.get("/corporate/{client_id}")
def list_corp_estimates(
    client_id: int,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    items = db.query(CorporateEstimate).filter_by(client_id=client_id)\
              .order_by(CorporateEstimate.fiscal_year.desc()).all()
    return [{"id": e.id, "fiscal_year": e.fiscal_year,
             "taxable_income": float(e.taxable_income or 0),
             "gross_tax": float(e.gross_tax or 0),
             "final_tax_due": float(e.final_tax_due or 0),
             "status": e.status,
             "annual_return_due_date": str(e.annual_return_due_date) if e.annual_return_due_date else None}
            for e in items]


@router.get("/corporate/{client_id}/{year}")
def get_corp_estimate(
    client_id: int, year: int,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    est = db.query(CorporateEstimate).filter_by(client_id=client_id, fiscal_year=year).first()
    if not est:
        raise HTTPException(404, f"لا يوجد تقدير للسنة {year}")
    installs = compute_quarterly_installments(Decimal(str(est.gross_tax or 0)), year)
    d = {c.name: getattr(est, c.name) for c in est.__table__.columns}
    for k, v in d.items():
        if hasattr(v, "__float__"):
            d[k] = float(v)
        elif hasattr(v, "isoformat"):
            d[k] = str(v)
    d["quarterly_installments"] = installs
    return d


class InstallmentPayRequest(BaseModel):
    quarter: int = Field(ge=1, le=4)
    payment_ref: str
    paid_at: date


@router.post("/corporate/{client_id}/{year}/installments/pay")
def pay_installment(
    client_id: int, year: int, req: InstallmentPayRequest,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    est = db.query(CorporateEstimate).filter_by(client_id=client_id, fiscal_year=year).first()
    if not est:
        raise HTTPException(404)
    setattr(est, f"q{req.quarter}_paid_at",      req.paid_at)
    setattr(est, f"q{req.quarter}_payment_ref",  req.payment_ref)
    _log(db, client_id, cu.id, "corp_estimate", est.id, "updated",
         notes=f"دفع قسط Q{req.quarter}")
    db.commit()
    return {"message": f"تم تسجيل دفع القسط رقم {req.quarter}"}


# ════════════════════════════════════════════════════════════
#  SALARY TAX
# ════════════════════════════════════════════════════════════

class SalaryCalcRequest(BaseModel):
    gross_monthly: float
    variable_pay:  float = 0
    allowances:    float = 0


@router.post("/salary/calculate")
def calculate_salary_tax(req: SalaryCalcRequest, cu: User = Depends(get_current_user)):
    result = compute_monthly_salary_tax(
        Decimal(str(req.gross_monthly)),
        Decimal(str(req.variable_pay)),
        Decimal(str(req.allowances)),
    )
    return result


@router.get("/salary/{client_id}")
def list_salary_returns(
    client_id: int, year: Optional[int] = None,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    q = db.query(SalaryTaxReturn).filter(SalaryTaxReturn.client_id == client_id)
    if year: q = q.filter(SalaryTaxReturn.period_year == year)
    items = q.order_by(SalaryTaxReturn.period_year.desc(), SalaryTaxReturn.period_month.desc()).all()
    return [{"id": r.id, "period_year": r.period_year, "period_month": r.period_month,
             "period_label": MONTH_NAMES_AR[r.period_month-1] + f" {r.period_year}",
             "employee_count": r.employee_count,
             "total_gross_salary": float(r.total_gross_salary or 0),
             "total_tax_withheld": float(r.total_tax_withheld or 0),
             "status": r.status} for r in items]


# ════════════════════════════════════════════════════════════
#  TAX CALENDAR
# ════════════════════════════════════════════════════════════

@router.get("/calendar")
def get_calendar(
    client_id: Optional[int] = None,
    year: Optional[int] = None,
    is_done: Optional[bool] = None,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    q = db.query(TaxCalendarEvent)
    if client_id: q = q.filter(TaxCalendarEvent.client_id == client_id)
    if year:       q = q.filter(TaxCalendarEvent.fiscal_year == year)
    if is_done is not None: q = q.filter(TaxCalendarEvent.is_done == is_done)
    items = q.order_by(TaxCalendarEvent.due_date).all()

    today = date.today()
    def _days(d):
        if not d: return None
        delta = (d - today).days
        return delta

    return {"items": [{
        "id": e.id, "client_id": e.client_id,
        "event_type": e.event_type, "title": e.title,
        "description": e.description, "portal_url": e.portal_url,
        "due_date": str(e.due_date), "fiscal_year": e.fiscal_year,
        "is_done": e.is_done, "done_ref": e.done_ref,
        "days_remaining": _days(e.due_date),
        "is_overdue": _days(e.due_date) < 0 if e.due_date and not e.is_done else False,
    } for e in items]}


@router.post("/calendar/generate/{client_id}")
def generate_calendar(
    client_id: int, year: int,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    from app.models.obligation import TaxObligation, ObligationType
    obligations = db.query(TaxObligation).filter_by(client_id=client_id, is_active=True).all()
    created = 0

    for obl in obligations:
        events = _generate_deadlines(obl.obligation_type, client_id, year)
        for evt_data in events:
            exists = db.query(TaxCalendarEvent).filter_by(
                client_id=client_id,
                event_type=evt_data["event_type"],
                due_date=evt_data["due_date"],
            ).first()
            if not exists:
                db.add(TaxCalendarEvent(**evt_data, client_id=client_id,
                                        is_auto_generated=True, created_by=cu.id))
                created += 1

    # Always add annual corporate tax deadline
    corp_exists = db.query(TaxCalendarEvent).filter_by(
        client_id=client_id, event_type="corp_tax_annual", fiscal_year=year
    ).first()
    if not corp_exists:
        db.add(TaxCalendarEvent(
            client_id=client_id, event_type="corp_tax_annual",
            title=f"الإقرار الضريبي السنوي {year}",
            due_date=date(year + 1, 4, 30),
            portal_url=PORTAL_URLS["corp_tax_annual"],
            fiscal_year=year, is_auto_generated=True, created_by=cu.id,
        ))
        created += 1

    db.commit()
    return {"created": created, "year": year, "client_id": client_id}


def _generate_deadlines(obligation_type: str, client_id: int, year: int) -> list:
    from app.models.obligation import ObligationType
    events = []

    monthly_types = {
        "vat_monthly":          ("vat_monthly",         "ضريبة ق.م."),
        "withholding_monthly":  ("withholding_monthly",  "خصم وإضافة"),
        "payroll_monthly":      ("salary_monthly",        "ضريبة مرتبات"),
    }
    for ot, (event_type, label) in monthly_types.items():
        if obligation_type == ot:
            for month in range(1, 13):
                ny, nm = (year, month + 1) if month < 12 else (year + 1, 1)
                events.append({
                    "event_type": event_type,
                    "title": f"{label} — {MONTH_NAMES_AR[month-1]} {year}",
                    "due_date": date(ny, nm, 15),
                    "portal_url": PORTAL_URLS.get(event_type),
                    "fiscal_year": year,
                    "fiscal_period_month": month,
                    "reminder_days": [7, 3, 1],
                })

    if obligation_type == "stamp_quarterly":
        for q, (qmo, qdue_mo, qdue_yr) in enumerate([
            (3, 4, year), (6, 7, year), (9, 10, year), (12, 1, year+1)
        ], 1):
            events.append({
                "event_type": "stamp_quarterly",
                "title": f"ضريبة الدمغة — ربع {q} {year}",
                "due_date": date(qdue_yr, qdue_mo, 15),
                "portal_url": PORTAL_URLS["stamp_quarterly"],
                "fiscal_year": year, "fiscal_quarter": q,
                "reminder_days": [7, 3, 1],
            })

    return events


@router.post("/calendar/events/{event_id}/done")
def mark_calendar_done(
    event_id: int, done_ref: Optional[str] = None,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    evt = db.get(TaxCalendarEvent, event_id)
    if not evt:
        raise HTTPException(404)
    evt.is_done = True
    evt.done_at = datetime.utcnow()
    evt.done_by = cu.id
    evt.done_ref = done_ref
    db.commit()
    return {"message": "تم وضع علامة مكتمل"}


# ════════════════════════════════════════════════════════════
#  DASHBOARD
# ════════════════════════════════════════════════════════════

@router.get("/dashboard/{client_id}")
def tax_dashboard(
    client_id: int,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    today = date.today()
    y = year  or today.year
    m = month or today.month

    # VAT summary
    latest_vat = db.query(VATReturn).filter(
        VATReturn.client_id == client_id
    ).order_by(VATReturn.period_year.desc(), VATReturn.period_month.desc()).first()

    current_vat = db.query(VATReturn).filter_by(
        client_id=client_id, period_year=y, period_month=m
    ).first()

    # WHT summary
    current_wht = db.query(WithholdingReturn).filter_by(
        client_id=client_id, period_year=y, period_month=m
    ).first()
    pending_wht_entries = db.query(WithholdingEntry).filter(
        WithholdingEntry.client_id == client_id,
        WithholdingEntry.period_year == y,
        WithholdingEntry.period_month == m,
        WithholdingEntry.return_id == None,
    ).count()

    # Corporate tax
    corp = db.query(CorporateEstimate).filter_by(client_id=client_id, fiscal_year=y).first()

    # Calendar
    upcoming = db.query(TaxCalendarEvent).filter(
        TaxCalendarEvent.client_id == client_id,
        TaxCalendarEvent.is_done == False,
        TaxCalendarEvent.due_date >= today,
    ).order_by(TaxCalendarEvent.due_date).limit(5).all()

    overdue = db.query(TaxCalendarEvent).filter(
        TaxCalendarEvent.client_id == client_id,
        TaxCalendarEvent.is_done == False,
        TaxCalendarEvent.due_date < today,
    ).count()

    # ETA
    from app.models.eta import ETADocument, ETACredential
    cred = db.query(ETACredential).filter_by(client_id=client_id).first()
    eta_out = db.query(ETADocument).filter(
        ETADocument.client_id == client_id,
        ETADocument.period_year == y, ETADocument.period_month == m,
        ETADocument.direction == "outgoing",
    ).count()
    eta_in = db.query(ETADocument).filter(
        ETADocument.client_id == client_id,
        ETADocument.period_year == y, ETADocument.period_month == m,
        ETADocument.direction == "incoming",
    ).count()

    next_evt = None
    if upcoming:
        e = upcoming[0]
        next_evt = {
            "title": e.title,
            "due_date": str(e.due_date),
            "days_remaining": (e.due_date - today).days,
        }

    return {
        "period": {"year": y, "month": m, "label": MONTH_NAMES_AR[m-1] + f" {y}"},
        "vat": {
            "current_due": float(current_vat.net_vat_due or 0) if current_vat else 0,
            "current_status": current_vat.status if current_vat else "not_started",
            "last_return_status": latest_vat.status if latest_vat else None,
            "last_return_ref": latest_vat.submission_ref if latest_vat else None,
            "pending_return_id": current_vat.id if current_vat and current_vat.status == "draft" else None,
        },
        "withholding": {
            "current_total": float(current_wht.total_withholding or 0) if current_wht else 0,
            "pending_entries": pending_wht_entries,
            "last_status": current_wht.status if current_wht else "not_started",
        },
        "corporate_tax": {
            "fiscal_year": y,
            "estimated_tax": float(corp.gross_tax or 0) if corp else 0,
            "final_due": float(corp.final_tax_due or 0) if corp else 0,
            "status": corp.status if corp else "not_started",
            "annual_return_due": str(corp.annual_return_due_date) if corp and corp.annual_return_due_date else None,
        },
        "calendar": {
            "overdue_count": overdue,
            "due_this_week": sum(1 for e in upcoming if (e.due_date - today).days <= 7),
            "next_event": next_evt,
        },
        "eta": {
            "outgoing_this_month": eta_out,
            "incoming_this_month": eta_in,
            "connected": bool(cred and cred.is_active),
            "last_sync_at": str(cred.last_sync_at) if cred and cred.last_sync_at else None,
        },
    }


# ════════════════════════════════════════════════════════════
#  PERIOD MANAGEMENT
# ════════════════════════════════════════════════════════════

@router.get("/periods/{client_id}/{year}")
def get_periods(
    client_id: int, year: int,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    periods = db.query(TaxPeriod).filter_by(client_id=client_id, period_year=year).all()
    return [{"id": p.id, "period_month": p.period_month, "period_label": p.period_label,
             "status": p.status, "vat_status": p.vat_status, "wht_status": p.wht_status,
             "locked_at": str(p.locked_at) if p.locked_at else None} for p in periods]


class LockRequest(BaseModel):
    reason: str


@router.post("/periods/{client_id}/{year}/{month}/lock")
def lock_period(
    client_id: int, year: int, month: int, req: LockRequest,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    if cu.role != "admin":
        raise HTTPException(403, "يتطلب صلاحية المدير")
    period = db.query(TaxPeriod).filter_by(client_id=client_id, period_year=year, period_month=month).first()
    if not period:
        raise HTTPException(404, "الفترة غير موجودة")
    if period.status == "locked":
        raise HTTPException(400, "الفترة مقفولة بالفعل")
    period.status    = "locked"
    period.locked_by = cu.id
    period.locked_at = datetime.utcnow()
    period.lock_reason = req.reason
    _log(db, client_id, cu.id, "tax_period", period.id, "period_locked",
         {"status": "open"}, {"status": "locked"}, notes=req.reason)
    db.commit()
    return {"status": "locked"}


@router.post("/periods/{client_id}/{year}/{month}/unlock")
def unlock_period(
    client_id: int, year: int, month: int, req: LockRequest,
    db: Session = Depends(get_db), cu: User = Depends(get_current_user),
):
    if cu.role != "admin":
        raise HTTPException(403, "يتطلب صلاحية المدير")
    period = db.query(TaxPeriod).filter_by(client_id=client_id, period_year=year, period_month=month).first()
    if not period:
        raise HTTPException(404)
    period.status           = "open"
    period.last_reopened_by = cu.id
    period.last_reopened_at = datetime.utcnow()
    period.reopen_reason    = req.reason
    period.locked_by        = None
    period.locked_at        = None
    _log(db, client_id, cu.id, "tax_period", period.id, "period_unlocked",
         {"status": "locked"}, {"status": "open"}, notes=req.reason)
    db.commit()
    return {"status": "open"}


# ════════════════════════════════════════════════════════════
#  AUDIT LOG
# ════════════════════════════════════════════════════════════

@router.get("/audit")
def get_audit_log(
    client_id: int,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    cu: User = Depends(get_current_user),
):
    q = db.query(TaxAuditLog).filter(TaxAuditLog.client_id == client_id)
    if entity_type: q = q.filter(TaxAuditLog.entity_type == entity_type)
    if action:      q = q.filter(TaxAuditLog.action == action)
    total = q.count()
    items = q.order_by(TaxAuditLog.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return {
        "total": total,
        "items": [{
            "id": l.id, "user_id": l.user_id, "entity_type": l.entity_type,
            "entity_id": l.entity_id, "action": l.action,
            "old_values": l.old_values, "new_values": l.new_values,
            "notes": l.notes,
            "created_at": str(l.created_at) if l.created_at else None,
        } for l in items],
    }
