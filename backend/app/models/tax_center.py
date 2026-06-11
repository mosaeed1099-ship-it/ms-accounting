"""
Tax Center Models — Egyptian Tax Authority Integration
جداول مركز الضرائب المصري الكامل
"""
from sqlalchemy import (
    Column, Integer, SmallInteger, String, Text, Boolean, Numeric,
    Date, DateTime, ForeignKey, UniqueConstraint, Index, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


# ═══════════════════════════════════════════════════════════════════
# TAX PERIODS
# ═══════════════════════════════════════════════════════════════════

class TaxPeriod(Base):
    __tablename__ = "tax_periods"
    __table_args__ = (
        UniqueConstraint("client_id", "period_year", "period_month", name="uq_tax_period"),
    )

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    period_year     = Column(SmallInteger, nullable=False)
    period_month    = Column(SmallInteger, nullable=False)
    period_label    = Column(String(50), nullable=False)
    fiscal_year     = Column(SmallInteger, nullable=False)

    status          = Column(String(20), nullable=False, default="open")
    # open | review | locked | archived

    vat_status      = Column(String(30), default="not_started")
    vat_return_id   = Column(Integer, nullable=True)
    wht_status      = Column(String(30), default="not_started")
    wht_return_id   = Column(Integer, nullable=True)
    salary_status   = Column(String(30), default="not_started")
    salary_return_id= Column(Integer, nullable=True)

    eta_last_synced_at  = Column(DateTime)
    eta_outgoing_count  = Column(Integer, default=0)
    eta_incoming_count  = Column(Integer, default=0)
    eta_sync_complete   = Column(Boolean, default=False)

    locked_by       = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_at       = Column(DateTime)
    lock_reason     = Column(Text)
    last_reopened_by= Column(Integer, ForeignKey("users.id"), nullable=True)
    last_reopened_at= Column(DateTime)
    reopen_reason   = Column(Text)

    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════
# VAT RETURNS
# ═══════════════════════════════════════════════════════════════════

class VATReturn(Base):
    __tablename__ = "tax_vat_returns"
    __table_args__ = (
        UniqueConstraint("client_id", "period_year", "period_month", name="uq_vat_return"),
    )

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    period_id       = Column(Integer, ForeignKey("tax_periods.id"), nullable=True)
    period_year     = Column(SmallInteger, nullable=False)
    period_month    = Column(SmallInteger, nullable=False)

    # Output VAT (Sales)
    out_std_taxable         = Column(Numeric(14, 2), default=0)
    out_std_vat             = Column(Numeric(14, 2), default=0)
    out_red_taxable         = Column(Numeric(14, 2), default=0)
    out_red_vat             = Column(Numeric(14, 2), default=0)
    out_zero_taxable        = Column(Numeric(14, 2), default=0)
    out_exempt_amount       = Column(Numeric(14, 2), default=0)
    out_export_taxable      = Column(Numeric(14, 2), default=0)
    out_credit_taxable      = Column(Numeric(14, 2), default=0)
    out_credit_vat          = Column(Numeric(14, 2), default=0)
    out_reverse_charge_vat  = Column(Numeric(14, 2), default=0)
    out_manual_adjustment   = Column(Numeric(14, 2), default=0)
    out_manual_notes        = Column(Text)

    # Input VAT (Purchases)
    in_std_taxable          = Column(Numeric(14, 2), default=0)
    in_std_vat              = Column(Numeric(14, 2), default=0)
    in_capital_taxable      = Column(Numeric(14, 2), default=0)
    in_capital_vat          = Column(Numeric(14, 2), default=0)
    in_import_taxable       = Column(Numeric(14, 2), default=0)
    in_import_vat           = Column(Numeric(14, 2), default=0)
    in_credit_vat           = Column(Numeric(14, 2), default=0)
    in_reverse_charge_vat   = Column(Numeric(14, 2), default=0)
    in_manual_adjustment    = Column(Numeric(14, 2), default=0)
    in_manual_notes         = Column(Text)
    in_partial_recovery_pct = Column(Numeric(5, 2), default=100)

    # Carry forward
    previous_period_credit  = Column(Numeric(14, 2), default=0)
    previous_period_id      = Column(Integer, nullable=True)

    # Computed totals
    total_output_vat        = Column(Numeric(14, 2), default=0)
    total_input_vat         = Column(Numeric(14, 2), default=0)
    net_vat_before_credit   = Column(Numeric(14, 2), default=0)
    net_vat_due             = Column(Numeric(14, 2), default=0)
    carry_forward_amount    = Column(Numeric(14, 2), default=0)
    refund_requested        = Column(Boolean, default=False)

    # ETA reconciliation
    eta_outgoing_doc_count  = Column(Integer, default=0)
    eta_outgoing_vat        = Column(Numeric(14, 2), default=0)
    eta_incoming_doc_count  = Column(Integer, default=0)
    eta_incoming_vat        = Column(Numeric(14, 2), default=0)
    eta_sync_at             = Column(DateTime)
    has_reconciliation_diff = Column(Boolean, default=False)

    # Penalty
    due_date                = Column(Date)
    late_days               = Column(Integer, default=0)
    penalty_amount          = Column(Numeric(14, 2), default=0)

    # Workflow
    status          = Column(String(30), nullable=False, default="draft")
    # draft | reviewed | approved | submitted | paid | amended

    built_by        = Column(Integer, ForeignKey("users.id"), nullable=True)
    built_at        = Column(DateTime)
    reviewed_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at     = Column(DateTime)
    approved_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at     = Column(DateTime)
    submitted_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_at    = Column(DateTime)
    submission_ref  = Column(String(100))
    paid_at         = Column(DateTime)
    payment_ref     = Column(String(100))
    payment_amount  = Column(Numeric(14, 2))

    is_amendment    = Column(Boolean, default=False)
    amends_return_id= Column(Integer, nullable=True)
    amendment_reason= Column(Text)

    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lines = relationship("VATReturnLine", back_populates="vat_return",
                         cascade="all, delete-orphan")


class VATReturnLine(Base):
    __tablename__ = "tax_vat_return_lines"

    id              = Column(Integer, primary_key=True)
    vat_return_id   = Column(Integer, ForeignKey("tax_vat_returns.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False)

    line_type       = Column(String(30), nullable=False)
    # output_std | output_reduced | output_zero | output_exempt | output_export
    # output_credit | input_std | input_capital | input_import | input_credit | manual

    eta_doc_uuid    = Column(String(100), index=True)
    doc_date        = Column(Date)
    doc_type        = Column(String(5))
    internal_id     = Column(String(100))

    counterparty_name   = Column(String(300))
    counterparty_tin    = Column(String(50))

    taxable_amount  = Column(Numeric(14, 2), default=0)
    vat_rate        = Column(Numeric(5, 2), default=14)
    vat_amount      = Column(Numeric(14, 2), default=0)
    total_amount    = Column(Numeric(14, 2), default=0)

    is_included     = Column(Boolean, default=True)
    exclude_reason  = Column(Text)
    excluded_by     = Column(Integer, ForeignKey("users.id"), nullable=True)

    sort_order      = Column(Integer, default=0)
    created_at      = Column(DateTime, default=datetime.utcnow)

    vat_return = relationship("VATReturn", back_populates="lines")


# ═══════════════════════════════════════════════════════════════════
# WITHHOLDING TAX
# ═══════════════════════════════════════════════════════════════════

class WithholdingType(Base):
    __tablename__ = "tax_withholding_types"

    code            = Column(String(60), primary_key=True)
    name_ar         = Column(String(250), nullable=False)
    name_en         = Column(String(250))
    category        = Column(String(50), nullable=False)
    rate_company    = Column(Numeric(5, 2), nullable=False)
    rate_individual = Column(Numeric(5, 2), nullable=False)
    rate_foreign    = Column(Numeric(5, 2), nullable=False, default=20)
    threshold_amount= Column(Numeric(14, 2), default=0)
    legal_reference = Column(String(300))
    is_active       = Column(Boolean, default=True)
    effective_from  = Column(Date)
    effective_to    = Column(Date)
    created_at      = Column(DateTime, default=datetime.utcnow)


class WithholdingReturn(Base):
    __tablename__ = "tax_withholding_returns"
    __table_args__ = (
        UniqueConstraint("client_id", "period_year", "period_month", name="uq_wht_return"),
    )

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    period_year     = Column(SmallInteger, nullable=False)
    period_month    = Column(SmallInteger, nullable=False)
    period_id       = Column(Integer, ForeignKey("tax_periods.id"), nullable=True)

    total_gross_company     = Column(Numeric(14, 2), default=0)
    total_wht_company       = Column(Numeric(14, 2), default=0)
    total_gross_individual  = Column(Numeric(14, 2), default=0)
    total_wht_individual    = Column(Numeric(14, 2), default=0)
    total_gross_foreign     = Column(Numeric(14, 2), default=0)
    total_wht_foreign       = Column(Numeric(14, 2), default=0)
    total_gross             = Column(Numeric(14, 2), default=0)
    total_withholding       = Column(Numeric(14, 2), default=0)
    total_entries           = Column(Integer, default=0)

    due_date        = Column(Date)
    late_days       = Column(Integer, default=0)
    penalty_amount  = Column(Numeric(14, 2), default=0)

    status          = Column(String(30), default="draft")
    reviewed_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at     = Column(DateTime)
    submitted_at    = Column(DateTime)
    submission_ref  = Column(String(100))
    paid_at         = Column(DateTime)
    payment_ref     = Column(String(100))

    built_by        = Column(Integer, ForeignKey("users.id"), nullable=True)
    built_at        = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    entries = relationship("WithholdingEntry", back_populates="wht_return")


class WithholdingEntry(Base):
    __tablename__ = "tax_withholding_entries"

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    period_year     = Column(SmallInteger, nullable=False)
    period_month    = Column(SmallInteger, nullable=False)
    period_id       = Column(Integer, ForeignKey("tax_periods.id"), nullable=True)
    return_id       = Column(Integer, ForeignKey("tax_withholding_returns.id"), nullable=True, index=True)

    transaction_date= Column(Date, nullable=False)
    transaction_type= Column(String(60), nullable=False)
    invoice_number  = Column(String(100))
    description     = Column(Text)

    payee_name      = Column(String(300), nullable=False)
    payee_tin       = Column(String(50), index=True)
    payee_national_id = Column(String(20))
    payee_type      = Column(String(20), default="company")
    payee_country   = Column(String(100), default="Egypt")

    treaty_applies  = Column(Boolean, default=False)
    treaty_country  = Column(String(100))
    treaty_rate     = Column(Numeric(5, 2))

    gross_amount    = Column(Numeric(14, 2), nullable=False)
    withholding_rate= Column(Numeric(5, 2), nullable=False)
    withholding_amount = Column(Numeric(14, 2), nullable=False)
    net_amount      = Column(Numeric(14, 2), nullable=False)

    eta_doc_uuid    = Column(String(100))
    certificate_number = Column(String(50))
    certificate_issued_at = Column(DateTime)

    notes           = Column(Text)
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    wht_return = relationship("WithholdingReturn", back_populates="entries")


# ═══════════════════════════════════════════════════════════════════
# CORPORATE TAX
# ═══════════════════════════════════════════════════════════════════

class CorporateEstimate(Base):
    __tablename__ = "tax_corporate_estimates"
    __table_args__ = (
        UniqueConstraint("client_id", "fiscal_year", name="uq_corp_estimate"),
    )

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    fiscal_year     = Column(SmallInteger, nullable=False)
    client_type_snapshot = Column(String(50))

    # Revenue
    revenue_domestic_taxable = Column(Numeric(14, 2), default=0)
    revenue_domestic_exempt  = Column(Numeric(14, 2), default=0)
    revenue_export           = Column(Numeric(14, 2), default=0)
    revenue_other            = Column(Numeric(14, 2), default=0)
    total_revenue            = Column(Numeric(14, 2), default=0)

    # COGS
    cogs                    = Column(Numeric(14, 2), default=0)
    gross_profit            = Column(Numeric(14, 2), default=0)

    # Deductible expenses
    exp_salaries            = Column(Numeric(14, 2), default=0)
    exp_social_insurance    = Column(Numeric(14, 2), default=0)
    exp_rent                = Column(Numeric(14, 2), default=0)
    exp_utilities           = Column(Numeric(14, 2), default=0)
    exp_depreciation_accounting = Column(Numeric(14, 2), default=0)
    exp_depreciation_tax    = Column(Numeric(14, 2), default=0)
    exp_advertising         = Column(Numeric(14, 2), default=0)
    exp_other_deductible    = Column(Numeric(14, 2), default=0)
    total_deductible_expenses = Column(Numeric(14, 2), default=0)

    # Non-deductible add-backs
    nd_entertainment        = Column(Numeric(14, 2), default=0)
    nd_fines_penalties      = Column(Numeric(14, 2), default=0)
    nd_donations_non_approved = Column(Numeric(14, 2), default=0)
    nd_other                = Column(Numeric(14, 2), default=0)
    total_non_deductible    = Column(Numeric(14, 2), default=0)

    # Exempt income
    exempt_dividends        = Column(Numeric(14, 2), default=0)
    exempt_other            = Column(Numeric(14, 2), default=0)
    total_exempt            = Column(Numeric(14, 2), default=0)

    # Loss carry-forward
    prior_year_losses       = Column(Numeric(14, 2), default=0)
    losses_detail           = Column(JSON)
    losses_utilized         = Column(Numeric(14, 2), default=0)

    # Computed
    accounting_profit       = Column(Numeric(14, 2), default=0)
    taxable_income          = Column(Numeric(14, 2), default=0)

    # Tax
    applicable_tax_rate     = Column(Numeric(5, 2), default=22.5)
    gross_tax               = Column(Numeric(14, 2), default=0)
    withholding_credited    = Column(Numeric(14, 2), default=0)
    advance_payments_made   = Column(Numeric(14, 2), default=0)
    final_tax_due           = Column(Numeric(14, 2), default=0)

    # Deferred tax
    deferred_tax_asset      = Column(Numeric(14, 2), default=0)
    deferred_tax_liability  = Column(Numeric(14, 2), default=0)
    deferred_tax_net        = Column(Numeric(14, 2), default=0)

    # Quarterly installments
    q1_tax_amount   = Column(Numeric(14, 2), default=0)
    q1_due_date     = Column(Date)
    q1_paid_at      = Column(Date)
    q1_payment_ref  = Column(String(100))
    q2_tax_amount   = Column(Numeric(14, 2), default=0)
    q2_due_date     = Column(Date)
    q2_paid_at      = Column(Date)
    q2_payment_ref  = Column(String(100))
    q3_tax_amount   = Column(Numeric(14, 2), default=0)
    q3_due_date     = Column(Date)
    q3_paid_at      = Column(Date)
    q3_payment_ref  = Column(String(100))
    q4_tax_amount   = Column(Numeric(14, 2), default=0)
    q4_due_date     = Column(Date)
    q4_paid_at      = Column(Date)
    q4_payment_ref  = Column(String(100))

    annual_return_due_date  = Column(Date)
    annual_return_filed_at  = Column(Date)
    annual_return_ref       = Column(String(100))
    tax_assessment_amount   = Column(Numeric(14, 2))
    tax_assessment_date     = Column(Date)

    status          = Column(String(30), default="estimate")
    notes           = Column(Text)
    prepared_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════
# SALARY TAX RETURNS
# ═══════════════════════════════════════════════════════════════════

class SalaryTaxReturn(Base):
    __tablename__ = "tax_salary_returns"
    __table_args__ = (
        UniqueConstraint("client_id", "period_year", "period_month", name="uq_salary_return"),
    )

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    period_year     = Column(SmallInteger, nullable=False)
    period_month    = Column(SmallInteger, nullable=False)
    period_id       = Column(Integer, ForeignKey("tax_periods.id"), nullable=True)

    employee_count          = Column(Integer, default=0)
    total_gross_salary      = Column(Numeric(14, 2), default=0)
    total_variable_pay      = Column(Numeric(14, 2), default=0)
    total_allowances        = Column(Numeric(14, 2), default=0)
    total_gross_for_tax     = Column(Numeric(14, 2), default=0)
    total_personal_exempt   = Column(Numeric(14, 2), default=0)
    total_taxable_salary    = Column(Numeric(14, 2), default=0)
    total_tax_withheld      = Column(Numeric(14, 2), default=0)
    total_social_ins_employee = Column(Numeric(14, 2), default=0)
    total_social_ins_company  = Column(Numeric(14, 2), default=0)

    is_annual_reconciliation = Column(Boolean, default=False)
    annual_tax_due           = Column(Numeric(14, 2), default=0)
    reconciliation_diff      = Column(Numeric(14, 2), default=0)

    employee_lines  = Column(JSON)   # [{name, national_id, gross, exempt, taxable, tax}]

    due_date        = Column(Date)
    late_days       = Column(Integer, default=0)
    penalty_amount  = Column(Numeric(14, 2), default=0)

    status          = Column(String(30), default="draft")
    reviewed_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_at    = Column(DateTime)
    submission_ref  = Column(String(100))
    paid_at         = Column(DateTime)

    source_payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=True)
    built_by        = Column(Integer, ForeignKey("users.id"), nullable=True)
    built_at        = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════
# TAX CALENDAR EVENTS
# ═══════════════════════════════════════════════════════════════════

class TaxCalendarEvent(Base):
    __tablename__ = "tax_calendar_events"

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)

    event_type      = Column(String(60), nullable=False)
    title           = Column(String(300), nullable=False)
    description     = Column(Text)
    portal_url      = Column(String(500))
    portal_name     = Column(String(100))

    due_date        = Column(Date, nullable=False, index=True)
    fiscal_year     = Column(SmallInteger)
    fiscal_period_month = Column(SmallInteger)
    fiscal_quarter  = Column(SmallInteger)

    vat_return_id   = Column(Integer, ForeignKey("tax_vat_returns.id"), nullable=True)
    wht_return_id   = Column(Integer, ForeignKey("tax_withholding_returns.id"), nullable=True)
    corp_estimate_id= Column(Integer, ForeignKey("tax_corporate_estimates.id"), nullable=True)
    salary_return_id= Column(Integer, ForeignKey("tax_salary_returns.id"), nullable=True)

    reminder_days   = Column(JSON, default=lambda: [7, 3, 1])
    reminder_sent_days = Column(JSON, default=lambda: [])

    is_done         = Column(Boolean, default=False, index=True)
    done_at         = Column(DateTime)
    done_by         = Column(Integer, ForeignKey("users.id"), nullable=True)
    done_ref        = Column(String(200))

    is_auto_generated = Column(Boolean, default=True)
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════
# ETA SUBMISSIONS
# ═══════════════════════════════════════════════════════════════════

class ETASubmission(Base):
    __tablename__ = "tax_eta_submissions"

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)

    submission_type = Column(String(30), nullable=False)   # einvoice | ereceipt | einvoice_cancel
    local_ref       = Column(String(100))
    eta_internal_id = Column(String(100))
    payload_hash    = Column(String(64), nullable=False)

    eta_submission_id = Column(String(100))
    eta_uuid          = Column(String(100), unique=True)
    eta_long_id       = Column(String(500))

    status          = Column(String(30), default="queued", index=True)
    # queued | sending | accepted | rejected | error | cancelled
    eta_doc_status  = Column(String(30))

    attempt_count   = Column(SmallInteger, default=0)
    last_attempt_at = Column(DateTime)
    next_retry_at   = Column(DateTime)
    max_attempts    = Column(SmallInteger, default=5)
    error_code      = Column(String(50))
    error_message   = Column(Text)
    eta_errors      = Column(JSON)

    request_payload = Column(JSON, nullable=False)
    response_payload= Column(JSON)

    submitted_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════
# TAX AUDIT LOG
# ═══════════════════════════════════════════════════════════════════

class TaxAuditLog(Base):
    __tablename__ = "tax_audit_log"

    id              = Column(Integer, primary_key=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    entity_type     = Column(String(50), nullable=False)
    entity_id       = Column(Integer, nullable=False)
    action          = Column(String(50), nullable=False)

    old_values      = Column(JSON)
    new_values      = Column(JSON)
    changed_fields  = Column(JSON)

    ip_address      = Column(String(50))
    notes           = Column(Text)
    created_at      = Column(DateTime, default=datetime.utcnow, index=True)


# ═══════════════════════════════════════════════════════════════════
# WITHHOLDING TYPE SEED DATA — called on startup
# ═══════════════════════════════════════════════════════════════════

WHT_TYPE_SEEDS = [
    ("services_technical",    "خدمات تكنولوجيا المعلومات والخدمات الفنية", "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("services_professional", "الخدمات المهنية والاستشارية",               "services",     0.50, 20.00, 20.00, "م 59 ق.91/2005"),
    ("services_management",   "أتعاب الإدارة والإشراف",                   "services",     0.50, 10.00, 20.00, "م 59 ق.91/2005"),
    ("services_security",     "خدمات الأمن والحراسة",                     "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("services_cleaning",     "خدمات النظافة والتشغيل",                   "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("services_catering",     "خدمات تقديم الطعام والتموين",              "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("rent_movable",          "إيجار الأصول المنقولة والمعدات",            "rent",         5.00, 5.00,  20.00, "م 59 ق.91/2005"),
    ("rent_immovable",        "إيجار العقارات والمباني",                   "rent",         5.00, 10.00, 20.00, "م 16 ق.91/2005"),
    ("commissions_sales",     "عمولات البيع والتوزيع",                    "services",     0.50, 10.00, 20.00, "م 59 ق.91/2005"),
    ("interest_loans",        "الفوائد على القروض والتسهيلات",            "financial",   20.00, 20.00, 20.00, "م 59 ق.91/2005"),
    ("dividends",             "الأرباح الموزعة وتوزيعات الأسهم",          "financial",    5.00, 10.00, 10.00, "م 47 ق.91/2005"),
    ("royalties",             "حقوق الملكية الفكرية والامتياز",           "financial",   20.00, 20.00, 20.00, "م 59 ق.91/2005"),
    ("insurance_premiums",    "أقساط التأمين",                             "financial",    5.00, 5.00,  20.00, "م 59 ق.91/2005"),
    ("construction_main",     "مقاولات البناء الرئيسية",                  "construction", 0.50, 3.00,  20.00, "م 59 ق.91/2005"),
    ("construction_sub",      "مقاولات الباطن والتشطيبات",               "construction", 0.50, 3.00,  20.00, "م 59 ق.91/2005"),
    ("advertising",           "خدمات الإعلان والتسويق",                  "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("transport_freight",     "خدمات النقل والشحن",                       "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("printing_publishing",   "خدمات الطباعة والنشر",                    "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("medical_services",      "الخدمات الطبية والصحية",                  "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("training",              "التدريب والتأهيل",                         "services",     0.50, 5.00,  20.00, "م 59 ق.91/2005"),
    ("accounting_legal",      "الخدمات المحاسبية والقانونية",            "services",     0.50, 20.00, 20.00, "م 59 ق.91/2005"),
]
