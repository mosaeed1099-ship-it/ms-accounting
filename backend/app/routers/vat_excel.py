"""
VAT Excel Analysis Router
POST   /api/vat-excel/analyze               — parse ETA Excel, return full analysis + save
GET    /api/vat-excel/history               — list saved analyses
GET    /api/vat-excel/history/{id}          — re-open a saved analysis
DELETE /api/vat-excel/history/{id}          — delete
GET    /api/vat-excel/declaration/{id}      — download generated VAT return Excel
GET    /api/vat-excel/drill/{id}/{key}      — invoices for a specific KPI (drill-down)
GET    /api/vat-excel/drill/{id}/{key}/csv  — export drill-down invoices as CSV
"""
import csv
import io
import logging
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

import openpyxl
from openpyxl.styles import (
    Alignment, Border, Font, PatternFill, Side
)
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import Column, DateTime, Integer, JSON, Numeric, String
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import Base, get_db
from app.models.user import User

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vat-excel", tags=["vat_excel"])

# ── DB model ──────────────────────────────────────────────────────────────────

class VATExcelAnalysis(Base):
    __tablename__ = "vat_excel_analyses"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, nullable=False, index=True)
    filename      = Column(String(255), nullable=False)
    company_name  = Column(String(255), nullable=True)
    tax_number    = Column(String(50),  nullable=True)
    period_label  = Column(String(100), nullable=True)
    # Declaration-ready summary fields (stored as Numeric for precision)
    sales_net     = Column(Numeric(18, 2), nullable=True)
    sales_vat     = Column(Numeric(18, 2), nullable=True)
    pur_net       = Column(Numeric(18, 2), nullable=True)
    pur_vat       = Column(Numeric(18, 2), nullable=True)
    net_vat       = Column(Numeric(18, 2), nullable=True)
    total_invoices= Column(Integer, nullable=True)
    # Full JSON blobs
    summary       = Column(JSON, nullable=False)
    invoices      = Column(JSON, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)


# ── Column mapping for ETA portal Excel export ────────────────────────────────

REQUIRED_COLS = {
    "uuid":        "رقم الفاتورة الإلكترونية",
    "internal":    "رقم الفاتورة الداخلي",
    "doc_type":    "نوع المستند",
    "status":      "حالة الفاتورة",
    "issue_date":  "تاريخ الإصدار",
    "submit_date": "تاريخ التقديم",
    "receiver":    "اسم العميل",
    "receiver_tin":"الرقم الضريبي للعميل",
    "net":         "المبلغ الصافي (بدون ضريبة)",
    "discount":    "إجمالي الخصم",
    "net_after":   "المبلغ بعد الخصم",
    "vat":         "إجمالي ضريبة القيمة المضافة",
    "total":       "الإجمالي النهائي",
    "currency":    "العملة",
    "issuer":      "اسم المُصدر",
    "issuer_tin":  "الرقم الضريبي للمُصدر",
    "direction":   "اتجاه الفاتورة",
}

_TWO  = Decimal("0.01")
_FOUR = Decimal("0.0001")   # internal precision per-invoice


def _dec(val) -> Decimal:
    """Convert to Decimal at full precision — rounding only happens at sum level."""
    if val is None:
        return Decimal("0")
    if isinstance(val, float) and val != val:   # NaN
        return Decimal("0")
    try:
        return Decimal(str(val)).quantize(_FOUR, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _str(val) -> str:
    if val is None or (isinstance(val, float) and val != val):
        return ""
    return str(val).strip()


def _parse_date(d: str):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(d, fmt)
        except Exception:
            continue
    return None


def _float(d: Decimal) -> float:
    """JSON-safe float rounded to 2dp."""
    return float(d.quantize(_TWO, rounding=ROUND_HALF_UP))


# ── Core parser ───────────────────────────────────────────────────────────────

def _parse_excel(content: bytes, filename: str) -> dict:
    try:
        xl = pd.ExcelFile(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"تعذّر قراءة ملف Excel: {e}")

    sheet = "جميع الفواتير" if "جميع الفواتير" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet, header=0)

    if df.empty:
        raise HTTPException(422, "الملف فارغ — لا توجد بيانات")

    missing = [v for v in REQUIRED_COLS.values() if v not in df.columns]
    if missing:
        raise HTTPException(422, f"أعمدة مفقودة في الملف: {', '.join(missing[:5])}")

    col = REQUIRED_COLS

    # ── Build invoice rows (all amounts as Decimal internally) ────────────────
    invoices_raw = []
    for _, row in df.iterrows():
        invoices_raw.append({
            "uuid":        _str(row[col["uuid"]]),
            "internal_id": _str(row[col["internal"]]),
            "doc_type":    _str(row[col["doc_type"]]),
            "status":      _str(row[col["status"]]),
            "issue_date":  _str(row[col["issue_date"]]),
            "submit_date": _str(row[col["submit_date"]]),
            "receiver":    _str(row[col["receiver"]]),
            "receiver_tin":_str(row[col["receiver_tin"]]),
            "net":         _dec(row[col["net"]]),
            "discount":    _dec(row[col["discount"]]),
            "net_after":   _dec(row[col["net_after"]]),
            "vat":         _dec(row[col["vat"]]),
            "total":       _dec(row[col["total"]]),
            "currency":    _str(row[col["currency"]]),
            "issuer":      _str(row[col["issuer"]]),
            "issuer_tin":  _str(row[col["issuer_tin"]]),
            "direction":   _str(row[col["direction"]]),
        })

    outgoing = [i for i in invoices_raw if i["direction"] == "صادرة"]
    incoming = [i for i in invoices_raw if i["direction"] == "واردة"]

    def _dsum(lst, key) -> Decimal:
        return sum((i[key] for i in lst), Decimal("0")).quantize(_TWO, rounding=ROUND_HALF_UP)

    sales_net   = _dsum(outgoing, "net_after")
    sales_vat   = _dsum(outgoing, "vat")
    sales_total = _dsum(outgoing, "total")
    pur_net     = _dsum(incoming, "net_after")
    pur_vat     = _dsum(incoming, "vat")
    pur_total   = _dsum(incoming, "total")
    net_vat     = (sales_vat - pur_vat).quantize(_TWO, rounding=ROUND_HALF_UP)
    credit_bal  = (-net_vat).quantize(_TWO) if net_vat < 0 else Decimal("0")
    vat_due     = net_vat.quantize(_TWO)    if net_vat > 0 else Decimal("0")

    # ── Suppliers / customers ─────────────────────────────────────────────────
    suppliers: dict = {}
    for i in incoming:
        k = i["issuer"] or "غير محدد"
        if k not in suppliers:
            suppliers[k] = {"name": k, "tin": i["issuer_tin"],
                            "count": 0, "net": Decimal("0"), "vat": Decimal("0")}
        suppliers[k]["count"] += 1
        suppliers[k]["net"] += i["net_after"]
        suppliers[k]["vat"] += i["vat"]

    customers: dict = {}
    for i in outgoing:
        k = i["receiver"] or "غير محدد"
        if k not in customers:
            customers[k] = {"name": k, "tin": i["receiver_tin"],
                            "count": 0, "net": Decimal("0"), "vat": Decimal("0")}
        customers[k]["count"] += 1
        customers[k]["net"] += i["net_after"]
        customers[k]["vat"] += i["vat"]

    def _fmt_party(d: dict) -> dict:
        return {**d, "net": _float(d["net"]), "vat": _float(d["vat"])}

    suppliers_list = sorted(
        [_fmt_party(v) for v in suppliers.values()],
        key=lambda x: x["net"], reverse=True
    )
    customers_list = sorted(
        [_fmt_party(v) for v in customers.values()],
        key=lambda x: x["net"], reverse=True
    )

    # ── Date range ────────────────────────────────────────────────────────────
    parsed_dates = [_parse_date(i["issue_date"]) for i in invoices_raw if i["issue_date"]]
    parsed_dates = [d for d in parsed_dates if d]
    if parsed_dates:
        dmin = min(parsed_dates).strftime("%d/%m/%Y")
        dmax = max(parsed_dates).strftime("%d/%m/%Y")
        period_label = dmin if dmin == dmax else f"{dmin} → {dmax}"
    else:
        period_label = ""

    # ── Company identity ──────────────────────────────────────────────────────
    first = invoices_raw[0] if invoices_raw else {}
    if len(incoming) >= len(outgoing):
        company_name = first.get("receiver", "")
        tax_number   = first.get("receiver_tin", "")
    else:
        company_name = first.get("issuer", "")
        tax_number   = first.get("issuer_tin", "")

    # ── Analytics ─────────────────────────────────────────────────────────────
    all_totals = [i["total"] for i in invoices_raw if i["total"] > 0]
    max_invoice = _float(max(all_totals)) if all_totals else 0.0
    avg_invoice = _float(
        (sum(all_totals, Decimal("0")) / len(all_totals)).quantize(_TWO, rounding=ROUND_HALF_UP)
    ) if all_totals else 0.0

    # ── Serialisable invoice list (Decimal → float) ───────────────────────────
    invoices_out = []
    for i in invoices_raw:
        invoices_out.append({**i,
            "net":      _float(i["net"]),
            "discount": _float(i["discount"]),
            "net_after":_float(i["net_after"]),
            "vat":      _float(i["vat"]),
            "total":    _float(i["total"]),
        })

    # ── Summary dict (all floats for JSON) ───────────────────────────────────
    summary = {
        # VAT return core figures
        "sales_net":       _float(sales_net),
        "sales_vat":       _float(sales_vat),
        "sales_total":     _float(sales_total),
        "pur_net":         _float(pur_net),
        "pur_vat":         _float(pur_vat),
        "pur_total":       _float(pur_total),
        "net_vat":         _float(net_vat),
        "credit_balance":  _float(credit_bal),
        "vat_due":         _float(vat_due),
        # Counts
        "total_invoices":  len(invoices_raw),
        "outgoing_count":  len(outgoing),
        "incoming_count":  len(incoming),
        "supplier_count":  len(suppliers_list),
        "customer_count":  len(customers_list),
        # Analytics
        "max_invoice":     max_invoice,
        "avg_invoice":     avg_invoice,
        "period_label":    period_label,
        # Party breakdowns
        "suppliers":       suppliers_list,
        "customers":       customers_list,
        # Drill-down index: maps summary figure → invoice UUIDs
        "drill": {
            "sales_vat":  [i["uuid"] for i in outgoing],
            "sales_net":  [i["uuid"] for i in outgoing],
            "pur_vat":    [i["uuid"] for i in incoming],
            "pur_net":    [i["uuid"] for i in incoming],
            "all":        [i["uuid"] for i in invoices_raw],
        },
    }

    return {
        "company_name":  company_name,
        "tax_number":    tax_number,
        "period_label":  period_label,
        # Decimal values passed back separately for DB storage
        "_dec": {
            "sales_net": sales_net,
            "sales_vat": sales_vat,
            "pur_net":   pur_net,
            "pur_vat":   pur_vat,
            "net_vat":   net_vat,
        },
        "summary":  summary,
        "invoices": invoices_out,
    }


# ── API endpoints ─────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_vat_excel(
    file: UploadFile = File(...),
    save: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "يُقبل ملف Excel فقط (.xlsx أو .xls)")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "حجم الملف يتجاوز الحد المسموح (10 MB)")
    if len(content) == 0:
        raise HTTPException(400, "الملف فارغ")

    result = _parse_excel(content, file.filename)
    dec    = result.pop("_dec")

    record_id = None
    if save:
        record = VATExcelAnalysis(
            user_id        = current_user.id,
            filename       = file.filename,
            company_name   = result["company_name"],
            tax_number     = result["tax_number"],
            period_label   = result["period_label"],
            # Declaration-ready individual columns
            sales_net      = dec["sales_net"],
            sales_vat      = dec["sales_vat"],
            pur_net        = dec["pur_net"],
            pur_vat        = dec["pur_vat"],
            net_vat        = dec["net_vat"],
            total_invoices = result["summary"]["total_invoices"],
            # Full blobs
            summary        = result["summary"],
            invoices       = result["invoices"],
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        record_id = record.id

    return {
        "id":           record_id,
        "filename":     file.filename,
        "company_name": result["company_name"],
        "tax_number":   result["tax_number"],
        "period_label": result["period_label"],
        "summary":      result["summary"],
        "invoices":     result["invoices"],
        "analyzed_at":  datetime.utcnow().isoformat(),
    }


@router.get("/history")
def list_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(VATExcelAnalysis)
        .filter(VATExcelAnalysis.user_id == current_user.id)
        .order_by(VATExcelAnalysis.created_at.desc())
        .all()
    )
    return [
        {
            "id":             r.id,
            "filename":       r.filename,
            "company_name":   r.company_name,
            "tax_number":     r.tax_number,
            "period_label":   r.period_label,
            "sales_net":      float(r.sales_net or 0),
            "sales_vat":      float(r.sales_vat or 0),
            "pur_net":        float(r.pur_net or 0),
            "pur_vat":        float(r.pur_vat or 0),
            "net_vat":        float(r.net_vat or 0),
            "total_invoices": r.total_invoices,
            "created_at":     r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/history/{analysis_id}")
def get_history_item(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(VATExcelAnalysis).filter(
        VATExcelAnalysis.id == analysis_id,
        VATExcelAnalysis.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(404, "التحليل غير موجود")
    return {
        "id":             row.id,
        "filename":       row.filename,
        "company_name":   row.company_name,
        "tax_number":     row.tax_number,
        "period_label":   row.period_label,
        "sales_net":      float(row.sales_net or 0),
        "sales_vat":      float(row.sales_vat or 0),
        "pur_net":        float(row.pur_net or 0),
        "pur_vat":        float(row.pur_vat or 0),
        "net_vat":        float(row.net_vat or 0),
        "total_invoices": row.total_invoices,
        "summary":        row.summary,
        "invoices":       row.invoices,
        "created_at":     row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/history/{analysis_id}")
def delete_history_item(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(VATExcelAnalysis).filter(
        VATExcelAnalysis.id == analysis_id,
        VATExcelAnalysis.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(404, "التحليل غير موجود")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ── Declaration Excel generator ───────────────────────────────────────────────

def _rate_bucket(inv: dict) -> str:
    """Determine effective VAT rate bucket for a single invoice."""
    net = float(inv.get("net_after", 0) or 0)
    vat = float(inv.get("vat", 0) or 0)
    if net <= 0:
        return "exempt"
    ratio = vat / net
    if ratio > 0.13:
        return "14"
    elif ratio > 0.04:
        return "5"
    else:
        return "zero"


def _build_declaration_excel(row: VATExcelAnalysis, overrides: dict | None = None) -> bytes:
    """
    Generate VAT Return Excel matching نموذج ١٠ ض.ق.م exactly.
    Layout: Sheet 1 = Sales table + Inputs table + Tax summary
            Sheet 2 = Declaration (document counts + signatures)
    `overrides` lets the preview editor supply edited values before download.
    """
    s  = row.summary or {}
    ov = overrides or {}

    def _v(key, default=0.0):
        return float(ov.get(key, s.get(key, default)))

    sales_net_total = _v("sales_net")
    sales_vat_total = _v("sales_vat")
    pur_net_total   = _v("pur_net")
    pur_vat_total   = _v("pur_vat")
    net_vat         = round(sales_vat_total - pur_vat_total, 2)
    credit_bal      = round(-net_vat, 2) if net_vat < 0 else 0.0
    vat_due         = round(net_vat,  2) if net_vat > 0 else 0.0

    # Rate breakdown computed from stored invoices (no re-upload needed)
    inv_list = row.invoices or []
    outgoing = [i for i in inv_list if i.get("direction") == "صادرة"]
    incoming = [i for i in inv_list if i.get("direction") == "واردة"]

    def _fsum(lst, field):
        return round(sum(float(i.get(field, 0) or 0) for i in lst), 2)

    # Sales by rate
    s5  = [i for i in outgoing if _rate_bucket(i) == "5"]
    s14 = [i for i in outgoing if _rate_bucket(i) == "14"]
    sz  = [i for i in outgoing if _rate_bucket(i) == "zero"]
    sex = [i for i in outgoing if _rate_bucket(i) == "exempt"]

    # If overrides provided, collapse everything into 14% row
    if ov:
        s14_net = sales_net_total; s14_vat = sales_vat_total
        s5_net = s5_vat = sz_net = sex_net = 0.0
    else:
        s14_net = _fsum(s14, "net_after"); s14_vat = _fsum(s14, "vat")
        s5_net  = _fsum(s5,  "net_after"); s5_vat  = _fsum(s5,  "vat")
        sz_net  = _fsum(sz,  "net_after")
        sex_net = _fsum(sex, "net_after")

    # Inputs: ETA data doesn't distinguish goods/services/machinery or local/import
    # Default: all purchases → سلع (محلي) with full input VAT on that row
    pur_goods_local = pur_net_total

    # ── Workbook & styles ─────────────────────────────────────────────────────
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "إقرار ض.ق.م"
    ws.sheet_view.rightToLeft = True

    TEAL  = "FF0F6E56"
    LTEAL = "FFE1F5EE"
    DGRAY = "FFE8E6E0"
    WHITE = "FFFFFFFF"
    BLACK = "FF000000"
    RED_C = "FF993C1D"
    GREEN = "FF0F6E56"

    thin  = Side(border_style="thin",   color="FFB4B2A9")
    brd   = Border(left=thin, right=thin, top=thin, bottom=thin)
    fill  = lambda c: PatternFill("solid", fgColor=c)

    # 7 columns: A=label, B=goods/local, C=services/import, D=adj+, E=adj-, F=total, G=tax
    col_widths = [28, 14, 14, 11, 11, 14, 14]
    for idx, w in enumerate(col_widths, 1):
        ws.column_dimensions[ws.cell(1, idx).column_letter].width = w

    def _c(r, col, val="", bold=False, bg=None, color=BLACK, size=9,
           align="right", wrap=False, fmt=None):
        c = ws.cell(row=r, column=col, value=val)
        c.font      = Font(name="Arial", bold=bold, size=size, color=color)
        c.alignment = Alignment(horizontal=align, vertical="center",
                                wrap_text=wrap, readingOrder=2)
        if bg:
            c.fill = fill(bg)
        c.border = brd
        if fmt:
            c.number_format = fmt
        return c

    def _hdr(r, col, val, bg=DGRAY, color=BLACK, bold=True, size=9):
        return _c(r, col, val, bold=bold, bg=bg, color=color, size=size, align="center")

    def _num(r, col, val, bold=False, bg=WHITE, color=BLACK):
        v = val if (val is not None and val != 0) else None
        return _c(r, col, v, bold=bold, bg=bg, color=color,
                  align="center", fmt='#,##0.00_);[Red](#,##0.00)')

    def _mg(r1, c1, r2, c2):
        ws.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)

    # ── Row 1: Title ─────────────────────────────────────────────────────────
    ws.row_dimensions[1].height = 32
    _mg(1,1, 1,7)
    c1 = ws.cell(row=1, column=1, value="أولاً : إقرار الضريبة على القيمة المضافة")
    c1.font      = Font(name="Arial", bold=True, size=13, color=WHITE)
    c1.fill      = fill(TEAL)
    c1.alignment = Alignment(horizontal="center", vertical="center", readingOrder=2)
    c1.border    = brd

    # ── Row 2: Form type ─────────────────────────────────────────────────────
    ws.row_dimensions[2].height = 16
    _mg(2,1, 2,7)
    _c(2, 1, "(نموذج ١٠ ض.ق.م)  —  إقرار أصلي",
       bg=DGRAY, color="FF5F5E5A", size=8, align="center")

    # ── Rows 3-6: Company info (2-column layout) ──────────────────────────────
    period_parts = (row.period_label or "").split("→")
    period_from  = period_parts[0].strip() if len(period_parts) > 0 else ""
    period_to    = period_parts[1].strip() if len(period_parts) > 1 else ""

    info_pairs = [
        ("الاسم",         row.company_name or "",   "المأمورية المسجل بها", ""),
        ("العنوان",       "",                        "رقم التسجيل",          row.tax_number or ""),
        ("الفترة",        period_from,               "نهاية الفترة",         period_to),
        ("رقم التليفون",  "",                        "البريد الإلكتروني",    ""),
    ]
    for ri, (lbl1, val1, lbl2, val2) in enumerate(info_pairs, start=3):
        ws.row_dimensions[ri].height = 18
        _c(ri, 1, lbl1, bold=True, bg=DGRAY, size=9)
        _mg(ri,2, ri,4); _c(ri, 2, val1, bg=WHITE, size=9)
        _c(ri, 5, lbl2, bold=True, bg=DGRAY, size=9)
        _mg(ri,6, ri,7); _c(ri, 6, val2, bg=WHITE, size=9)

    # ── Row 7: Sales section header ───────────────────────────────────────────
    ws.row_dimensions[7].height = 22
    _mg(7,1, 7,7)
    c7 = ws.cell(row=7, column=1, value="المبيعـــــات")
    c7.font = Font(name="Arial", bold=True, size=11, color=WHITE)
    c7.fill = fill(TEAL)
    c7.alignment = Alignment(horizontal="center", vertical="center", readingOrder=2)
    c7.border = brd

    # ── Row 8: Sales column headers ───────────────────────────────────────────
    ws.row_dimensions[8].height = 28
    for col, lbl in [
        (1,"فئة الضريبة"),(2,"قيمة السلع"),(3,"قيمة الخدمات"),
        (4,"تسويات (+)"),(5,"تسويات (-)"),(6,"إجمالي القيمة"),(7,"الضريبة"),
    ]:
        _hdr(8, col, lbl, size=9)

    # ── Rows 9-14: Sales data rows ────────────────────────────────────────────
    sales_data = [
        ("5%",     s5_net,          0, 0, 0, s5_net,          s5_vat),
        ("14%",    s14_net,         0, 0, 0, s14_net,         s14_vat),
        ("صفر",    sz_net,          0, 0, 0, sz_net,          0),
        ("إعفاء",  sex_net,         0, 0, 0, sex_net,         0),
        ("أعمال مقاولي الباطن المسدد عنها الضريبة بمعرفة المقاول العام",
                   0,               0, 0, 0, 0,               0),
        ("الإجمالي", sales_net_total, 0, 0, 0, sales_net_total, sales_vat_total),
    ]
    for ri, (lbl, goods, svcs, ap, am, tot, tax) in enumerate(sales_data, start=9):
        is_total = (ri == 14)
        ws.row_dimensions[ri].height = 28 if ri == 13 else 18
        _c(ri, 1, lbl, bold=is_total, bg=DGRAY, size=9, wrap=True)
        for col, val in [(2,goods),(3,svcs),(4,ap),(5,am),(6,tot),(7,tax)]:
            _num(ri, col, val, bold=is_total,
                 bg=LTEAL if is_total else WHITE)

    # ── Row 15: ضريبة القيمة المضافة total ────────────────────────────────────
    ws.row_dimensions[15].height = 20
    _c(15, 1, "ضريبة القيمة المضافة", bold=True, bg=TEAL, color=WHITE, size=10)
    _mg(15,2, 15,6)
    _c(15, 2, bg=TEAL)
    _num(15, 7, sales_vat_total, bold=True, bg=LTEAL, color=GREEN)

    # ── Row 16: gap ──────────────────────────────────────────────────────────
    ws.row_dimensions[16].height = 6

    # ── Row 17: Inputs section header ─────────────────────────────────────────
    ws.row_dimensions[17].height = 22
    _mg(17,1, 17,7)
    c17 = ws.cell(row=17, column=1, value="المدخـــــلات")
    c17.font = Font(name="Arial", bold=True, size=11, color=WHITE)
    c17.fill = fill(TEAL)
    c17.alignment = Alignment(horizontal="center", vertical="center", readingOrder=2)
    c17.border = brd

    # ── Row 18: Inputs column headers ─────────────────────────────────────────
    ws.row_dimensions[18].height = 28
    for col, lbl in [
        (1,"المدخلات"),(2,"محلي"),(3,"مستورد"),
        (4,"تسويات (+)"),(5,"تسويات (-)"),(6,"إجمالي القيمة"),(7,"ضريبة المدخلات"),
    ]:
        _hdr(18, col, lbl, size=9)

    # ── Rows 19-23: Inputs data rows ──────────────────────────────────────────
    inputs_data = [
        ("سلع",              pur_goods_local, 0, 0, 0, pur_goods_local, pur_vat_total),
        ("خدمات",            0,               0, 0, 0, 0,               0),
        ("الآلات و المعدات", 0,               0, 0, 0, 0,               0),
        ("إعفاء",            0,               0, 0, 0, 0,               0),
        ("الإجمالي",         pur_net_total,   0, 0, 0, pur_net_total,   pur_vat_total),
    ]
    for ri, (lbl, loc, imp, ap, am, tot, tax) in enumerate(inputs_data, start=19):
        is_total = (ri == 23)
        ws.row_dimensions[ri].height = 18
        _c(ri, 1, lbl, bold=is_total, bg=DGRAY, size=9)
        for col, val in [(2,loc),(3,imp),(4,ap),(5,am),(6,tot),(7,tax)]:
            _num(ri, col, val, bold=is_total, bg=LTEAL if is_total else WHITE)

    # ── Row 24: ضريبة المدخلات total ──────────────────────────────────────────
    ws.row_dimensions[24].height = 20
    _c(24, 1, "ضريبة المدخلات", bold=True, bg=TEAL, color=WHITE, size=10)
    _mg(24,2, 24,6)
    _c(24, 2, bg=TEAL)
    _num(24, 7, pur_vat_total, bold=True, bg=LTEAL, color=GREEN)

    # ── Row 25: gap ──────────────────────────────────────────────────────────
    ws.row_dimensions[25].height = 6

    # ── Rows 26-28: ملخص الضريبة ──────────────────────────────────────────────
    ws.row_dimensions[26].height = 22
    _mg(26,1, 26,7)
    c26 = ws.cell(row=26, column=1, value="ملخص الضريبة")
    c26.font = Font(name="Arial", bold=True, size=11, color=WHITE)
    c26.fill = fill(TEAL)
    c26.alignment = Alignment(horizontal="center", vertical="center", readingOrder=2)
    c26.border = brd

    ws.row_dimensions[27].height = 24
    for col, lbl in [
        (1,"ضريبة القيمة المضافة (١)"),
        (2,"ضريبة المدخلات (٢)"),
        (3,"الضريبة المستحقة  (١) - (٢)"),
        (4,"الرصيد الدائن السابق"),
        (5,"مدين"),
        (6,"دائن"),
        (7,""),
    ]:
        _hdr(27, col, lbl, size=8)

    ws.row_dimensions[28].height = 24
    summary_vals = [
        (1, sales_vat_total, WHITE,          BLACK),
        (2, pur_vat_total,   WHITE,          BLACK),
        (3, net_vat,         WHITE,          RED_C if net_vat > 0 else GREEN),
        (4, 0,               WHITE,          BLACK),
        (5, vat_due   if net_vat > 0  else None, "FFFAECE7" if net_vat > 0  else WHITE, RED_C),
        (6, credit_bal if net_vat <= 0 else None, LTEAL      if net_vat <= 0 else WHITE, GREEN),
        (7, None, WHITE, BLACK),
    ]
    for col, val, bg, color in summary_vals:
        _num(28, col, val or 0, bold=True, bg=bg, color=color)

    # ── Row 29: Result box ────────────────────────────────────────────────────
    ws.row_dimensions[29].height = 28
    _mg(29,1, 29,7)
    if net_vat > 0:
        result_txt = f"▶  ضريبة مستحقة للسداد للمصلحة:  {vat_due:,.2f}  ج.م"
        result_bg, result_fc = "FFFAECE7", RED_C
    else:
        result_txt = f"▶  رصيد دائن لصالح الممول (يُرحَّل أو يُسترد):  {credit_bal:,.2f}  ج.م"
        result_bg, result_fc = LTEAL, GREEN
    c29 = ws.cell(row=29, column=1, value=result_txt)
    c29.font      = Font(name="Arial", bold=True, size=11, color=result_fc)
    c29.fill      = fill(result_bg)
    c29.alignment = Alignment(horizontal="center", vertical="center", readingOrder=2)
    c29.border    = brd

    # ── Row 30: Audit trail ───────────────────────────────────────────────────
    ws.row_dimensions[30].height = 14
    _mg(30,1, 30,7)
    _c(30, 1,
       f"تاريخ التوليد: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC  |  "
       f"فواتير واردة: {s.get('incoming_count',0)}  |  "
       f"فواتير صادرة: {s.get('outgoing_count',0)}  |  "
       f"إجمالي: {s.get('total_invoices',0)}",
       bg=DGRAY, color="FF888780", size=8, align="center")

    # ═══════════════════════════════════════════════════════════════════════════
    # Sheet 2: الإقرار (page 3 of the official form — declaration + counts)
    # ═══════════════════════════════════════════════════════════════════════════
    ws2 = wb.create_sheet("إقرار")
    ws2.sheet_view.rightToLeft = True
    for idx, w in enumerate([30, 14, 14, 14], 1):
        ws2.column_dimensions[ws2.cell(1, idx).column_letter].width = w

    def _c2(r, col, val="", bold=False, bg=None, color=BLACK, size=9,
             align="right", fmt=None):
        c = ws2.cell(row=r, column=col, value=val)
        c.font      = Font(name="Arial", bold=bold, size=size, color=color)
        c.alignment = Alignment(horizontal=align, vertical="center", readingOrder=2)
        if bg:
            c.fill = fill(bg)
        c.border = brd
        if fmt:
            c.number_format = fmt
        return c

    def _mg2(r1, c1, r2, c2):
        ws2.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)

    ws2.row_dimensions[1].height = 28
    _mg2(1,1, 1,4)
    c2h = ws2.cell(row=1, column=1, value="إقـــرار")
    c2h.font      = Font(name="Arial", bold=True, size=14, color=WHITE)
    c2h.fill      = fill(TEAL)
    c2h.alignment = Alignment(horizontal="center", vertical="center", readingOrder=2)
    c2h.border    = brd

    ws2.row_dimensions[2].height = 18
    _mg2(2,1, 2,4)
    _c2(2, 1,
        f"أصدرنا المستندات التالية خلال الفترة من  {period_from}  حتى  {period_to}",
        size=10, align="center")

    ws2.row_dimensions[3].height = 20
    for col, lbl in [(1,"النوع"),(2,"العدد"),(3,"رقم المسلسل من"),(4,"رقم المسلسل إلى")]:
        _c2(3, col, lbl, bold=True, bg=DGRAY, size=9, align="center")

    doc_rows = [
        ("فواتير ضريبية",       s.get("outgoing_count", 0)),
        ("إشعارات إضافة",       None),
        ("إشعارات خصم",         None),
        ("أخري تذكر",           None),
        ("عدد فواتير الشراء",   s.get("incoming_count", 0)),
        ("عدد أذون الإفراج",    None),
    ]
    for ri, (lbl, cnt) in enumerate(doc_rows, start=4):
        ws2.row_dimensions[ri].height = 18
        _c2(ri, 1, lbl, size=9)
        _c2(ri, 2, cnt, size=9, align="center")
        _c2(ri, 3, None, size=9, align="center")
        _c2(ri, 4, None, size=9, align="center")

    ws2.row_dimensions[11].height = 14
    _mg2(11,1, 11,4)
    _c2(11, 1,
        "ملحوظة: البند التالي يتم مراعاة استكمال بياناته وفق الإقرار في نهاية السنة المالية للمسجل",
        size=8, color="FF888780", align="center")

    ws2.row_dimensions[12].height = 18
    _c2(12, 1, "إجمالي إيرادات السنة المالية مبلغ", bold=True, bg=DGRAY, size=9)
    _c2(12, 2, None, size=9, fmt="#,##0.00")
    _mg2(12,3, 12,4); _c2(12, 3, "جنيهاً", size=9)

    ws2.row_dimensions[13].height = 18
    _c2(13, 1, "إجمالي مشتريات الشركة خلال العام (محلي + مستورد) بإجمالي", bold=True, bg=DGRAY, size=9)
    _c2(13, 2, pur_net_total, size=9, fmt="#,##0.00", align="center")
    _mg2(13,3, 13,4); _c2(13, 3, "جنيهاً", size=9)

    ws2.row_dimensions[15].height = 6
    sig_pairs = [
        ("الاسم",         row.company_name or ""),
        ("الرقم القومي",  ""),
        ("التوقيع",       ""),
        ("الصفة",         ""),
        ("رقم التوكيل",   ""),
        ("تاريخ الإرسال", datetime.utcnow().strftime("%Y/%m/%d")),
        ("تاريخ الطباعة", datetime.utcnow().strftime("%Y/%m/%d")),
    ]
    for ri, (lbl, val) in enumerate(sig_pairs, start=16):
        ws2.row_dimensions[ri].height = 18
        _c2(ri, 1, lbl, bold=True, bg=DGRAY, size=9)
        _mg2(ri,2, ri,4); _c2(ri, 2, val, size=9)

    ws2.row_dimensions[24].height = 16
    _mg2(24,1, 24,4)
    _c2(24, 1, "في حالة وجود استفسار يرجى الاتصال على الخط الساخن / 16395",
        size=9, color="FF5F5E5A", align="center")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


@router.get("/declaration/{analysis_id}")
def download_declaration(
    analysis_id: int,
    # Optional overrides from Preview Editor (JSON-encoded query param)
    overrides: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and stream VAT return Excel for a saved analysis."""
    row = db.query(VATExcelAnalysis).filter(
        VATExcelAnalysis.id == analysis_id,
        VATExcelAnalysis.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(404, "التحليل غير موجود")

    import json
    ov = {}
    if overrides:
        try:
            ov = json.loads(overrides)
        except Exception:
            pass

    xlsx_bytes = _build_declaration_excel(row, ov)
    safe_period = (row.period_label or "declaration").replace(" → ", "_").replace("/", "-")
    ascii_name  = f"vat_declaration_{safe_period}.xlsx"
    import urllib.parse
    utf8_name   = urllib.parse.quote(f"إقرار_ضريبة_القيمة_المضافة_{safe_period}.xlsx")

    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; '
                f"filename*=UTF-8''{utf8_name}"
            )
        },
    )


# ── Drill-down endpoints ──────────────────────────────────────────────────────

DRILL_LABELS = {
    "sales_vat":  "ضريبة المخرجات",
    "sales_net":  "إجمالي المبيعات",
    "pur_vat":    "ضريبة المدخلات",
    "pur_net":    "إجمالي المشتريات",
    "all":        "كل الفواتير",
}


def _get_drill_invoices(row: VATExcelAnalysis, key: str) -> list[dict]:
    drill_index = (row.summary or {}).get("drill", {})
    if key not in drill_index:
        raise HTTPException(404, f"مفتاح drill غير معروف: {key}")
    uuids = set(drill_index[key])
    return [i for i in (row.invoices or []) if i.get("uuid") in uuids]


@router.get("/drill/{analysis_id}/{key}")
def drill_down(
    analysis_id: int,
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the invoices that make up a specific KPI figure."""
    row = db.query(VATExcelAnalysis).filter(
        VATExcelAnalysis.id == analysis_id,
        VATExcelAnalysis.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(404, "التحليل غير موجود")

    invoices = _get_drill_invoices(row, key)
    s = row.summary or {}
    # Use authoritative stored summary totals where available (avoids float re-sum drift)
    SUMMARY_MAP = {
        "pur_net":   ("pur_net",   "pur_vat",  "pur_total"),
        "pur_vat":   ("pur_net",   "pur_vat",  "pur_total"),
        "sales_net": ("sales_net", "sales_vat","sales_total"),
        "sales_vat": ("sales_net", "sales_vat","sales_total"),
    }
    if key in SUMMARY_MAP:
        nk, vk, tk = SUMMARY_MAP[key]
        total_net = float(s.get(nk, 0))
        total_vat = float(s.get(vk, 0))
        total_amt = float(s.get(tk, 0))
    else:
        total_net = float(sum((Decimal(str(i.get("net_after",0))) for i in invoices), Decimal("0")).quantize(_TWO, rounding=ROUND_HALF_UP))
        total_vat = float(sum((Decimal(str(i.get("vat",0)))       for i in invoices), Decimal("0")).quantize(_TWO, rounding=ROUND_HALF_UP))
        total_amt = float(sum((Decimal(str(i.get("total",0)))      for i in invoices), Decimal("0")).quantize(_TWO, rounding=ROUND_HALF_UP))

    return {
        "key":       key,
        "label":     DRILL_LABELS.get(key, key),
        "count":     len(invoices),
        "total_net": total_net,
        "total_vat": total_vat,
        "total_amt": total_amt,
        "invoices":  invoices,
    }


@router.get("/drill/{analysis_id}/{key}/csv")
def drill_export_csv(
    analysis_id: int,
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export drill-down invoices as a UTF-8 CSV file."""
    row = db.query(VATExcelAnalysis).filter(
        VATExcelAnalysis.id == analysis_id,
        VATExcelAnalysis.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(404, "التحليل غير موجود")

    invoices = _get_drill_invoices(row, key)

    buf = io.StringIO()
    if invoices:
        writer = csv.DictWriter(buf, fieldnames=invoices[0].keys())
        writer.writeheader()
        writer.writerows(invoices)

    label     = DRILL_LABELS.get(key, key)
    ascii_fn  = f"invoices_{key}.csv"
    import urllib.parse
    utf8_fn   = urllib.parse.quote(f"فواتير_{label}.csv")
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8-sig")),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_fn}"; '
                f"filename*=UTF-8''{utf8_fn}"
            )
        },
    )
