"""
Universal Excel Import Engine
==============================
Content-based detection — zero dependency on sheet names or column names.
Detects sheet type and maps fields from:
  1. Column header synonyms (Arabic + English + ERP variants)
  2. Actual cell value patterns (dates, amounts, tax-numbers, invoice IDs)
  3. Row-level content scoring
"""

from __future__ import annotations
import re
from typing import Optional


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1: Universal Synonym Dictionaries
# ─────────────────────────────────────────────────────────────────────────────

DATE_SYNONYMS = [
    # Arabic generic
    "تاريخ", "التاريخ", "يوم", "اليوم", "وقت",
    # Arabic specific
    "تاريخ الإصدار", "تاريخ الفاتورة", "تاريخ العملية", "تاريخ الاستحقاق",
    "تاريخ التسجيل", "تاريخ الترحيل", "تاريخ الإدخال", "تاريخ التقديم",
    "تاريخ الصرف", "تاريخ القيد", "تاريخ التحويل", "تاريخ الدفع",
    "تاريخ المستند", "تاريخ المعاملة", "تاريخ الاستلام",
    # English generic
    "date", "day", "time", "datetime",
    # English specific
    "invoice date", "transaction date", "posting date", "value date",
    "document date", "entry date", "payment date", "due date",
    "issue date", "created date", "created at", "created_at",
    "order date", "receipt date", "effective date", "booking date",
    # ERP specific
    "date_invoice", "inv_date", "post_date", "trans_date", "doc_date",
    "bill date", "billing date", "accounting date", "period date",
]

AMOUNT_SYNONYMS = [
    # Arabic (net before VAT)
    "مبلغ", "المبلغ", "قيمة", "القيمة",
    "المبلغ الصافي", "صافي المبلغ", "المبلغ الصافي (بدون ضريبة)",
    "صافي بدون ضريبة", "المبلغ بعد الخصم", "المبلغ قبل الضريبة",
    "مبلغ الفاتورة", "قيمة الفاتورة", "مبلغ المعاملة",
    "إجمالي السعر", "الإجمالي قبل الضريبة", "المبلغ الخاضع للضريبة",
    "المبيعات", "قيمة المبيعات", "مبلغ المبيعات", "إيراد", "الإيراد",
    "المشتريات", "قيمة المشتريات", "مبلغ المشتريات",
    "المصروف", "قيمة المصروف", "مبلغ المصروف",
    "سعر الوحدة", "إجمالي السعر (قبل الخصم)", "الصافي بعد الخصم",
    # English
    "amount", "net amount", "net", "subtotal", "sub total",
    "taxable amount", "taxable value", "taxable", "base amount",
    "sales amount", "purchase amount", "expense amount",
    "price", "unit price", "line amount", "line total",
    "gross amount", "pretax amount", "before tax",
    "invoice amount", "transaction amount", "payment amount",
    # ERP specific
    "amount_untaxed", "price_subtotal", "net_amount",
    "taxable_amount", "base_amount", "line_price",
    "amount", "debit_amount", "credit_amount",
    "inv_amount", "bill_amount",
]

VAT_SYNONYMS = [
    # Arabic
    "ضريبة القيمة المضافة", "ضريبة ق م", "ض.ق.م", "ض ق م",
    "قيمة الضريبة", "مبلغ الضريبة", "الضريبة",
    "إجمالي ضريبة القيمة المضافة", "قيمة ضريبة القيمة المضافة",
    "ضريبة المبيعات", "الضريبة على القيمة المضافة",
    "إجمالي الضريبة", "إجمالي ضريبة", "ضريبة",
    # English
    "vat", "vat amount", "tax amount", "tax value", "tax",
    "sales tax", "gst", "gst amount", "hst", "pst",
    "value added tax", "output tax", "input tax",
    "tax total", "total tax",
    # ERP
    "vat_amount", "tax_amount", "amount_tax",
    "tax_line_amount", "vat_total",
]

TOTAL_SYNONYMS = [
    # Arabic
    "الإجمالي النهائي", "الإجمالي الشامل", "إجمالي شامل الضريبة",
    "الإجمالي", "إجمالي", "المجموع الكلي", "مجموع كلي",
    "المبلغ الكلي", "الإجمالي مع الضريبة", "المبلغ الإجمالي",
    "الإجمالي بعد الضريبة", "الإجمالي العام", "صافي",
    # English
    "total", "grand total", "total amount", "invoice total",
    "amount total", "total with vat", "total inc vat",
    "total including tax", "net total", "final amount",
    "payment total", "balance due", "amount due",
    # ERP
    "amount_total", "total_amount", "invoice_total",
    "grand_total", "total_price",
]

PARTNER_SYNONYMS = [
    # Arabic customer
    "اسم العميل", "العميل", "عميل", "اسم الجهة", "جهة",
    "اسم الشركة", "الشركة", "شركة", "اسم المنشأة", "المنشأة",
    "صاحب المعاملة", "الطرف الآخر", "المستلم", "المرسل إليه",
    # Arabic supplier
    "اسم المورد", "المورد", "مورد", "اسم المورد/العميل",
    # Arabic generic
    "الاسم", "اسم", "جهة المعاملة",
    # English customer
    "customer", "customer name", "client", "client name",
    "buyer", "bill to", "sold to", "payee",
    # English supplier
    "supplier", "supplier name", "vendor", "vendor name",
    "seller", "pay to",
    # English generic
    "partner", "partner name", "name", "counterpart",
    "company", "company name", "entity", "trading partner",
    # ERP
    "partner_id", "customer_id", "vendor_id", "res_partner",
    "customer_name", "vendor_name", "bill_to_name",
]

DOC_SYNONYMS = [
    # Arabic
    "رقم الفاتورة الإلكترونية", "رقم الفاتورة الداخلي",
    "رقم الفاتورة", "رقم المستند", "رقم الوثيقة", "رقم القيد",
    "رقم الإيصال", "رقم الأمر", "رقم العملية", "رقم المعاملة",
    "مرجع", "المرجع", "رقم المرجع", "الرقم المرجعي",
    "رمز", "كود", "رقم",
    # English
    "invoice number", "invoice no", "invoice #", "inv no", "inv #",
    "document number", "doc number", "doc no", "doc #",
    "reference", "reference number", "ref no", "ref #",
    "transaction id", "transaction number", "trans no",
    "receipt number", "order number", "po number",
    "bill number", "payment reference",
    # ERP
    "move_name", "name", "invoice_number", "ref", "source_document",
    "bill_ref", "po_ref", "so_ref",
]

WHT_SYNONYMS = [
    # Arabic
    "ضريبة الاستقطاع", "استقطاع", "خصم واضافة", "خصم م",
    "ضريبة الدخل", "ضريبة كسب العمل", "استقطاعات",
    # English
    "withholding", "withholding tax", "wht", "wht amount",
    "retention", "tax withheld",
]

DISCOUNT_SYNONYMS = [
    "خصم", "الخصم", "إجمالي الخصم", "قيمة الخصم", "نسبة الخصم",
    "discount", "discount amount", "trade discount", "rebate",
]

CURRENCY_SYNONYMS = [
    "عملة", "العملة", "رمز العملة",
    "currency", "curr", "currency code", "iso_currency",
]

DESC_SYNONYMS = [
    # Arabic
    "وصف", "البيان", "بيان", "ملاحظات", "تفاصيل", "التفاصيل",
    "نوع", "النوع", "نوع المصروف", "نوع المعاملة",
    "وصف الخدمة", "وصف المنتج", "وصف المنتج/الخدمة",
    "بند", "اسم الخدمة", "الخدمة",
    # English
    "description", "desc", "notes", "memo", "narration",
    "particulars", "details", "item", "item description",
    "service", "product", "line description", "comment",
    # ERP
    "product_id", "account_analytic_id", "note",
]

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2: Sheet Classification Signals
# ─────────────────────────────────────────────────────────────────────────────

SHEET_TYPES = {
    "SALE":      ("مبيعات", True),
    "PURCHASE":  ("مشتريات", True),
    "EXPENSE":   ("مصروفات", True),
    "BANK":      ("كشف بنكي", True),
    "PAYROLL":   ("مرتبات", True),
    "ASSET":     ("أصول ثابتة", True),
    "VAT":       ("إقرار ضريبي", True),
    "JOURNAL":   ("قيود يومية", True),
    "INVENTORY": ("مخزون", False),
    "CUSTOMERS": ("عملاء", False),
    "SUPPLIERS": ("موردون", False),
    "REPORT":    ("تقرير", False),
    "SUMMARY":   ("ملخص", False),
    "PIVOT":     ("Pivot", False),
    "REFERENCE": ("مرجعية", False),
    "DETAIL":    ("بنود تفصيلية", False),
    "UNKNOWN":   ("غير معروف", False),
}

# Anti-patterns: if these appear heavily in a sheet → not importable data
REPORT_ANTI_PATTERNS = [
    "dashboard", "chart", "graph", "pivot", "summary",
    "تحليل", "إحصائي", "ملخص", "تقرير ملخص", "مؤشر",
    "كبير", "شامل", "overview", "kpi",
]

# Skip-worthy structural patterns (column content based)
NON_DATA_STRUCTURAL = [
    "الترتيب", "rank", "ranking",  # top-N lists
    "رمز الضريبة", "tax code", "tax rate",  # rate tables
    "نسبة", "rate", "percentage",  # percentage tables
]


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3: Value Pattern Detection
# ─────────────────────────────────────────────────────────────────────────────

DATE_PATTERNS = [
    r"^\d{4}-\d{2}-\d{2}$",                    # 2025-01-31
    r"^\d{2}/\d{2}/\d{4}$",                    # 31/01/2025 or 01/31/2025
    r"^\d{2}-\d{2}-\d{4}$",                    # 31-01-2025
    r"^\d{4}/\d{2}/\d{2}$",                    # 2025/01/31
    r"^\d{2}\.\d{2}\.\d{4}$",                  # 31.01.2025
    r"^\d{1,2}\s+\w+\s+\d{4}$",               # 31 Jan 2025
    r"^\d{8}$",                                  # 20250131
]

INVOICE_ID_PATTERNS = [
    r"^[A-Z0-9]{10,30}$",                       # ETA: NFM5X5G2J8R7CPFK78PG8JDK10
    r"^(INV|BILL|PO|SO|REC|PMT)-?\d+",         # INV-001, BILL001
    r"^\d{5,12}$",                               # 123456789
    r"^[A-Z]{2,4}\d{4,10}$",                    # AB20250001
]

TAX_NUMBER_PATTERNS = [
    r"^\d{9,15}$",                               # 9-15 digit tax numbers
    r"^\d{3}-\d{3}-\d{3}$",                     # formatted tax number
]


def _detect_value_pattern(values: list) -> str:
    """
    Analyze a column's non-null values and return the detected pattern:
    'date' | 'amount' | 'invoice_id' | 'tax_number' | 'text' | 'mixed' | 'empty'
    """
    non_null = [v for v in values if v is not None and str(v).strip()
                and str(v).strip().lower() not in ('nan', 'none', 'nat')]
    if not non_null:
        return 'empty'

    date_hits = amount_hits = inv_hits = tax_hits = text_hits = 0

    for v in non_null[:20]:
        s = str(v).strip()

        # Invoice ID check first (before amount — "INV-0001" strips to "-0001" = number)
        if any(re.match(p, s) for p in INVOICE_ID_PATTERNS):
            inv_hits += 1
            continue

        # Date check
        is_date = False
        try:
            import pandas as pd
            dt = pd.to_datetime(s, dayfirst=False, errors='coerce')
            if not pd.isna(dt) and 1990 <= dt.year <= 2100:
                is_date = True
        except Exception:
            pass
        if is_date or any(re.match(p, s) for p in DATE_PATTERNS):
            date_hits += 1
            continue

        # Amount check — pure numeric only (no letters or dashes)
        if not re.search(r'[A-Za-z؀-ۿ]', s):
            s_clean = s.replace(',', '').replace('٬', '').replace('\xa0', '')
            s_clean = re.sub(r'[^\d.\-]', '', s_clean)
            if s_clean and re.match(r'^-?\d+(\.\d+)?$', s_clean):
                try:
                    val = float(s_clean)
                    if abs(val) < 1e9:
                        amount_hits += 1
                        continue
                except ValueError:
                    pass

        # Tax number check
        if any(re.match(p, s) for p in TAX_NUMBER_PATTERNS):
            tax_hits += 1
            continue

        text_hits += 1

    total = len(non_null[:20])
    if total == 0:
        return 'empty'

    best = max([
        ('date', date_hits),
        ('amount', amount_hits),
        ('invoice_id', inv_hits),
        ('tax_number', tax_hits),
        ('text', text_hits),
    ], key=lambda x: x[1])

    if best[1] / total >= 0.6:
        return best[0]
    return 'mixed'


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4: Universal Column Mapper
# ─────────────────────────────────────────────────────────────────────────────

def _name_similarity(col: str, synonyms: list) -> tuple[bool, str]:
    """Check if column name matches any synonym. Returns (matched, keyword)."""
    col_lower = col.lower().strip()
    # Exact match first (highest confidence)
    for syn in synonyms:
        if col_lower == syn.lower():
            return True, syn
    # Substring match — minimum 2 characters to avoid false matches on single letters (م، ت، ...)
    if len(col_lower) >= 2:
        for syn in synonyms:
            syn_l = syn.lower()
            # column contains synonym OR synonym contains column (but col must be >=2 chars to avoid م→يوم)
            if (syn_l in col_lower) or (len(col_lower) >= 3 and col_lower in syn_l):
                return True, syn
    return False, ""


def map_columns_universal(cols: list, df_sample) -> dict:
    """
    Universal column mapping with per-field confidence scores.

    Returns:
    {
        field: {
            'col_idx': int | None,
            'col_name': str | None,
            'confidence': int (0-100),
            'method': str,    # 'exact_name'|'partial_name'|'value_pattern'|'combined'|'none'
            'value_pattern': str,
        }
    }
    """
    import pandas as pd

    FIELD_DEFS = [
        ("date",     DATE_SYNONYMS),
        ("amount",   AMOUNT_SYNONYMS),
        ("vat",      VAT_SYNONYMS),
        ("net",      TOTAL_SYNONYMS),
        ("partner",  PARTNER_SYNONYMS),
        ("doc",      DOC_SYNONYMS),
        ("wht",      WHT_SYNONYMS),
        ("discount", DISCOUNT_SYNONYMS),
        ("currency", CURRENCY_SYNONYMS),
        ("desc",     DESC_SYNONYMS),
    ]

    # Analyze value patterns for each column
    col_value_patterns = {}
    for i, col in enumerate(cols):
        try:
            col_vals = [df_sample.iloc[r, i] for r in range(min(20, len(df_sample)))
                        if i < df_sample.shape[1]]
            col_value_patterns[i] = _detect_value_pattern(col_vals)
        except Exception:
            col_value_patterns[i] = 'unknown'

    FIELD_EXPECTED_PATTERNS = {
        "date":     ["date"],
        "amount":   ["amount"],
        "vat":      ["amount"],
        "net":      ["amount"],
        "partner":  ["text"],
        "doc":      ["invoice_id", "tax_number", "text"],
        "wht":      ["amount"],
        "discount": ["amount"],
        "currency": ["text"],
        "desc":     ["text"],
    }

    result = {}
    assigned_cols = set()

    for field, synonyms in FIELD_DEFS:
        best_idx = None
        best_conf = 0
        best_name = None
        best_method = "none"
        best_vp = "unknown"

        for i, col in enumerate(cols):
            if i in assigned_cols:
                continue

            name_match, matched_kw = _name_similarity(col, synonyms)
            vp = col_value_patterns.get(i, 'unknown')
            expected_patterns = FIELD_EXPECTED_PATTERNS.get(field, [])
            vp_match = vp in expected_patterns

            # Calculate confidence
            conf = 0
            method = "none"

            if name_match:
                # Exact name match → very high confidence
                if col.lower().strip() == matched_kw.lower().strip():
                    conf = 95
                    method = "exact_name"
                else:
                    conf = 75
                    method = "partial_name"

                # Boost if value pattern also matches
                if vp_match:
                    conf = min(conf + 10, 100)
                    method = "combined"
                # Penalize if value pattern is clearly wrong
                elif vp not in ('unknown', 'mixed', 'empty') and not vp_match:
                    conf -= 15

            elif vp_match and vp != 'unknown':
                # Value pattern match only (no name match)
                conf = 45
                method = "value_pattern"

            if conf > best_conf:
                best_conf = conf
                best_idx = i
                best_name = col
                best_method = method
                best_vp = vp

        if best_conf > 30:
            assigned_cols.add(best_idx)
            result[field] = {
                "col_idx":       best_idx,
                "col_name":      best_name,
                "confidence":    best_conf,
                "method":        best_method,
                "value_pattern": best_vp,
                "needs_review":  best_conf < 80,
            }
        else:
            result[field] = {
                "col_idx":       None,
                "col_name":      None,
                "confidence":    0,
                "method":        "none",
                "value_pattern": "none",
                "needs_review":  True,
            }

    return result


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5: Universal Sheet Classifier
# ─────────────────────────────────────────────────────────────────────────────

def classify_sheet_universal(cols: list, df_sample, sheet_name: str = "") -> dict:
    """
    Content-based sheet classification. Sheet name is used as a hint only.

    Returns:
    {
        'type': str (SALE|PURCHASE|EXPENSE|BANK|PAYROLL|ASSET|VAT|
                     JOURNAL|INVENTORY|CUSTOMERS|SUPPLIERS|
                     REPORT|SUMMARY|PIVOT|REFERENCE|DETAIL|UNKNOWN),
        'ar_label': str,
        'importable': bool,
        'confidence': int (0-100),
        'reasons': [str],
        'skip_reason': str|None,
    }
    """
    cols_str = " ".join(c.lower() for c in cols)
    sheet_lower = sheet_name.lower()

    # ── Step 1: Hard skip patterns ──────────────────────────────────────────
    has_date_col = any(
        _name_similarity(c, DATE_SYNONYMS)[0] or
        any(d in c.lower() for d in ["تاريخ", "date", "يوم"])
        for c in cols
    )
    has_amount_col = any(
        _name_similarity(c, AMOUNT_SYNONYMS + VAT_SYNONYMS + TOTAL_SYNONYMS)[0] or
        any(d in c.lower() for d in ["مبلغ", "قيمة", "amount", "total", "vat", "ضريبة"])
        for c in cols
    )

    # Report/Summary anti-pattern in columns
    report_col_hits = sum(1 for ap in REPORT_ANTI_PATTERNS if ap in cols_str)
    if not has_date_col and not has_amount_col:
        return {
            "type": "REPORT", "ar_label": "تقرير",
            "importable": False, "confidence": 90,
            "reasons": ["لا يوجد عمود تاريخ ولا عمود مالي"],
            "skip_reason": "تقرير أو مرجع — لا يحتوي بيانات قابلة للاستيراد",
        }

    if not has_date_col:
        # Could be detail lines (invoice items) or a reference table
        item_signals = sum(1 for kw in ["كمية", "qty", "quantity", "وحدة", "unit", "بند", "item"]
                          if kw in cols_str)
        if item_signals > 0:
            return {
                "type": "DETAIL", "ar_label": "بنود تفصيلية",
                "importable": False, "confidence": 85,
                "reasons": [f"بنود تفصيلية بلا تاريخ ({item_signals} إشارة بنود)"],
                "skip_reason": "شيت بنود فاتورة (Line Items) — لا يحتوي تواريخ فاتورة كاملة",
            }
        return {
            "type": "DETAIL", "ar_label": "بيانات بلا تاريخ",
            "importable": False, "confidence": 75,
            "reasons": ["لا يوجد عمود تاريخ — لا يمكن استيراده كمعاملات مالية"],
            "skip_reason": f"لا يوجد عمود تاريخ. الأعمدة المتاحة: {', '.join(cols[:6])}",
        }

    # ── Step 2: Score each importable type ────────────────────────────────
    scores: dict[str, int] = {}
    reasons_map: dict[str, list] = {}

    def score(t, pts, reason):
        scores[t] = scores.get(t, 0) + pts
        reasons_map.setdefault(t, []).append(reason)

    # ETA Invoice format (Egyptian Tax Authority) — very specific signals
    if "رقم الفاتورة الإلكترونية" in cols_str:
        score("SALE",     60, "رقم الفاتورة الإلكترونية (منظومة الإيصالات)")
    if "الرقم الضريبي للعميل" in cols_str:
        score("SALE",     40, "الرقم الضريبي للعميل")
    if "اسم العميل" in cols_str:
        score("SALE",     35, "اسم العميل")
    if "الرقم الضريبي للمورد" in cols_str:
        score("PURCHASE", 40, "الرقم الضريبي للمورد")
    if "اسم المورد" in cols_str:
        score("PURCHASE", 35, "اسم المورد")

    # Direction column — صادر/وارد
    for c in cols:
        cl = c.lower()
        if any(x in cl for x in ["اتجاه", "direction", "نوع المستند", "type"]):
            # Sample the values
            try:
                ci = cols.index(c)
                vals = [str(df_sample.iloc[r, ci]).lower() for r in range(min(10, len(df_sample)))]
                sale_vals    = sum(1 for v in vals if "صادر" in v or "sale" in v or "out" in v)
                purchase_vals = sum(1 for v in vals if "وارد" in v or "purchase" in v or "in" == v)
                if sale_vals > purchase_vals:
                    score("SALE",     25 + sale_vals * 3, f"'{c}' يحتوي قيم صادرة ({sale_vals})")
                elif purchase_vals > sale_vals:
                    score("PURCHASE", 25 + purchase_vals * 3, f"'{c}' يحتوي قيم واردة ({purchase_vals})")
            except Exception:
                pass

    # Generic sale signals
    for kw, pts in [
        ("مبيع", 20), ("sales", 20), ("revenue", 20), ("إيراد", 15),
        ("invoice", 15), ("فاتور", 15), ("receipt", 10), ("customer", 20),
        ("عميل", 15), ("client", 15), ("صادر", 15), ("مبيعات", 20),
        ("فواتير صادرة", 25), ("قائمة فواتير", 15), ("outgoing", 15),
        ("sold to", 20), ("bill to", 20),
        # ERP-specific (Odoo, ERPNext)
        ("invoice_date", 25), ("move_name", 20), ("amount_untaxed", 20),
        ("out_invoice", 30), ("customer invoice", 30),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("SALE", pts, f"إشارة مبيعات: '{kw}'")

    # Generic purchase signals
    for kw, pts in [
        ("مشتر", 20), ("شراء", 20), ("purchase", 20), ("procurement", 15),
        ("مورد", 15), ("supplier", 20), ("vendor", 20), ("واردة", 15),
        ("مشتريات", 20), ("فواتير واردة", 25), ("buy", 10), ("inbound", 15),
        ("pay to", 20), ("accounts payable", 25),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("PURCHASE", pts, f"إشارة مشتريات: '{kw}'")

    # Expense signals
    for kw, pts in [
        ("مصروف", 25), ("expense", 25), ("تكلفة", 15), ("cost", 15),
        ("نثرية", 20), ("إيجار", 15), ("كهرباء", 15), ("accounts payable", 15),
        ("overhead", 15),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("EXPENSE", pts, f"إشارة مصروف: '{kw}'")

    # Bank statement signals
    for kw, pts in [
        ("رصيد", 25), ("balance", 25), ("مدين", 20), ("دائن", 20),
        ("debit", 20), ("credit", 20), ("بنك", 20), ("bank", 25),
        ("كشف حساب", 30), ("statement", 25), ("account no", 20),
        ("رقم الحساب", 20), ("withdraw", 20), ("deposit", 20),
        ("transfer", 15),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("BANK", pts, f"إشارة بنكية: '{kw}'")

    # Payroll signals
    for kw, pts in [
        ("مرتب", 30), ("salary", 30), ("راتب", 30), ("payroll", 30),
        ("أجر", 20), ("موظف", 15), ("employee", 20), ("رواتب", 30),
        ("employee id", 20), ("رقم الموظف", 20), ("علاوة", 15),
        ("استقطاع", 15), ("صافي الراتب", 25),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("PAYROLL", pts, f"إشارة مرتبات: '{kw}'")

    # Asset signals
    for kw, pts in [
        ("أصل", 25), ("asset", 25), ("ثابت", 20), ("fixed asset", 30),
        ("equipment", 20), ("معدات", 20), ("آلات", 20), ("إهلاك", 25),
        ("depreciation", 30), ("رقم الأصل", 25),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("ASSET", pts, f"إشارة أصول: '{kw}'")

    # VAT return / tax signals (specific — not generic VAT columns)
    for kw, pts in [
        ("إقرار", 30), ("tax return", 40), ("إقرار ضريبي", 50),
        ("output vat", 30), ("input vat", 30), ("ضريبة الإيرادات", 25),
        ("فترة ضريبية", 30), ("tax period", 30),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("VAT", pts, f"إشارة إقرار ضريبي: '{kw}'")

    # Journal entry signals
    # JOURNAL: debit+credit are JOURNAL signals even when BANK also has them
    # BANK is differentiated by having balance/bank-name signals
    BANK_STRONG = scores.get("BANK", 0) >= 50  # BANK has "balance" or "bank" keywords
    for kw, pts in [
        ("حساب", 20), ("account", 20), ("قيد", 25), ("journal", 30),
        ("رمز الحساب", 25), ("account code", 25), ("قيود", 25),
    ]:
        if kw in cols_str or kw in sheet_lower:
            score("JOURNAL", pts, f"إشارة قيود: '{kw}'")
    # debit/credit score JOURNAL only if no strong BANK signal
    for kw, pts in [
        ("مدين", 15), ("دائن", 15), ("debit", 15), ("credit", 15),
    ]:
        if kw in cols_str or kw in sheet_lower:
            if not BANK_STRONG:
                score("JOURNAL", pts, f"إشارة قيود: '{kw}'")

    # ── Step 3: Pick winner ───────────────────────────────────────────────
    if not scores:
        return {
            "type": "UNKNOWN", "ar_label": "غير معروف",
            "importable": False, "confidence": 20,
            "reasons": ["لم يُكتشف أي نوع من التحليل"],
            "skip_reason": "لا يمكن تحديد نوع الشيت",
        }

    best_type = max(scores, key=lambda k: scores[k])
    best_score = scores[best_type]

    # Minimum threshold to be importable
    importable_types = {"SALE", "PURCHASE", "EXPENSE", "BANK", "PAYROLL", "ASSET", "VAT", "JOURNAL"}
    importable = best_type in importable_types and best_score >= 15

    # Confidence: normalize by max possible
    confidence = min(int(best_score / 2), 95)

    return {
        "type": best_type,
        "ar_label": SHEET_TYPES.get(best_type, ("?", False))[0],
        "importable": importable,
        "confidence": confidence,
        "reasons": reasons_map.get(best_type, []),
        "skip_reason": None if importable else f"نوع الشيت ({best_type}) غير قابل للاستيراد",
        "all_scores": {t: s for t, s in sorted(scores.items(), key=lambda x: -x[1])},
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6: Header Row Detection
# ─────────────────────────────────────────────────────────────────────────────

def detect_header_row(df_raw) -> int:
    """Find the row that most likely contains column headers."""
    best_row = 0
    best_score = -1

    for i, row in df_raw.iterrows():
        if i > 10:  # headers are usually in first 10 rows
            break
        values = [v for v in row.values
                  if v is not None and not (hasattr(v, '__class__') and 'float' in type(v).__name__
                  and str(v) == 'nan') and str(v).strip()]
        text_vals = [v for v in values if not _is_number(str(v))]
        # Good header: many text values, few/no numbers
        score = len(text_vals) * 2 - len([v for v in values if _is_number(str(v))])
        if score > best_score and len(text_vals) >= 2:
            best_score = score
            best_row = i

    return best_row


def _is_number(s: str) -> bool:
    try:
        s = s.replace(',', '').replace('٬', '').strip()
        float(s)
        return True
    except (ValueError, AttributeError):
        return False


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7: Compatibility wrappers (for existing accounting.py code)
# ─────────────────────────────────────────────────────────────────────────────

def smart_detect_tx_type(sheet_name: str, columns: list, sample_rows: list) -> tuple:
    """
    Adapter: returns (tx_type, confidence, hint) using Universal Engine.
    tx_type maps to system types: sale|purchase|expense|salary|asset|tax
    """
    import pandas as pd
    if sample_rows:
        df_sample = pd.DataFrame(sample_rows)
    else:
        df_sample = pd.DataFrame(columns=columns)

    result = classify_sheet_universal(columns, df_sample, sheet_name)

    TYPE_MAP = {
        "SALE":      "sale",
        "PURCHASE":  "purchase",
        "EXPENSE":   "expense",
        "BANK":      "expense",
        "PAYROLL":   "salary",
        "ASSET":     "asset",
        "VAT":       "tax",
        "JOURNAL":   "expense",
        "INVENTORY": "expense",
        "CUSTOMERS": "sale",
        "SUPPLIERS": "purchase",
    }

    tx_type = TYPE_MAP.get(result["type"], "expense")
    hint = f"type={result['type']} reasons={result['reasons'][:2]}"
    return tx_type, result["confidence"], hint


def smart_map_columns(cols: list, df_sample=None) -> dict:
    """
    Adapter: returns legacy {field: col_idx} format using Universal Engine.
    """
    import pandas as pd
    if df_sample is None:
        df_sample = pd.DataFrame(columns=cols)

    mapping_full = map_columns_universal(cols, df_sample)

    # Convert to legacy format
    legacy = {}
    for field, info in mapping_full.items():
        legacy[field] = info["col_idx"]
    return legacy


def get_field_confidences(cols: list, df_sample=None) -> dict:
    """
    Returns per-field confidence for the frontend.
    """
    import pandas as pd
    if df_sample is None:
        df_sample = pd.DataFrame(columns=cols)

    mapping_full = map_columns_universal(cols, df_sample)
    return {
        field: {
            "col_idx":      info["col_idx"],
            "col_name":     info["col_name"],
            "confidence":   info["confidence"],
            "method":       info["method"],
            "needs_review": info["needs_review"],
        }
        for field, info in mapping_full.items()
    }
