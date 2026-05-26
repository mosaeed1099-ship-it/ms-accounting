"""
ETA E-Invoicing Router
منظومة الفاتورة الإلكترونية المصرية — ربط مباشر
"""
import logging
from datetime import datetime, date
from calendar import monthrange
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.eta import ETACredential, ETADocument
from app.services.eta_service import (
    ETAService, encrypt_secret, decrypt_secret, build_vat_return
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/eta", tags=["ETA E-Invoicing"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class CredentialIn(BaseModel):
    eta_client_id:     str
    eta_client_secret: str

class CredentialOut(BaseModel):
    id:              int
    client_id:       int
    eta_client_id:   str
    company_tin:     Optional[str]
    company_name_eta: Optional[str]
    is_active:       bool
    last_sync_at:    Optional[str]
    last_sync_status: str
    total_docs_synced: int

class SyncRequest(BaseModel):
    month: int
    year:  int


# ── Helper ────────────────────────────────────────────────────────────────────

def _get_credential_or_404(client_id: int, db: Session) -> ETACredential:
    cred = db.query(ETACredential).filter(ETACredential.client_id == client_id).first()
    if not cred:
        raise HTTPException(404, "لا توجد بيانات ربط ETA لهذه الشركة — أضف بيانات الدخول أولاً")
    return cred


def _make_service(cred: ETACredential) -> ETAService:
    try:
        secret = decrypt_secret(cred.eta_client_secret)
    except Exception:
        raise HTTPException(500, "تعذّر فك تشفير بيانات ETA — تحقق من إعدادات النظام")
    return ETAService(cred.eta_client_id, secret)


# ── Credential Endpoints ──────────────────────────────────────────────────────

@router.get("/{client_id}/credential")
def get_credential(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cred = db.query(ETACredential).filter(ETACredential.client_id == client_id).first()
    if not cred:
        return {"configured": False}
    return {
        "configured":     True,
        "id":             cred.id,
        "client_id":      cred.client_id,
        "eta_client_id":  cred.eta_client_id,
        "company_tin":    cred.company_tin,
        "company_name_eta": cred.company_name_eta,
        "is_active":      cred.is_active,
        "last_sync_at":   str(cred.last_sync_at) if cred.last_sync_at else None,
        "last_sync_status": cred.last_sync_status,
        "last_sync_message": cred.last_sync_message,
        "total_docs_synced": cred.total_docs_synced,
    }


@router.post("/{client_id}/credential")
async def save_credential(
    client_id: int,
    payload: CredentialIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """حفظ أو تحديث بيانات ربط ETA للشركة — مع اختبار الاتصال فوراً."""
    # Test credentials first
    svc = ETAService(payload.eta_client_id.strip(), payload.eta_client_secret.strip())
    test = await svc.test_connection()
    if not test["success"]:
        raise HTTPException(400, f"بيانات ETA غير صحيحة: {test.get('error', '')}")

    enc_secret = encrypt_secret(payload.eta_client_secret.strip())

    cred = db.query(ETACredential).filter(ETACredential.client_id == client_id).first()
    if cred:
        cred.eta_client_id     = payload.eta_client_id.strip()
        cred.eta_client_secret = enc_secret
        cred.is_active         = True
        cred.updated_at        = datetime.utcnow()
    else:
        cred = ETACredential(
            client_id          = client_id,
            eta_client_id      = payload.eta_client_id.strip(),
            eta_client_secret  = enc_secret,
            created_by         = current_user.id,
        )
        db.add(cred)

    db.commit()
    db.refresh(cred)
    return {"message": "✅ تم حفظ بيانات ETA والاتصال يعمل بنجاح", "id": cred.id}


@router.delete("/{client_id}/credential")
def delete_credential(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cred = db.query(ETACredential).filter(ETACredential.client_id == client_id).first()
    if cred:
        db.delete(cred)
        db.commit()
    return {"message": "تم حذف بيانات الربط"}


@router.post("/{client_id}/test")
async def test_connection(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cred = _get_credential_or_404(client_id, db)
    svc = _make_service(cred)
    result = await svc.test_connection()
    return result


# ── Sync Endpoints ────────────────────────────────────────────────────────────

async def _do_sync(client_id: int, month: int, year: int, db: Session, current_user_id: int):
    """الجوهر الفعلي لعملية المزامنة."""
    cred = db.query(ETACredential).filter(ETACredential.client_id == client_id).first()
    if not cred:
        return {"error": "لا توجد بيانات ربط"}

    svc = _make_service(cred)
    try:
        raw_docs = await svc.sync_period(month, year)
    except Exception as exc:
        cred.last_sync_status  = "failed"
        cred.last_sync_message = str(exc)
        db.commit()
        raise HTTPException(502, f"فشل الاتصال بـ ETA: {exc}")

    saved = 0
    updated = 0
    for raw in raw_docs:
        direction = raw.pop("_direction", "outgoing")
        try:
            parsed = ETAService.parse_doc(raw, direction, client_id, month, year)
            uuid = parsed.get("eta_uuid") or ""
            if not uuid:
                continue

            existing = db.query(ETADocument).filter(ETADocument.eta_uuid == uuid).first()
            if existing:
                for k, v in parsed.items():
                    if k not in ("client_id", "created_at"):
                        setattr(existing, k, v)
                updated += 1
            else:
                doc = ETADocument(**parsed)
                db.add(doc)
                saved += 1
        except Exception as exc:
            log.warning("parse doc failed: %s", exc)
            continue

    db.flush()

    # Update credential sync metadata
    cred.last_sync_at      = datetime.utcnow()
    cred.last_sync_status  = "success"
    cred.last_sync_message = f"✅ {saved} جديدة + {updated} محدَّثة"
    cred.total_docs_synced = db.query(ETADocument).filter(ETADocument.client_id == client_id).count()
    db.commit()

    return {
        "message":  f"✅ تمت المزامنة بنجاح — {saved} فاتورة جديدة، {updated} محدَّثة",
        "new":      saved,
        "updated":  updated,
        "total":    saved + updated,
    }


@router.post("/{client_id}/sync")
async def sync_period(
    client_id: int,
    payload: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """مزامنة فواتير شهر محدد من ETA."""
    if not 1 <= payload.month <= 12:
        raise HTTPException(400, "الشهر يجب أن يكون بين 1 و 12")
    if payload.year < 2020:
        raise HTTPException(400, "السنة غير صحيحة")
    return await _do_sync(client_id, payload.month, payload.year, db, current_user.id)


@router.post("/{client_id}/sync/latest")
async def sync_latest(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """مزامنة الشهر الحالي والشهر السابق."""
    today = date.today()
    results = []
    for m, y in [
        (today.month, today.year),
        ((today.month - 2) % 12 + 1, today.year if today.month > 2 else today.year - 1),
    ]:
        try:
            r = await _do_sync(client_id, m, y, db, current_user.id)
            results.append({"month": m, "year": y, **r})
        except Exception as exc:
            results.append({"month": m, "year": y, "error": str(exc)})
    return {"results": results}


# ── Document Listing ──────────────────────────────────────────────────────────

@router.get("/{client_id}/documents")
def list_documents(
    client_id: int,
    month:     Optional[int]  = None,
    year:      Optional[int]  = None,
    direction: Optional[str]  = None,   # outgoing / incoming
    doc_type:  Optional[str]  = None,   # I / C / D
    status:    Optional[str]  = None,
    page:      int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ETADocument).filter(ETADocument.client_id == client_id)
    if month:     q = q.filter(ETADocument.period_month == month)
    if year:      q = q.filter(ETADocument.period_year  == year)
    if direction: q = q.filter(ETADocument.direction    == direction)
    if doc_type:  q = q.filter(ETADocument.doc_type     == doc_type)
    if status:    q = q.filter(ETADocument.status        == status)
    q = q.order_by(ETADocument.doc_date.desc())
    total = q.count()
    docs  = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page":  page,
        "pages": (total + page_size - 1) // page_size,
        "items": [d.to_dict() for d in docs],
    }


@router.get("/{client_id}/documents/{eta_uuid}/detail")
def get_document_detail(
    client_id: int,
    eta_uuid:  str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(ETADocument).filter(
        ETADocument.client_id == client_id,
        ETADocument.eta_uuid  == eta_uuid,
    ).first()
    if not doc:
        raise HTTPException(404, "الفاتورة غير موجودة")
    import json
    d = doc.to_dict()
    try:
        d["raw_data"] = json.loads(doc.raw_data) if doc.raw_data else {}
    except Exception:
        d["raw_data"] = {}
    return d


# ── VAT Return ────────────────────────────────────────────────────────────────

@router.get("/{client_id}/vat-return")
def get_vat_return(
    client_id: int,
    month:     int,
    year:      int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    إقرار القيمة المضافة الآلي لشهر محدد بناءً على فواتير ETA المزامَنة.
    يعكس نموذج 10 المصري.
    """
    docs = db.query(ETADocument).filter(
        ETADocument.client_id    == client_id,
        ETADocument.period_month == month,
        ETADocument.period_year  == year,
    ).all()
    return build_vat_return(docs, month, year)


# ── Dashboard / Analytics ─────────────────────────────────────────────────────

@router.get("/{client_id}/dashboard")
def eta_dashboard(
    client_id: int,
    year:      Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """لوحة تحكم تحليلية شاملة لـ VAT من فواتير ETA."""
    if not year:
        year = date.today().year

    docs = db.query(ETADocument).filter(
        ETADocument.client_id   == client_id,
        ETADocument.period_year == year,
    ).all()

    # Monthly breakdown
    monthly = {}
    for m in range(1, 13):
        monthly[m] = {
            "month":           m,
            "sales_net":       0.0, "sales_vat":    0.0, "sales_count":  0,
            "purch_net":       0.0, "purch_vat":    0.0, "purch_count":  0,
            "credit_net":      0.0, "credit_vat":   0.0,
            "cancelled_count": 0,
        }

    for d in docs:
        m = d.period_month or 1
        if m not in monthly:
            continue
        bucket = monthly[m]
        if d.is_cancelled or d.status.lower() == "cancelled":
            bucket["cancelled_count"] += 1
            continue
        if d.direction == "outgoing" and d.doc_type == "I":
            bucket["sales_net"]   += d.net_amount   or 0
            bucket["sales_vat"]   += d.vat_amount   or 0
            bucket["sales_count"] += 1
        elif d.direction == "incoming" and d.doc_type == "I":
            bucket["purch_net"]   += d.net_amount   or 0
            bucket["purch_vat"]   += d.vat_amount   or 0
            bucket["purch_count"] += 1
        elif d.doc_type in ("C", "D"):
            bucket["credit_net"] += d.net_amount or 0
            bucket["credit_vat"] += d.vat_amount or 0

    # Round
    months_list = []
    for m in range(1, 13):
        b = monthly[m]
        net_vat = round(b["sales_vat"] - b["purch_vat"] - b["credit_vat"], 2)
        months_list.append({**b,
            "sales_net":  round(b["sales_net"],  2),
            "sales_vat":  round(b["sales_vat"],  2),
            "purch_net":  round(b["purch_net"],  2),
            "purch_vat":  round(b["purch_vat"],  2),
            "credit_net": round(b["credit_net"], 2),
            "credit_vat": round(b["credit_vat"], 2),
            "net_vat":    net_vat,
        })

    # Totals
    total_sales_net  = sum(m["sales_net"]  for m in months_list)
    total_sales_vat  = sum(m["sales_vat"]  for m in months_list)
    total_purch_net  = sum(m["purch_net"]  for m in months_list)
    total_purch_vat  = sum(m["purch_vat"]  for m in months_list)
    total_credit_vat = sum(m["credit_vat"] for m in months_list)
    total_output_vat = total_sales_vat - total_credit_vat
    net_vat_annual   = total_output_vat - total_purch_vat

    # Top customers / suppliers
    from collections import defaultdict
    cust_map: dict = defaultdict(lambda: {"net": 0, "vat": 0, "count": 0})
    supp_map: dict = defaultdict(lambda: {"net": 0, "vat": 0, "count": 0})
    for d in docs:
        if d.is_cancelled: continue
        if d.direction == "outgoing" and d.doc_type == "I":
            name = d.receiver_name or d.receiver_tin or "غير محدد"
            cust_map[name]["net"]   += d.net_amount or 0
            cust_map[name]["vat"]   += d.vat_amount or 0
            cust_map[name]["count"] += 1
        elif d.direction == "incoming" and d.doc_type == "I":
            name = d.issuer_name or d.issuer_tin or "غير محدد"
            supp_map[name]["net"]   += d.net_amount or 0
            supp_map[name]["vat"]   += d.vat_amount or 0
            supp_map[name]["count"] += 1

    top_customers  = sorted([{"name": k, **v} for k, v in cust_map.items()],
                            key=lambda x: x["net"], reverse=True)[:10]
    top_suppliers  = sorted([{"name": k, **v} for k, v in supp_map.items()],
                            key=lambda x: x["net"], reverse=True)[:10]

    # Status counts
    status_counts = {}
    for d in docs:
        s = d.status or "Unknown"
        status_counts[s] = status_counts.get(s, 0) + 1

    return {
        "year":             year,
        "total_docs":       len(docs),
        "total_sales_net":  round(total_sales_net,  2),
        "total_sales_vat":  round(total_sales_vat,  2),
        "total_purch_net":  round(total_purch_net,  2),
        "total_purch_vat":  round(total_purch_vat,  2),
        "total_output_vat": round(total_output_vat, 2),
        "total_input_vat":  round(total_purch_vat,  2),
        "total_credit_vat": round(total_credit_vat, 2),
        "net_vat_annual":   round(net_vat_annual,   2),
        "months":           months_list,
        "top_customers":    top_customers,
        "top_suppliers":    top_suppliers,
        "status_counts":    status_counts,
    }


# ── Link to Accounting ────────────────────────────────────────────────────────

@router.post("/{client_id}/documents/{eta_uuid}/create-journal-entry")
async def create_journal_from_eta(
    client_id: int,
    eta_uuid:  str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """إنشاء قيد محاسبي تلقائي لفاتورة ETA."""
    doc = db.query(ETADocument).filter(
        ETADocument.client_id == client_id,
        ETADocument.eta_uuid  == eta_uuid,
    ).first()
    if not doc:
        raise HTTPException(404, "الفاتورة غير موجودة")

    if doc.journal_entry_id:
        raise HTTPException(409, "تم إنشاء قيد لهذه الفاتورة مسبقاً")

    from app.models.accounting import AccJournalEntry, AccJournalLine

    desc = (
        f"{'بيع' if doc.direction == 'outgoing' else 'مشتريات'} — "
        f"{doc.receiver_name or doc.issuer_name or ''} "
        f"— {doc.internal_id or doc.eta_uuid[:8]}"
    )

    je = AccJournalEntry(
        client_id    = client_id,
        date         = doc.doc_date or date.today(),
        description  = desc,
        reference    = doc.internal_id or doc.eta_uuid[:20],
        entry_type   = "sale" if doc.direction == "outgoing" else "purchase",
        status       = "draft",
        total_debit  = doc.total_amount or 0,
        total_credit = doc.total_amount or 0,
        is_balanced  = True,
        created_by   = current_user.id,
    )
    db.add(je)
    db.flush()

    if doc.direction == "outgoing":
        # مدين: الذمم المدينة / دائن: المبيعات + الضريبة
        lines = [
            AccJournalLine(entry_id=je.id, account_name="الذمم المدينة",     debit=doc.total_amount or 0, credit=0, description=desc),
            AccJournalLine(entry_id=je.id, account_name="المبيعات",          debit=0, credit=doc.net_amount or 0, description=desc),
            AccJournalLine(entry_id=je.id, account_name="ض ق م مستحقة للغير", debit=0, credit=doc.vat_amount or 0, description=desc),
        ]
    else:
        # مدين: المشتريات + الضريبة / دائن: الذمم الدائنة
        lines = [
            AccJournalLine(entry_id=je.id, account_name="المشتريات",          debit=doc.net_amount or 0,   credit=0, description=desc),
            AccJournalLine(entry_id=je.id, account_name="ض ق م قابلة للخصم", debit=doc.vat_amount or 0,   credit=0, description=desc),
            AccJournalLine(entry_id=je.id, account_name="الذمم الدائنة",      debit=0, credit=doc.total_amount or 0, description=desc),
        ]

    for ln in lines:
        if ln.debit > 0 or ln.credit > 0:
            db.add(ln)

    doc.journal_entry_id = je.id
    db.commit()
    return {"message": "✅ تم إنشاء القيد المحاسبي", "journal_entry_id": je.id}
