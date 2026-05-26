"""
ETA E-Invoicing API Service
Egyptian Tax Authority — منظومة الفاتورة الإلكترونية المصرية

API Docs: https://sdk.invoicing.eta.gov.eg/
Auth:     https://id.eta.gov.eg/connect/token
API Base: https://api.invoicing.eta.gov.eg/api/v1
"""
import json
import logging
import hashlib
import base64
from calendar import monthrange
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

import httpx

log = logging.getLogger(__name__)

ETA_AUTH_URL = "https://id.eta.gov.eg/connect/token"
ETA_API_BASE = "https://api.invoicing.eta.gov.eg/api/v1"

# ── Encryption helpers ────────────────────────────────────────────────────────

def _get_fernet():
    from cryptography.fernet import Fernet
    from app.config import settings
    key = settings.SECRET_KEY.encode()
    key32 = hashlib.sha256(key).digest()
    return Fernet(base64.urlsafe_b64encode(key32))


def encrypt_secret(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_secret(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()


# ── ETA API Client ────────────────────────────────────────────────────────────

class ETAService:
    """Client for ETA E-Invoicing REST API."""

    def __init__(self, eta_client_id: str, eta_client_secret: str):
        self._cid   = eta_client_id
        self._csec  = eta_client_secret
        self._token: Optional[str] = None
        self._token_exp: Optional[datetime] = None

    # ── Auth ─────────────────────────────────────────────────────────────────

    async def _get_token(self) -> str:
        if self._token and self._token_exp and datetime.utcnow() < self._token_exp:
            return self._token
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                ETA_AUTH_URL,
                data={
                    "grant_type":    "client_credentials",
                    "client_id":     self._cid,
                    "client_secret": self._csec,
                    "scope":         "InvoicingAPI",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if r.status_code != 200:
            raise ValueError(f"فشل مصادقة ETA ({r.status_code}): {r.text[:300]}")
        data = r.json()
        self._token = data["access_token"]
        exp_in = data.get("expires_in", 3600)
        self._token_exp = datetime.utcnow() + timedelta(seconds=exp_in - 60)
        log.info("✅ ETA token acquired (expires in %s s)", exp_in)
        return self._token

    async def test_connection(self) -> Dict[str, Any]:
        try:
            tok = await self._get_token()
            return {"success": True, "preview": tok[:30] + "..."}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    # ── Core HTTP ────────────────────────────────────────────────────────────

    async def _get(self, path: str, params: dict = None) -> Any:
        tok = await self._get_token()
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.get(
                f"{ETA_API_BASE}{path}",
                params=params or {},
                headers={"Authorization": f"Bearer {tok}"},
            )
        if r.status_code == 401:
            self._token = None  # force refresh next time
            raise ValueError("انتهت صلاحية الجلسة — حاول مجدداً")
        if r.status_code not in (200, 201):
            raise ValueError(f"ETA API خطأ ({r.status_code}): {r.text[:400]}")
        return r.json()

    # ── Document search ───────────────────────────────────────────────────────

    async def search_outgoing(self, date_from: str, date_to: str,
                               page: int = 1, page_size: int = 100) -> Dict:
        """البحث في الفواتير الصادرة (المبيعات)."""
        return await self._get("/documents/requests/search", {
            "PageNo":         page,
            "PageSize":       page_size,
            "issueDateFrom":  date_from,
            "issueDateTo":    date_to,
            "direction":      "Sent",
        })

    async def search_incoming(self, date_from: str, date_to: str,
                               page: int = 1, page_size: int = 100) -> Dict:
        """البحث في الفواتير الواردة (المشتريات)."""
        return await self._get("/documents/requests/search", {
            "PageNo":         page,
            "PageSize":       page_size,
            "issueDateFrom":  date_from,
            "issueDateTo":    date_to,
            "direction":      "Received",
        })

    async def get_document_raw(self, uuid: str) -> Dict:
        return await self._get(f"/documents/{uuid}/raw")

    # ── Sync period ───────────────────────────────────────────────────────────

    async def sync_period(self, month: int, year: int) -> List[Dict]:
        """مزامنة جميع فواتير شهر محدد — صادر + وارد."""
        _, last_day = monthrange(year, month)
        d_from = f"{year:04d}-{month:02d}-01T00:00:00Z"
        d_to   = f"{year:04d}-{month:02d}-{last_day:02d}T23:59:59Z"

        all_docs: List[Dict] = []

        for direction, fetch_fn in [("outgoing", self.search_outgoing),
                                    ("incoming", self.search_incoming)]:
            page = 1
            while True:
                try:
                    data = await fetch_fn(d_from, d_to, page=page)
                except Exception as exc:
                    log.warning("sync_period %s page %s failed: %s", direction, page, exc)
                    break

                # ETA may return {result:[], total:N} or {documents:[], count:N}
                docs = (data.get("result") or data.get("documents")
                        or data.get("data") or [])
                if not isinstance(docs, list):
                    break

                total = data.get("total") or data.get("count") or 0
                log.info("ETA %s p%s: %s/%s docs", direction, page, len(docs), total)

                for d in docs:
                    d["_direction"] = direction
                all_docs.extend(docs)

                if not docs or len(docs) < 100:
                    break
                page += 1

        return all_docs

    # ── Parse ETA document → DB dict ─────────────────────────────────────────

    @staticmethod
    def parse_doc(raw: Dict, direction: str, client_id: int, month: int, year: int) -> Dict:
        """تحويل فاتورة ETA الخام إلى قاموس قاعدة البيانات."""
        def _f(d, *keys, default=0.0):
            for k in keys:
                if k in d:
                    try:
                        return float(d[k])
                    except (TypeError, ValueError):
                        return default
            return default

        # Try to extract doc date
        dt_str = raw.get("dateTimeIssued") or raw.get("dateTimeReceived") or ""
        doc_dt = None
        try:
            doc_dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except Exception:
            pass

        # Tax totals
        tax_totals = raw.get("taxTotals") or []
        vat_amount = 0.0
        for tt in (tax_totals if isinstance(tax_totals, list) else []):
            if str(tt.get("taxType", "")).upper() in ("T1", "VAT", "01"):
                vat_amount += float(tt.get("amount", 0))

        # Issuer / receiver
        issuer   = raw.get("issuer")   or {}
        receiver = raw.get("receiver") or {}

        # Status
        status_raw = (raw.get("status") or raw.get("documentStatusReasonDescription") or "Valid").strip()
        is_cancelled = "cancel" in status_raw.lower()
        is_returned  = str(raw.get("documentType", "")).upper() in ("C", "D")

        total_amount = _f(raw, "totalAmount", "total")
        net_amount   = _f(raw, "netAmount",   "net")
        vat_used     = vat_amount or _f(raw, "totalTaxableFees", "taxAmount")
        if not vat_used and net_amount and total_amount:
            vat_used = total_amount - net_amount

        return {
            "client_id":             client_id,
            "eta_uuid":              raw.get("uuid") or raw.get("id") or "",
            "eta_long_id":           raw.get("longId") or "",
            "eta_hash_key":          raw.get("hashKey") or "",
            "internal_id":           raw.get("internalId") or raw.get("referenceId") or "",
            "doc_type":              (raw.get("documentType") or raw.get("typeName") or "I")[:5],
            "doc_type_name":         raw.get("typeName") or raw.get("documentTypeName") or "Invoice",
            "doc_type_version":      raw.get("documentTypeVersion") or "1.0",
            "direction":             direction,
            "issuer_tin":            issuer.get("id") or issuer.get("registrationNumber") or "",
            "issuer_name":           issuer.get("name") or "",
            "issuer_type":           issuer.get("type") or "B",
            "receiver_tin":          receiver.get("id") or receiver.get("registrationNumber") or "",
            "receiver_name":         receiver.get("name") or "",
            "receiver_type":         receiver.get("type") or "B",
            "doc_date":              doc_dt.date() if doc_dt else date(year, month, 1),
            "issue_date_time":       doc_dt,
            "period_month":          month,
            "period_year":           year,
            "total_sales_amount":    _f(raw, "totalSalesAmount"),
            "total_discount_amount": _f(raw, "totalDiscountAmount"),
            "net_amount":            net_amount,
            "total_tax_amount":      _f(raw, "totalTaxableFees", "totalTaxAmount"),
            "total_amount":          total_amount,
            "extra_discount_amount": _f(raw, "extraDiscountAmount"),
            "vat_amount":            vat_used,
            "status":                status_raw,
            "is_cancelled":          is_cancelled,
            "is_returned":           is_returned,
            "raw_data":              json.dumps(raw, ensure_ascii=False, default=str),
            "synced_at":             datetime.utcnow(),
        }


# ── VAT Return Builder ────────────────────────────────────────────────────────

def build_vat_return(docs: List, month: int, year: int) -> Dict:
    """
    بناء إقرار القيمة المضافة تلقائياً من قائمة الفواتير.
    يعكس بنية إقرار نموذج 10 المصري.
    """
    ARABIC_MONTHS = [
        "", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
    ]

    def is_effective(d):
        return not d.is_cancelled and d.status in ("Valid", "Submitted", "valid", "submitted")

    valid_docs = [d for d in docs if is_effective(d)]
    cancelled  = [d for d in docs if d.is_cancelled or d.status.lower() == "cancelled"]
    invoices   = [d for d in valid_docs if d.doc_type == "I"]
    credits    = [d for d in valid_docs if d.doc_type == "C"]
    debits     = [d for d in valid_docs if d.doc_type == "D"]

    outgoing_inv = [d for d in invoices if d.direction == "outgoing"]
    incoming_inv = [d for d in invoices if d.direction == "incoming"]
    outgoing_cr  = [d for d in credits  if d.direction == "outgoing"]
    incoming_cr  = [d for d in credits  if d.direction == "incoming"]

    # ── Section 1: Sales (Output Tax) ───
    s1_sales_net     = sum(d.net_amount    for d in outgoing_inv)
    s1_sales_vat     = sum(d.vat_amount    for d in outgoing_inv)
    s1_sales_total   = sum(d.total_amount  for d in outgoing_inv)
    # Credit notes issued (reduce sales)
    s1_cr_net        = sum(d.net_amount   for d in outgoing_cr)
    s1_cr_vat        = sum(d.vat_amount   for d in outgoing_cr)
    # Net output
    output_net       = s1_sales_net - s1_cr_net
    output_vat       = s1_sales_vat - s1_cr_vat

    # ── Section 2: Purchases (Input Tax) ───
    s2_purch_net     = sum(d.net_amount   for d in incoming_inv)
    s2_purch_vat     = sum(d.vat_amount   for d in incoming_inv)
    s2_purch_total   = sum(d.total_amount for d in incoming_inv)
    # Credit notes received (reduce purchases)
    s2_cr_net        = sum(d.net_amount   for d in incoming_cr)
    s2_cr_vat        = sum(d.vat_amount   for d in incoming_cr)
    input_net        = s2_purch_net - s2_cr_net
    input_vat        = s2_purch_vat - s2_cr_vat

    # ── Net VAT ───
    net_vat = output_vat - input_vat

    return {
        "period_month":       month,
        "period_year":        year,
        "period_label":       f"{ARABIC_MONTHS[month]} {year}",
        "is_zero":            len(valid_docs) == 0,
        "generated_at":       datetime.utcnow().isoformat(),
        # document counts
        "total_docs":         len(docs),
        "valid_docs":         len(valid_docs),
        "cancelled_docs":     len(cancelled),
        "outgoing_invoices":  len(outgoing_inv),
        "incoming_invoices":  len(incoming_inv),
        "credit_notes":       len(credits),
        "debit_notes":        len(debits),
        # Section 1 - Sales
        "sales": {
            "invoices_net":    round(s1_sales_net,   2),
            "invoices_vat":    round(s1_sales_vat,   2),
            "invoices_total":  round(s1_sales_total, 2),
            "credit_notes_net": round(s1_cr_net,    2),
            "credit_notes_vat": round(s1_cr_vat,    2),
            "net_sales":       round(output_net,     2),
            "output_vat":      round(output_vat,     2),
        },
        # Section 2 - Purchases
        "purchases": {
            "invoices_net":    round(s2_purch_net,   2),
            "invoices_vat":    round(s2_purch_vat,   2),
            "invoices_total":  round(s2_purch_total, 2),
            "credit_notes_net": round(s2_cr_net,    2),
            "credit_notes_vat": round(s2_cr_vat,    2),
            "net_purchases":   round(input_net,      2),
            "input_vat":       round(input_vat,      2),
        },
        # Net result
        "net_vat":            round(net_vat, 2),
        "net_vat_status":     "مستحقة للسداد" if net_vat > 0 else ("رصيد دائن" if net_vat < 0 else "صفر"),
        "recommendation":     (
            f"يجب سداد {round(abs(net_vat), 2):,.2f} ج.م. لمصلحة الضرائب" if net_vat > 0
            else (f"رصيد ضريبي دائن {round(abs(net_vat), 2):,.2f} ج.م. يُرحَّل للفترة القادمة" if net_vat < 0
                  else "إقرار صفري — لا يوجد ضريبة مستحقة")
        ),
    }
