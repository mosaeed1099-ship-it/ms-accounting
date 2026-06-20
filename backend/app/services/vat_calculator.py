"""
VAT Return Calculator — Egyptian Tax Authority
محرك حساب إقرار ضريبة القيمة المضافة
Law 67/2016
"""
from decimal import Decimal, ROUND_HALF_UP
from calendar import monthrange
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.tax_center import VATReturn, VATReturnLine, TaxPeriod
from app.models.eta import ETADocument

TWO = Decimal("0.01")
VAT_DUE_DAY = 15   # 15th of following month


def _next_month(year: int, month: int):
    if month == 12:
        return year + 1, 1
    return year, month + 1


def _due_date_for_period(year: int, month: int) -> date:
    ny, nm = _next_month(year, month)
    return date(ny, nm, VAT_DUE_DAY)


def build_vat_return(
    db:                  Session,
    client_id:           int,
    year:                int,
    month:               int,
    previous_credit:     float = 0.0,
    manual_output_vat:   float = 0.0,
    manual_input_vat:    float = 0.0,
    manual_notes:        str = "",
    partial_recovery_pct: float = 100.0,
    force_rebuild:       bool = False,
    built_by:            Optional[int] = None,
) -> VATReturn:
    """
    Builds (or rebuilds) a VAT return from synced ETA documents.
    Returns the VATReturn record. Caller should check ._warnings list.
    """

    prev_credit = Decimal(str(previous_credit))
    man_out     = Decimal(str(manual_output_vat))
    man_in      = Decimal(str(manual_input_vat))
    pct         = Decimal(str(partial_recovery_pct))

    # Check existing
    existing = db.query(VATReturn).filter_by(
        client_id=client_id, period_year=year, period_month=month
    ).first()

    if existing and not force_rebuild and existing.status not in ("draft",):
        existing._warnings = []
        return existing

    # ── Fetch ETA documents ───────────────────────────────────────
    docs = db.query(ETADocument).filter(
        ETADocument.client_id == client_id,
        ETADocument.period_year == year,
        ETADocument.period_month == month,
        ETADocument.is_cancelled == False,
        ETADocument.status == "Valid",
    ).all()

    # ── Aggregate ─────────────────────────────────────────────────
    out_std_tax = Decimal(0); out_std_vat  = Decimal(0)
    out_zero    = Decimal(0)
    out_exempt  = Decimal(0)
    out_credit_tax = Decimal(0); out_credit_vat = Decimal(0)
    in_std_tax  = Decimal(0);  in_std_vat   = Decimal(0)
    in_cap_tax  = Decimal(0);  in_cap_vat   = Decimal(0)
    in_credit_vat = Decimal(0)

    eta_out_count = 0; eta_out_vat = Decimal(0)
    eta_in_count  = 0; eta_in_vat  = Decimal(0)
    warnings: List[str] = []
    line_records = []

    for doc in docs:
        net = Decimal(str(doc.net_amount or 0))
        vat = Decimal(str(doc.vat_amount or 0))
        total = Decimal(str(doc.total_amount or 0))

        if doc.direction == "outgoing":
            eta_out_count += 1
            eta_out_vat   += vat
            if doc.doc_type == "I":
                if vat > 0:
                    out_std_tax += net
                    out_std_vat += vat
                    line_type = "output_std"
                else:
                    out_zero += net
                    line_type = "output_zero"
                line_records.append((line_type, doc, net, vat, total))
            elif doc.doc_type == "C":
                out_credit_tax += net
                out_credit_vat += vat
                line_records.append(("output_credit", doc, net, vat, total))

        elif doc.direction == "incoming":
            eta_in_count += 1
            eta_in_vat   += vat
            if doc.doc_type == "I":
                in_std_tax += net
                in_std_vat += vat
                line_records.append(("input_std", doc, net, vat, total))
                if not doc.issuer_tin:
                    warnings.append(f"فاتورة واردة بدون رقم ضريبي: {doc.eta_uuid[:12] if doc.eta_uuid else '?'}")
            elif doc.doc_type == "C":
                in_credit_vat += vat
                line_records.append(("input_credit", doc, net, vat, total))

    # ── Supplement from Accounting Transactions (when no ETA docs) ──────────
    # If the user added invoices manually in the accounting module,
    # include them in the VAT return (ETA docs take priority if they exist)
    from app.models.accounting import AccTransaction
    acc_sales = db.query(AccTransaction).filter(
        AccTransaction.client_id == client_id,
        AccTransaction.year == year,
        AccTransaction.month == month,
        AccTransaction.transaction_type == "sale",
        AccTransaction.vat_amount > 0,
    ).all()
    acc_purch = db.query(AccTransaction).filter(
        AccTransaction.client_id == client_id,
        AccTransaction.year == year,
        AccTransaction.month == month,
        AccTransaction.transaction_type == "purchase",
        AccTransaction.vat_amount > 0,
    ).all()

    has_eta_output = eta_out_count > 0
    has_eta_input  = eta_in_count > 0

    for tx in acc_sales:
        if not has_eta_output:  # only use accounting if no ETA sync
            net = Decimal(str(tx.amount or 0))
            vat = Decimal(str(tx.vat_amount or 0))
            out_std_tax += net
            out_std_vat += vat
            line_records.append(("output_std_acc", tx, net, vat, net + vat))

    for tx in acc_purch:
        if not has_eta_input:
            net = Decimal(str(tx.amount or 0))
            vat = Decimal(str(tx.vat_amount or 0))
            in_std_tax += net
            in_std_vat += vat
            line_records.append(("input_std_acc", tx, net, vat, net + vat))

    if acc_sales and not has_eta_output:
        warnings.append(f"تم تضمين {len(acc_sales)} فاتورة مبيعات من قسم الحسابات (لا توجد مستندات ETA لهذه الفترة)")
    if acc_purch and not has_eta_input:
        warnings.append(f"تم تضمين {len(acc_purch)} فاتورة مشتريات من قسم الحسابات (لا توجد مستندات ETA لهذه الفترة)")

    # ── Compute ───────────────────────────────────────────────────
    gross_output = out_std_vat - out_credit_vat + man_out
    gross_input  = in_std_vat + in_cap_vat - in_credit_vat + man_in

    # Partial recovery
    if pct < Decimal(100):
        net_input = (gross_input * pct / 100).quantize(TWO, ROUND_HALF_UP)
    else:
        net_input = gross_input.quantize(TWO, ROUND_HALF_UP)

    total_out = gross_output.quantize(TWO, ROUND_HALF_UP)
    net_before_credit = (total_out - net_input).quantize(TWO, ROUND_HALF_UP)

    if net_before_credit > 0:
        if prev_credit >= net_before_credit:
            net_due      = Decimal(0)
            carry_fwd    = (prev_credit - net_before_credit).quantize(TWO)
        else:
            net_due      = (net_before_credit - prev_credit).quantize(TWO, ROUND_HALF_UP)
            carry_fwd    = Decimal(0)
    else:
        net_due   = Decimal(0)
        carry_fwd = (abs(net_before_credit) + prev_credit).quantize(TWO)

    # ── Warnings ──────────────────────────────────────────────────
    if out_std_vat > 0 and out_credit_vat / out_std_vat > Decimal("0.30"):
        warnings.append(f"إشعارات دائنة ({float(out_credit_vat):,.0f} ج) تجاوزت 30% من المبيعات")
    if not docs:
        warnings.append("لم تتم مزامنة ETA — البيانات يدوية فقط")

    # ── Upsert VATReturn ──────────────────────────────────────────
    due = _due_date_for_period(year, month)
    today = date.today()
    late = max(0, (today - due).days) if today > due else 0

    if existing and force_rebuild:
        db.query(VATReturnLine).filter_by(vat_return_id=existing.id).delete()
        existing.status = "draft"
        existing.reviewed_at = None
        existing.reviewed_by = None
        existing.approved_at = None
        existing.approved_by = None
        ret = existing
    elif existing:
        ret = existing
    else:
        ret = VATReturn(
            client_id=client_id, period_year=year, period_month=month,
        )
        db.add(ret)

    # Ensure period record exists
    period = db.query(TaxPeriod).filter_by(
        client_id=client_id, period_year=year, period_month=month
    ).first()
    if period:
        ret.period_id = period.id

    ret.out_std_taxable      = float(out_std_tax)
    ret.out_std_vat          = float(out_std_vat)
    ret.out_zero_taxable     = float(out_zero)
    ret.out_credit_taxable   = float(out_credit_tax)
    ret.out_credit_vat       = float(out_credit_vat)
    ret.out_manual_adjustment = float(man_out)
    ret.out_manual_notes     = manual_notes
    ret.in_std_taxable       = float(in_std_tax)
    ret.in_std_vat           = float(in_std_vat)
    ret.in_capital_vat       = float(in_cap_vat)
    ret.in_credit_vat        = float(in_credit_vat)
    ret.in_manual_adjustment = float(man_in)
    ret.in_partial_recovery_pct = float(pct)
    ret.previous_period_credit = float(prev_credit)
    ret.total_output_vat     = float(total_out)
    ret.total_input_vat      = float(net_input)
    ret.net_vat_before_credit = float(net_before_credit)
    ret.net_vat_due          = float(net_due)
    ret.carry_forward_amount = float(carry_fwd)
    ret.eta_outgoing_doc_count = eta_out_count
    ret.eta_outgoing_vat     = float(eta_out_vat)
    ret.eta_incoming_doc_count = eta_in_count
    ret.eta_incoming_vat     = float(eta_in_vat)
    ret.eta_sync_at          = datetime.utcnow()
    ret.due_date             = due
    ret.late_days            = late
    ret.built_by             = built_by
    ret.built_at             = datetime.utcnow()
    if not existing:
        ret.status = "draft"

    db.flush()

    # ── Create lines ──────────────────────────────────────────────
    from app.models.accounting import AccTransaction as _AccTx
    for line_type, doc, net, vat, total in line_records:
        is_out = line_type.startswith("output")
        is_acc_tx = isinstance(doc, _AccTx)
        if is_acc_tx:
            # Accounting transaction — access AccTransaction fields
            db.add(VATReturnLine(
                vat_return_id    = ret.id,
                client_id        = client_id,
                line_type        = line_type,
                doc_type         = "I",
                internal_id      = doc.doc_number,
                doc_date         = doc.date,
                counterparty_name= doc.partner_name,
                counterparty_tin = doc.partner_tax_id,
                taxable_amount   = float(net),
                vat_rate         = float((doc.vat_rate or 0) * 100),
                vat_amount       = float(vat),
                total_amount     = float(total),
                is_included      = True,
            ))
        elif doc is not None:
            # ETA document
            db.add(VATReturnLine(
                vat_return_id    = ret.id,
                client_id        = client_id,
                line_type        = line_type,
                eta_doc_uuid     = doc.eta_uuid,
                doc_date         = doc.doc_date,
                doc_type         = doc.doc_type,
                internal_id      = doc.internal_id,
                counterparty_name = doc.receiver_name if is_out else doc.issuer_name,
                counterparty_tin  = doc.receiver_tin  if is_out else doc.issuer_tin,
                taxable_amount   = float(net),
                vat_rate         = 14 if vat > 0 else 0,
                vat_amount       = float(vat),
                total_amount     = float(total),
                is_included      = True,
            ))

    db.commit()
    db.refresh(ret)
    ret._warnings = warnings
    return ret


def recompute_totals(ret: VATReturn) -> VATReturn:
    """Recompute totals from stored field values (after manual edits)."""
    out = (Decimal(str(ret.out_std_vat))
           - Decimal(str(ret.out_credit_vat))
           + Decimal(str(ret.out_reverse_charge_vat))
           + Decimal(str(ret.out_manual_adjustment))).quantize(TWO)

    pct = Decimal(str(ret.in_partial_recovery_pct or 100))
    gross_in = (Decimal(str(ret.in_std_vat))
                + Decimal(str(ret.in_capital_vat))
                + Decimal(str(ret.in_import_vat))
                - Decimal(str(ret.in_credit_vat))
                + Decimal(str(ret.in_manual_adjustment)))

    net_in = (gross_in * pct / 100).quantize(TWO, ROUND_HALF_UP)
    net_before = (out - net_in).quantize(TWO)
    prev = Decimal(str(ret.previous_period_credit or 0))

    if net_before > 0:
        if prev >= net_before:
            net_due   = Decimal(0)
            carry_fwd = (prev - net_before).quantize(TWO)
        else:
            net_due   = (net_before - prev).quantize(TWO, ROUND_HALF_UP)
            carry_fwd = Decimal(0)
    else:
        net_due   = Decimal(0)
        carry_fwd = (abs(net_before) + prev).quantize(TWO)

    ret.total_output_vat     = float(out)
    ret.total_input_vat      = float(net_in)
    ret.net_vat_before_credit = float(net_before)
    ret.net_vat_due          = float(net_due)
    ret.carry_forward_amount = float(carry_fwd)
    return ret


def compute_penalty(net_due: float, due_date: date, rate_pct: float = 1.5) -> tuple:
    """Returns (late_days, penalty_amount)"""
    today = date.today()
    if today <= due_date or net_due <= 0:
        return 0, 0.0
    late_days = (today - due_date).days
    months = (late_days + 29) // 30   # round up to full months
    penalty = min(
        net_due,
        round(net_due * rate_pct / 100 * months, 2)
    )
    return late_days, penalty
