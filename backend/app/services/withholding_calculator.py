"""
Withholding Tax Calculator — Egyptian Law 91/2005
محرك حساب ضريبة الخصم والإضافة
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple
from datetime import date

TWO = Decimal("0.01")
WITHHOLDING_THRESHOLD = Decimal("300")

# Rate table (code, payee_type) → rate %
_RATES = {
    ("services_technical",    "company"):    Decimal("0.50"),
    ("services_technical",    "individual"): Decimal("5.00"),
    ("services_technical",    "foreign"):    Decimal("20.00"),
    ("services_professional", "company"):    Decimal("0.50"),
    ("services_professional", "individual"): Decimal("20.00"),
    ("services_professional", "foreign"):    Decimal("20.00"),
    ("services_management",   "company"):    Decimal("0.50"),
    ("services_management",   "individual"): Decimal("10.00"),
    ("services_management",   "foreign"):    Decimal("20.00"),
    ("services_security",     "company"):    Decimal("0.50"),
    ("services_security",     "individual"): Decimal("5.00"),
    ("services_security",     "foreign"):    Decimal("20.00"),
    ("services_cleaning",     "company"):    Decimal("0.50"),
    ("services_cleaning",     "individual"): Decimal("5.00"),
    ("services_cleaning",     "foreign"):    Decimal("20.00"),
    ("services_catering",     "company"):    Decimal("0.50"),
    ("services_catering",     "individual"): Decimal("5.00"),
    ("services_catering",     "foreign"):    Decimal("20.00"),
    ("rent_movable",          "company"):    Decimal("5.00"),
    ("rent_movable",          "individual"): Decimal("5.00"),
    ("rent_movable",          "foreign"):    Decimal("20.00"),
    ("rent_immovable",        "company"):    Decimal("5.00"),
    ("rent_immovable",        "individual"): Decimal("10.00"),
    ("rent_immovable",        "foreign"):    Decimal("20.00"),
    ("commissions_sales",     "company"):    Decimal("0.50"),
    ("commissions_sales",     "individual"): Decimal("10.00"),
    ("commissions_sales",     "foreign"):    Decimal("20.00"),
    ("interest_loans",        "company"):    Decimal("20.00"),
    ("interest_loans",        "individual"): Decimal("20.00"),
    ("interest_loans",        "foreign"):    Decimal("20.00"),
    ("dividends",             "company"):    Decimal("5.00"),
    ("dividends",             "individual"): Decimal("10.00"),
    ("dividends",             "foreign"):    Decimal("10.00"),
    ("royalties",             "company"):    Decimal("20.00"),
    ("royalties",             "individual"): Decimal("20.00"),
    ("royalties",             "foreign"):    Decimal("20.00"),
    ("insurance_premiums",    "company"):    Decimal("5.00"),
    ("insurance_premiums",    "individual"): Decimal("5.00"),
    ("insurance_premiums",    "foreign"):    Decimal("20.00"),
    ("construction_main",     "company"):    Decimal("0.50"),
    ("construction_main",     "individual"): Decimal("3.00"),
    ("construction_main",     "foreign"):    Decimal("20.00"),
    ("construction_sub",      "company"):    Decimal("0.50"),
    ("construction_sub",      "individual"): Decimal("3.00"),
    ("construction_sub",      "foreign"):    Decimal("20.00"),
    ("advertising",           "company"):    Decimal("0.50"),
    ("advertising",           "individual"): Decimal("5.00"),
    ("advertising",           "foreign"):    Decimal("20.00"),
    ("transport_freight",     "company"):    Decimal("0.50"),
    ("transport_freight",     "individual"): Decimal("5.00"),
    ("transport_freight",     "foreign"):    Decimal("20.00"),
    ("printing_publishing",   "company"):    Decimal("0.50"),
    ("printing_publishing",   "individual"): Decimal("5.00"),
    ("printing_publishing",   "foreign"):    Decimal("20.00"),
    ("medical_services",      "company"):    Decimal("0.50"),
    ("medical_services",      "individual"): Decimal("5.00"),
    ("medical_services",      "foreign"):    Decimal("20.00"),
    ("training",              "company"):    Decimal("0.50"),
    ("training",              "individual"): Decimal("5.00"),
    ("training",              "foreign"):    Decimal("20.00"),
    ("accounting_legal",      "company"):    Decimal("0.50"),
    ("accounting_legal",      "individual"): Decimal("20.00"),
    ("accounting_legal",      "foreign"):    Decimal("20.00"),
}


def get_rate(transaction_type: str, payee_type: str,
             treaty_rate: Optional[Decimal] = None) -> Decimal:
    standard = _RATES.get((transaction_type, payee_type), Decimal("0"))
    if treaty_rate is not None:
        return min(standard, treaty_rate)
    return standard


def compute_withholding(
    gross_amount:     Decimal,
    transaction_type: str,
    payee_type:       str,
    treaty_rate:      Optional[Decimal] = None,
) -> Tuple[Decimal, Decimal, Decimal]:
    """Returns (rate, withholding_amount, net_amount)"""
    rate = get_rate(transaction_type, payee_type, treaty_rate)

    if gross_amount < WITHHOLDING_THRESHOLD or rate == 0:
        return rate, Decimal(0), gross_amount

    wht = (gross_amount * rate / 100).quantize(TWO, ROUND_HALF_UP)
    net = gross_amount - wht
    return rate, wht, net


def build_withholding_return(db, client_id: int, year: int, month: int, built_by: int):
    """Aggregate all withholding entries for a period into a WithholdingReturn."""
    from app.models.tax_center import WithholdingReturn, WithholdingEntry
    from datetime import datetime

    entries = db.query(WithholdingEntry).filter(
        WithholdingEntry.client_id == client_id,
        WithholdingEntry.period_year == year,
        WithholdingEntry.period_month == month,
    ).all()

    # Aggregate by payee_type
    totals = {
        "company":    {"gross": Decimal(0), "wht": Decimal(0)},
        "individual": {"gross": Decimal(0), "wht": Decimal(0)},
        "foreign":    {"gross": Decimal(0), "wht": Decimal(0)},
    }
    for e in entries:
        pt = e.payee_type if e.payee_type in totals else "company"
        totals[pt]["gross"] += Decimal(str(e.gross_amount or 0))
        totals[pt]["wht"]   += Decimal(str(e.withholding_amount or 0))

    total_gross = sum(v["gross"] for v in totals.values())
    total_wht   = sum(v["wht"]   for v in totals.values())

    ny, nm = (year, month + 1) if month < 12 else (year + 1, 1)
    due = date(ny, nm, 15)

    existing = db.query(WithholdingReturn).filter_by(
        client_id=client_id, period_year=year, period_month=month
    ).first()

    if not existing:
        ret = WithholdingReturn(
            client_id=client_id, period_year=year, period_month=month,
            status="draft",
        )
        db.add(ret)
    else:
        ret = existing

    ret.total_gross_company    = float(totals["company"]["gross"])
    ret.total_wht_company      = float(totals["company"]["wht"])
    ret.total_gross_individual = float(totals["individual"]["gross"])
    ret.total_wht_individual   = float(totals["individual"]["wht"])
    ret.total_gross_foreign    = float(totals["foreign"]["gross"])
    ret.total_wht_foreign      = float(totals["foreign"]["wht"])
    ret.total_gross            = float(total_gross)
    ret.total_withholding      = float(total_wht)
    ret.total_entries          = len(entries)
    ret.due_date               = due
    ret.built_by               = built_by
    ret.built_at               = datetime.utcnow()

    db.flush()
    # Link entries to return
    for e in entries:
        e.return_id = ret.id
    db.commit()
    db.refresh(ret)
    return ret
