"""
Corporate Tax Calculator — Egyptian Law 91/2005
محرك حساب ضريبة الدخل والمرتبات
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date

TWO = Decimal("0.01")
CORP_RATE = Decimal("22.5")
PERSONAL_EXEMPTION_ANNUAL = Decimal("20000")  # EGP / year

# Egyptian salary tax brackets (2023 amendment — effective July 2023)
SALARY_BRACKETS = [
    (Decimal("40000"),  Decimal("0")),
    (Decimal("15000"),  Decimal("10")),
    (Decimal("20000"),  Decimal("15")),
    (Decimal("20000"),  Decimal("20")),
    (Decimal("100000"), Decimal("22.5")),
    (Decimal("205000"), Decimal("25")),
    # Above 400000: 27.5% (handled as remainder)
]

MONTHLY_PERSONAL_EXEMPTION = Decimal("1666.67")          # 20000 / 12
MONTHLY_INS_EMPLOYEE_RATE  = Decimal("11.0")             # 11% of base
MONTHLY_INS_COMPANY_RATE   = Decimal("18.75")
MONTHLY_INS_MAX_SALARY     = Decimal("9400")             # cap for insurance base/month (2024)
MONTHLY_INS_MIN_SALARY     = Decimal("2500")


def compute_progressive_tax(annual_taxable: Decimal) -> Decimal:
    """Progressive income/salary tax — individuals and sole traders."""
    taxable = max(Decimal(0), annual_taxable - PERSONAL_EXEMPTION_ANNUAL)
    if taxable <= 0:
        return Decimal(0)

    tax = Decimal(0)
    remaining = taxable
    for size, rate in SALARY_BRACKETS:
        if remaining <= 0:
            break
        portion = min(remaining, size)
        tax += (portion * rate / 100).quantize(TWO, ROUND_HALF_UP)
        remaining -= portion
    if remaining > 0:
        tax += (remaining * Decimal("27.5") / 100).quantize(TWO, ROUND_HALF_UP)
    return tax


def compute_corporate_tax(
    taxable_income: Decimal,
    client_type: str,
) -> Decimal:
    """Flat corporate tax (22.5%) or progressive for individuals."""
    if taxable_income <= 0:
        return Decimal(0)
    if client_type == "free_zone":
        return Decimal(0)
    if client_type in ("individual", "sole", "freelancer"):
        return compute_progressive_tax(taxable_income)
    return (taxable_income * CORP_RATE / 100).quantize(TWO, ROUND_HALF_UP)


def compute_quarterly_installments(gross_tax: Decimal, fiscal_year: int) -> list:
    """25% of current-year tax per quarter. Due: Apr 15, Jul 15, Oct 15, Jan 15."""
    each = (gross_tax * Decimal("0.25")).quantize(TWO)
    return [
        {"quarter": 1, "amount": float(each), "due_date": date(fiscal_year, 4, 15)},
        {"quarter": 2, "amount": float(each), "due_date": date(fiscal_year, 7, 15)},
        {"quarter": 3, "amount": float(each), "due_date": date(fiscal_year, 10, 15)},
        {"quarter": 4, "amount": float(each), "due_date": date(fiscal_year + 1, 1, 15)},
    ]


def build_corporate_estimate(db, client_id: int, fiscal_year: int, payload: dict, user_id: int):
    """Create or update corporate tax estimate with full computation."""
    from app.models.tax_center import CorporateEstimate
    from datetime import datetime
    from app.models.client import Client

    client = db.query(Client).get(client_id)
    client_type = client.client_type if client else "llc"

    existing = db.query(CorporateEstimate).filter_by(
        client_id=client_id, fiscal_year=fiscal_year
    ).first()

    est = existing or CorporateEstimate(
        client_id=client_id, fiscal_year=fiscal_year
    )
    if not existing:
        db.add(est)

    # Revenue
    est.revenue_domestic_taxable = payload.get("revenue_domestic_taxable", 0)
    est.revenue_domestic_exempt  = payload.get("revenue_domestic_exempt", 0)
    est.revenue_export           = payload.get("revenue_export", 0)
    est.revenue_other            = payload.get("revenue_other", 0)
    est.total_revenue = (
        Decimal(str(est.revenue_domestic_taxable))
        + Decimal(str(est.revenue_domestic_exempt))
        + Decimal(str(est.revenue_export))
        + Decimal(str(est.revenue_other))
    )

    # COGS
    est.cogs = payload.get("cogs", 0)
    est.gross_profit = float(Decimal(str(est.total_revenue)) - Decimal(str(est.cogs)))

    # Expenses
    for f in ("exp_salaries","exp_social_insurance","exp_rent","exp_utilities",
              "exp_depreciation_accounting","exp_depreciation_tax","exp_advertising","exp_other_deductible"):
        setattr(est, f, payload.get(f, 0))
    est.total_deductible_expenses = sum(
        Decimal(str(getattr(est, f))) for f in
        ("exp_salaries","exp_social_insurance","exp_rent","exp_utilities",
         "exp_depreciation_tax","exp_advertising","exp_other_deductible")
    )

    # Non-deductible
    for f in ("nd_entertainment","nd_fines_penalties","nd_donations_non_approved","nd_other"):
        setattr(est, f, payload.get(f, 0))
    est.total_non_deductible = sum(
        Decimal(str(getattr(est, f))) for f in
        ("nd_entertainment","nd_fines_penalties","nd_donations_non_approved","nd_other")
    )

    # Exempt
    est.exempt_dividends = payload.get("exempt_dividends", 0)
    est.exempt_other     = payload.get("exempt_other", 0)
    est.total_exempt     = Decimal(str(est.exempt_dividends)) + Decimal(str(est.exempt_other))

    # Prior losses
    est.prior_year_losses  = payload.get("prior_year_losses", 0)
    est.losses_detail      = payload.get("losses_detail")

    # Accounting profit
    est.accounting_profit = float(
        Decimal(str(est.total_revenue))
        - Decimal(str(est.cogs))
        - Decimal(str(est.total_deductible_expenses))
    )

    # Depreciation adjustment
    dep_adj = Decimal(str(est.exp_depreciation_accounting)) - Decimal(str(est.exp_depreciation_tax))

    # Taxable income
    ti = (
        Decimal(str(est.accounting_profit))
        + Decimal(str(est.total_non_deductible))
        - Decimal(str(est.total_exempt))
        + dep_adj
        - Decimal(str(est.prior_year_losses))
    )
    est.taxable_income = float(max(Decimal(0), ti))

    # Tax
    est.applicable_tax_rate = 22.5 if client_type not in ("individual","sole","freelancer","free_zone") else 0
    est.client_type_snapshot = client_type
    gross_tax = compute_corporate_tax(Decimal(str(est.taxable_income)), client_type)
    est.gross_tax = float(gross_tax)

    # Credits
    est.withholding_credited  = payload.get("withholding_credited", 0)
    est.advance_payments_made = payload.get("advance_payments_made", 0)
    est.final_tax_due = float(max(
        Decimal(0),
        gross_tax - Decimal(str(est.withholding_credited)) - Decimal(str(est.advance_payments_made))
    ))

    # Deferred tax (simplified)
    dep_diff = Decimal(str(est.exp_depreciation_accounting)) - Decimal(str(est.exp_depreciation_tax))
    dt = (dep_diff * Decimal(str(est.applicable_tax_rate or 22.5)) / 100).quantize(TWO)
    if dt >= 0:
        est.deferred_tax_liability = float(dt)
        est.deferred_tax_asset     = 0
    else:
        est.deferred_tax_asset     = float(abs(dt))
        est.deferred_tax_liability = 0
    est.deferred_tax_net = float(
        Decimal(str(est.deferred_tax_asset)) - Decimal(str(est.deferred_tax_liability))
    )

    # Installments
    installs = compute_quarterly_installments(gross_tax, fiscal_year)
    est.q1_tax_amount = installs[0]["amount"]; est.q1_due_date = installs[0]["due_date"]
    est.q2_tax_amount = installs[1]["amount"]; est.q2_due_date = installs[1]["due_date"]
    est.q3_tax_amount = installs[2]["amount"]; est.q3_due_date = installs[2]["due_date"]
    est.q4_tax_amount = installs[3]["amount"]; est.q4_due_date = installs[3]["due_date"]

    est.annual_return_due_date = date(fiscal_year + 1, 4, 30)
    est.notes = payload.get("notes", "")
    est.prepared_by = user_id
    est.updated_at  = datetime.utcnow()

    db.commit()
    db.refresh(est)
    return est, installs


def compute_monthly_salary_tax(gross_monthly: Decimal,
                                variable_pay: Decimal = Decimal(0),
                                allowances:   Decimal = Decimal(0)) -> dict:
    """Monthly payroll tax computation for one employee."""
    total_gross = gross_monthly + variable_pay

    ins_base = max(MONTHLY_INS_MIN_SALARY, min(gross_monthly, MONTHLY_INS_MAX_SALARY))
    insurance_employee = (ins_base * MONTHLY_INS_EMPLOYEE_RATE / 100).quantize(TWO, ROUND_HALF_UP)
    insurance_company  = (ins_base * MONTHLY_INS_COMPANY_RATE  / 100).quantize(TWO, ROUND_HALF_UP)

    taxable_gross = total_gross - allowances
    taxable_monthly = max(
        Decimal(0),
        taxable_gross - insurance_employee - MONTHLY_PERSONAL_EXEMPTION
    )

    annual_taxable = taxable_monthly * 12
    annual_tax = compute_progressive_tax(annual_taxable)
    monthly_tax = (annual_tax / 12).quantize(TWO, ROUND_HALF_UP)
    net_salary  = (total_gross - insurance_employee - monthly_tax).quantize(TWO)

    return {
        "gross_salary":           float(total_gross),
        "social_insurance_base":  float(ins_base),
        "insurance_employee":     float(insurance_employee),
        "insurance_company":      float(insurance_company),
        "taxable_monthly":        float(taxable_monthly),
        "monthly_income_tax":     float(monthly_tax),
        "net_salary":             float(net_salary),
    }
