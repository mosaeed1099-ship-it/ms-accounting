"""
Professional Import System for MS Accounting
Handles Google Sheets / CSV data import with duplicate detection and preview.
"""
import csv, io, re
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from app.database import get_db
from app.models.client import Client, ClientType, ClientStatus
from app.models.invoice import Invoice, InvoiceStatus
from app.models.document import Document, DocumentCategory
from app.core.deps import get_current_user, require_admin
from app.models.user import User
import os
from datetime import date

router = APIRouter(prefix="/api/import", tags=["import"])

# ── Column Mapping ──────────────────────────────────────────────────────────
COLS = {
    "index":       0,   # م
    "name":        1,   # اسم الشركة
    "manager":     2,   # المدير المسئول
    "phone":       3,   # رقم التليفون
    "legal_type":  4,   # الكيان القانوني
    "tax_system":  5,   # منظومه الضريبيه
    "year":        6,   # اقرار سنوي
    "details":     7,   # اي تفاصيل اخري
    "declaration": 8,   # الاقرار
    "revenue":     9,   # حجم الاعمال سنوي
    "agreement":   10,  # الاتفاق مع عميل
    "payment":     11,  # سداد
    "account":     12,  # حساب عميل
    "documents":   13,  # اوراق العميل
}

LEGAL_TYPE_MAP = {
    "شخص واحد محدود المسئوليه": "COMPANY",
    "شخص واحد محدود المسئولية": "COMPANY",
    "ذات مسئوليه محدوده": "COMPANY",
    "ذات مسؤولية محدودة": "COMPANY",
    "مساهمه": "COMPANY",
    "فردي": "INDIVIDUAL",
    "توصيه بسيطه اموال": "COMPANY",
}

# Keywords that indicate inactive/closed clients
INACTIVE_KEYWORDS = [
    "سحب ملف", "قفل", "توقف عن النشاط", "وقف تعامل", "تم بيع الشركة",
    "تبع اسكندرية وتم قفل", "مكتب تاني مسكله", "شغل موقت",
]
PROSPECT_KEYWORDS = [
    "لم يتم التأسيس", "لم يتم فتح ملف ضريبي", "لم يتم تسجيل",
    "في انتظار رد", "انتظار",
]


def clean_phone(raw: str) -> str:
    """Normalize Egyptian phone number."""
    if not raw:
        return ""
    digits = re.sub(r"[^\d]", "", str(raw))
    if len(digits) == 10 and digits.startswith("1"):
        digits = "0" + digits
    if len(digits) == 11 and digits.startswith("01"):
        return digits
    # multi-phone: take first
    parts = re.split(r"[/\s]+", str(raw).strip())
    for p in parts:
        cleaned = clean_phone(p)
        if cleaned:
            return cleaned
    return digits[:15] if digits else ""


def parse_amount(raw: str) -> Optional[float]:
    """Parse clean number strings like '6,000' or '4500'. Returns None for Arabic text."""
    if not raw:
        return None
    raw = str(raw).strip()
    if raw in ("صفري", "0", "صفر", "صفر"):
        return 0.0
    # Reject if contains Arabic letters (it's a description, not a number)
    if re.search(r'[؀-ۿ]', raw):
        return None
    # Reject if has letters (English or other)
    if re.search(r'[a-zA-Z]', raw):
        return None
    digits = re.sub(r"[,،\s]", "", raw)
    digits = re.sub(r"[^\d.]", "", digits)
    if not digits or len(digits) > 10:
        return None
    try:
        v = float(digits)
        return v if v > 0 else None
    except Exception:
        return None


def detect_status(row: dict) -> str:
    """Determine client status from notes columns."""
    combined = " ".join(filter(None, [
        row.get("details", ""), row.get("agreement", ""),
        row.get("payment", ""), row.get("account", ""),
    ])).lower()
    for kw in INACTIVE_KEYWORDS:
        if kw in combined:
            return "INACTIVE"
    for kw in PROSPECT_KEYWORDS:
        if kw in combined:
            return "PROSPECT"
    return "ACTIVE"


def detect_payment_status(row: dict) -> Optional[str]:
    """Detect whether invoice was paid/partial/unpaid."""
    pay = str(row.get("payment", "")).strip()
    acct = str(row.get("account", "")).strip()
    if "تم سداد" in pay:
        return "paid"
    if "لم يتم السداد" in pay:
        return "sent"
    if "متبقي" in pay or "من اصل" in pay or "من أصل" in pay:
        return "partial"
    if "تم تصفيه الحساب" in acct:
        return "paid"
    return None


def parse_rows(csv_text: str) -> List[dict]:
    """Parse CSV text → list of row dicts. Skip header rows."""
    reader = csv.reader(io.StringIO(csv_text))
    all_rows = list(reader)
    results = []
    # Find the header row (contains م, اسم الشركة)
    data_start = 0
    for i, r in enumerate(all_rows):
        if len(r) > 1 and r[1].strip() == "اسم الشركة":
            data_start = i + 1
            break
    if not data_start:
        data_start = 3  # fallback

    for i, row in enumerate(all_rows[data_start:], start=1):
        if len(row) < 2:
            continue
        def g(col): return row[col].strip() if col < len(row) else ""
        name = g(COLS["name"])
        if not name:  # skip blank rows
            continue
        results.append({
            "row_num": i,
            "name": name,
            "manager": g(COLS["manager"]),
            "phone": g(COLS["phone"]),
            "legal_type": g(COLS["legal_type"]),
            "tax_system": g(COLS["tax_system"]),
            "year": g(COLS["year"]),
            "details": g(COLS["details"]),
            "declaration": g(COLS["declaration"]),
            "revenue": g(COLS["revenue"]),
            "agreement": g(COLS["agreement"]),
            "payment": g(COLS["payment"]),
            "account": g(COLS["account"]),
            "documents": g(COLS["documents"]),
        })
    return results


def row_to_client_data(row: dict, db: Session) -> dict:
    """Map a parsed row to a client creation payload + analysis."""
    name = row["name"].strip()
    phone = clean_phone(row["phone"])
    legal = row["legal_type"].strip()
    client_type = LEGAL_TYPE_MAP.get(legal, "COMPANY")
    status = detect_status(row)
    fee = parse_amount(row["agreement"])
    pay_status = detect_payment_status(row)

    # Build notes from multiple fields
    notes_parts = []
    if row["manager"]: notes_parts.append(f"المدير: {row['manager']}")
    if row["tax_system"]: notes_parts.append(f"المنظومة الضريبية: {row['tax_system']}")
    if row["details"]: notes_parts.append(f"تفاصيل: {row['details']}")
    if row["declaration"]: notes_parts.append(f"الإقرار: {row['declaration']}")
    if row["revenue"]: notes_parts.append(f"حجم الأعمال: {row['revenue']}")
    if row["agreement"]: notes_parts.append(f"الاتفاق: {row['agreement']}")
    if row["payment"]: notes_parts.append(f"السداد: {row['payment']}")
    if row["account"]: notes_parts.append(f"الحساب: {row['account']}")
    if row["documents"]: notes_parts.append(f"الأوراق: {row['documents']}")

    # Duplicate detection
    existing_name = db.query(Client).filter(
        Client.name.ilike(f"%{name}%")
    ).first()
    existing_phone = None
    if phone:
        existing_phone = db.query(Client).filter(
            Client.phone == phone
        ).first()
    is_duplicate = bool(existing_name or existing_phone)
    duplicate_reason = ""
    if existing_name:
        duplicate_reason = f"اسم مشابه موجود: #{existing_name.id}"
    elif existing_phone:
        duplicate_reason = f"نفس رقم الهاتف: #{existing_phone.id}"

    # Missing data analysis
    issues = []
    if not phone and legal and legal != "":
        issues.append("رقم هاتف ناقص")
    if not legal:
        issues.append("نوع الكيان القانوني غير محدد")
    if fee and not pay_status:
        issues.append("مبلغ الاتفاق موجود لكن حالة السداد غير واضحة")

    return {
        "row_num": row["row_num"],
        "name": name,
        "phone": phone,
        "legal_type": legal,
        "client_type": client_type,
        "status": status,
        "notes": "\n".join(notes_parts),
        "contract_value": fee,
        "payment_status": pay_status,
        "manager": row["manager"],
        "tax_system": row["tax_system"],
        "year": row["year"],
        "is_duplicate": is_duplicate,
        "duplicate_reason": duplicate_reason,
        "issues": issues,
        "raw": row,
    }


# ── Request/Response Models ─────────────────────────────────────────────────
class PreviewRequest(BaseModel):
    csv_text: str
    sheet_url: Optional[str] = None


class ImportConfirmRequest(BaseModel):
    csv_text: str
    skip_duplicates: bool = True
    import_with_issues: bool = True


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/preview")
async def import_preview(
    req: PreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse CSV and return a full preview without importing anything."""
    rows = parse_rows(req.csv_text)
    analyzed = [row_to_client_data(r, db) for r in rows]

    duplicates = [r for r in analyzed if r["is_duplicate"]]
    with_issues = [r for r in analyzed if r["issues"]]
    clean = [r for r in analyzed if not r["is_duplicate"] and not r["issues"]]
    inactive = [r for r in analyzed if r["status"] == "INACTIVE"]
    prospect = [r for r in analyzed if r["status"] == "PROSPECT"]
    active = [r for r in analyzed if r["status"] == "ACTIVE"]

    return {
        "total": len(analyzed),
        "clean": len(clean),
        "duplicates": len(duplicates),
        "with_issues": len(with_issues),
        "inactive_count": len(inactive),
        "prospect_count": len(prospect),
        "active_count": len(active),
        "rows": analyzed,
    }


@router.post("/confirm")
async def import_confirm(
    req: ImportConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute the actual import. Creates clients (and invoices if fee exists)."""
    rows = parse_rows(req.csv_text)
    analyzed = [row_to_client_data(r, db) for r in rows]

    imported = []
    skipped = []
    errors = []

    # Get max CLI code number to avoid collisions
    import re as _re
    existing_codes = [c.code for c in db.query(Client.code).filter(Client.code.like('CLI-%')).all()]
    existing_nums = [int(_re.search(r'\d+', c[0]).group()) for c in existing_codes if c[0] and _re.search(r'\d+', c[0])]
    counter = (max(existing_nums) + 1) if existing_nums else 1

    from app.models.invoice import Invoice as Inv

    for r in analyzed:
        if r["is_duplicate"] and req.skip_duplicates:
            skipped.append({"name": r["name"], "reason": r["duplicate_reason"]})
            continue

        # ── Step 1: Create client (commit immediately) ─────────────────────
        code = f"CLI-{counter:04d}"
        counter += 1
        try:
            client = Client(
                code=code,
                name=r["name"],
                phone=r["phone"] or None,
                client_type=r["client_type"],
                status=r["status"],
                notes=r["notes"],
                contract_value=r["contract_value"] or 0,
                created_by=current_user.id,
            )
            db.add(client)
            db.commit()
            db.refresh(client)
        except Exception as e:
            db.rollback()
            errors.append({"name": r["name"], "error": f"خطأ في إنشاء العميل: {str(e)[:100]}"})
            continue

        # Create upload directory (archive folder)
        upload_dir = os.path.join("uploads", str(client.id))
        os.makedirs(upload_dir, exist_ok=True)

        # ── Step 2: Create invoice if fee exists (separate commit) ──────────
        if r["contract_value"] and r["contract_value"] > 0 and r["payment_status"]:
            try:
                fee = r["contract_value"]
                yr = int(r["raw"]["year"]) if r["raw"]["year"].isdigit() else 2025
                inv_num = f"INV-IMP-{client.id:04d}"
                inv = Inv(
                    invoice_number=inv_num,
                    client_id=client.id,
                    status=r["payment_status"],
                    issue_date=date(yr, 1, 1),
                    subtotal=fee,
                    total=fee,
                    paid_amount=fee if r["payment_status"] == "paid" else 0,
                    remaining=0 if r["payment_status"] == "paid" else fee,
                    description=f'رسوم خدمات محاسبية - استيراد من الشيت - {yr}',
                    created_by=current_user.id,
                )
                db.add(inv)
                db.commit()
            except Exception as e:
                db.rollback()
                # Client is already saved — just note invoice error
                errors.append({"name": r["name"], "error": f"تحذير: تم إنشاء العميل لكن فشل إنشاء الفاتورة: {str(e)[:80]}"})

        imported.append({"name": r["name"], "code": code, "status": r["status"]})

    return {
        "success": True,
        "imported": len(imported),
        "skipped": len(skipped),
        "errors": len(errors),
        "imported_list": imported,
        "skipped_list": skipped,
        "errors_list": errors,
    }
