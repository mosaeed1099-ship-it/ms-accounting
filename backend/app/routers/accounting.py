"""
Accounting Router — نظام الحسابات الكامل لكل شركة
Endpoints:
  /api/accounting/{client_id}/accounts          — دليل الحسابات
  /api/accounting/{client_id}/journal-entries   — القيود اليومية
  /api/accounting/{client_id}/transactions      — معاملات (مبيعات/مشتريات/مصروفات)
  /api/accounting/{client_id}/trial-balance     — ميزان المراجعة
  /api/accounting/{client_id}/reports/income    — قائمة الدخل
  /api/accounting/{client_id}/reports/balance   — الميزانية العمومية
  /api/accounting/{client_id}/reports/vat       — ملخص ض ق م
  /api/accounting/{client_id}/import/excel      — استيراد Excel
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.accounting import (AccAccount, AccJournalEntry, AccJournalLine,
                                   AccTransaction, AccTreasury, AccTreasuryTx,
                                   AccCheck, AccAdvance, AccImportBatch)
from app.models.audit_log import AuditLog
from app.routers.excel_engine import (
    classify_sheet_universal,
    map_columns_universal,
    get_field_confidences,
    smart_detect_tx_type as _engine_detect_tx_type,
    smart_map_columns as _engine_map_columns,
)

router = APIRouter(prefix="/api/accounting", tags=["accounting"])


def _run_batch_migrations(db: Session):
    """تشغيل migrations تلقائية لإضافة الأعمدة الجديدة إن لم تكن موجودة."""
    try:
        raw = db.bind.raw_connection()
        cur = raw.cursor()
        migrations = [
            "CREATE TABLE IF NOT EXISTS acc_import_batches (id SERIAL PRIMARY KEY, client_id INTEGER, filename VARCHAR(255), source_type VARCHAR(50) DEFAULT 'excel_import', imported_by INTEGER, imported_at TIMESTAMP DEFAULT NOW(), tx_count INTEGER DEFAULT 0, je_count INTEGER DEFAULT 0, total_sales FLOAT DEFAULT 0, total_purchases FLOAT DEFAULT 0, total_expenses FLOAT DEFAULT 0, total_salary FLOAT DEFAULT 0, total_vat FLOAT DEFAULT 0, total_net FLOAT DEFAULT 0, status VARCHAR(20) DEFAULT 'active', notes TEXT)",
            "ALTER TABLE acc_transactions ADD COLUMN IF NOT EXISTS import_batch_id INTEGER REFERENCES acc_import_batches(id) ON DELETE SET NULL",
            "ALTER TABLE acc_journal_entries ADD COLUMN IF NOT EXISTS import_batch_id INTEGER REFERENCES acc_import_batches(id) ON DELETE SET NULL",
            "ALTER TABLE acc_journal_entries ADD COLUMN IF NOT EXISTS source_file VARCHAR(255)",
            "ALTER TABLE acc_journal_entries ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'manual'",
            "ALTER TABLE acc_journal_entries ADD COLUMN IF NOT EXISTS doc_ref VARCHAR(100)",
            "ALTER TABLE acc_import_batches ADD COLUMN IF NOT EXISTS section_type VARCHAR(50)",
        ]
        for sql in migrations:
            try:
                cur.execute(sql)
            except Exception:
                raw.rollback()
                cur = raw.cursor()
        raw.commit()
        cur.close()
        raw.close()
    except Exception:
        pass


_migrations_done = False

def ensure_batch_migrations(db: Session):
    global _migrations_done
    if not _migrations_done:
        _run_batch_migrations(db)
        _migrations_done = True


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: str = "asset"
    parent_id: Optional[int] = None
    opening_balance: float = 0
    opening_type: str = "debit"
    notes: Optional[str] = None
    sort_order: int = 0

class JournalLineIn(BaseModel):
    account_id: Optional[int] = None
    account_code: Optional[str] = None
    account_name: str
    debit: float = 0
    credit: float = 0
    description: Optional[str] = None

class JournalEntryCreate(BaseModel):
    date: date
    description: Optional[str] = None
    reference: Optional[str] = None
    entry_type: str = "manual"
    notes: Optional[str] = None
    lines: List[JournalLineIn]

class TransactionCreate(BaseModel):
    transaction_type: str  # sale | purchase | expense | receipt | payment
    date: date
    partner_name: Optional[str] = None
    partner_tax_id: Optional[str] = None
    doc_number: Optional[str] = None
    amount: float = 0
    vat_rate: float = 0.14
    vat_amount: float = 0
    withholding_rate: float = 0
    withholding_amount: float = 0
    total_amount: float = 0
    net_amount: float = 0
    expense_category: Optional[str] = None
    notes: Optional[str] = None

class TreasuryCreate(BaseModel):
    name: str
    treasury_type: str = "cash"
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    opening_balance: float = 0
    notes: Optional[str] = None


# ── Default Chart of Accounts (Egyptian Standard) ────────────────────────────

DEFAULT_COA = [
    # الأصول
    {"code": "1000", "name": "الأصول", "account_type": "asset", "sort": 1},
    {"code": "1100", "name": "الأصول الثابتة", "account_type": "asset", "sort": 2},
    {"code": "1110", "name": "الأصول الثابتة الملموسة", "account_type": "asset", "sort": 3},
    {"code": "1200", "name": "الأصول المتداولة", "account_type": "asset", "sort": 10},
    {"code": "1210", "name": "النقدية والخزينة", "account_type": "asset", "sort": 11},
    {"code": "1220", "name": "عملاء وأرصدة مدينة", "account_type": "asset", "sort": 12},
    {"code": "1230", "name": "المخزون", "account_type": "asset", "sort": 13},
    {"code": "1240", "name": "ضريبة خصم وإضافة (مدين)", "account_type": "asset", "sort": 14},
    {"code": "1250", "name": "ضريبة القيمة المضافة (مدين)", "account_type": "asset", "sort": 15},
    {"code": "1260", "name": "أصول أخرى", "account_type": "asset", "sort": 16},
    # الخصوم
    {"code": "2000", "name": "الخصوم", "account_type": "liability", "sort": 30},
    {"code": "2100", "name": "الالتزامات المتداولة", "account_type": "liability", "sort": 31},
    {"code": "2110", "name": "موردون وأرصدة دائنة", "account_type": "liability", "sort": 32},
    {"code": "2120", "name": "ضريبة القيمة المضافة (دائن)", "account_type": "liability", "sort": 33},
    {"code": "2130", "name": "ضريبة خصم وإضافة (دائن)", "account_type": "liability", "sort": 34},
    {"code": "2140", "name": "ضرائب مستحقة السداد", "account_type": "liability", "sort": 35},
    {"code": "2150", "name": "مصاريف مستحقة", "account_type": "liability", "sort": 36},
    # حقوق الملكية
    {"code": "3000", "name": "حقوق الملكية", "account_type": "equity", "sort": 50},
    {"code": "3100", "name": "رأس المال", "account_type": "equity", "sort": 51},
    {"code": "3200", "name": "جاري صاحب المنشأة", "account_type": "equity", "sort": 52},
    {"code": "3300", "name": "أرباح وخسائر مرحلة", "account_type": "equity", "sort": 53},
    # الإيرادات
    {"code": "4000", "name": "الإيرادات", "account_type": "revenue", "sort": 70},
    {"code": "4100", "name": "المبيعات / الإيراد الرئيسي", "account_type": "revenue", "sort": 71},
    {"code": "4200", "name": "إيرادات أخرى", "account_type": "revenue", "sort": 72},
    # المصروفات
    {"code": "5000", "name": "المصروفات", "account_type": "expense", "sort": 90},
    {"code": "5100", "name": "تكلفة المبيعات", "account_type": "expense", "sort": 91},
    {"code": "5110", "name": "المشتريات", "account_type": "expense", "sort": 92},
    {"code": "5200", "name": "المصروفات العمومية والإدارية", "account_type": "expense", "sort": 100},
    {"code": "5210", "name": "مصروفات الإيجار", "account_type": "expense", "sort": 101},
    {"code": "5220", "name": "مصروفات الرواتب", "account_type": "expense", "sort": 102},
    {"code": "5230", "name": "مصروفات الكهرباء والمياه", "account_type": "expense", "sort": 103},
    {"code": "5240", "name": "مصروفات الاتصالات", "account_type": "expense", "sort": 104},
    {"code": "5250", "name": "مصروفات الدعاية والإعلان", "account_type": "expense", "sort": 105},
    {"code": "5260", "name": "مصروفات متنوعة", "account_type": "expense", "sort": 106},
    {"code": "5300", "name": "المساهمة التكافلية", "account_type": "expense", "sort": 110},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _je_number(client_id: Optional[int], db: Session) -> str:
    year = datetime.now().year
    if client_id is None:
        count = db.query(func.count(AccJournalEntry.id)).filter(AccJournalEntry.client_id.is_(None)).scalar() or 0
        return f"OFF-{year}-{str(count + 1).zfill(4)}"
    count = db.query(func.count(AccJournalEntry.id)).filter(AccJournalEntry.client_id == client_id).scalar() or 0
    return f"JE-{year}-{str(count + 1).zfill(4)}"


def _account_balances(client_id: Optional[int], db: Session,
                      year: Optional[int] = None, month: Optional[int] = None) -> dict:
    """Return {account_id: {debit, credit, balance}} computed from posted journal lines."""
    query = (
        db.query(
            AccJournalLine.account_id,
            AccJournalLine.account_code,
            AccJournalLine.account_name,
            func.sum(AccJournalLine.debit).label("total_debit"),
            func.sum(AccJournalLine.credit).label("total_credit"),
        )
        .join(AccJournalEntry, AccJournalLine.entry_id == AccJournalEntry.id)
        .filter(
            AccJournalEntry.client_id.is_(None) if client_id is None else AccJournalEntry.client_id == client_id,
            AccJournalEntry.status == "posted",
        )
    )
    if year:
        query = query.filter(AccJournalEntry.year == year)
    if month:
        query = query.filter(AccJournalEntry.month == month)
    query = query.group_by(AccJournalLine.account_id, AccJournalLine.account_code, AccJournalLine.account_name)
    rows = query.all()

    # Aggregate by account_code to merge lines that may have account_id=NULL
    # (manually-created JEs) with lines that have account_id set (auto-JEs)
    by_code: dict = {}
    for r in rows:
        code = r.account_code or ""
        d = float(r.total_debit or 0)
        c = float(r.total_credit or 0)
        if code in by_code:
            by_code[code]["debit"]  += d
            by_code[code]["credit"] += c
            by_code[code]["balance"] = by_code[code]["debit"] - by_code[code]["credit"]
            # Prefer non-null account_id
            if by_code[code]["account_id"] is None and r.account_id is not None:
                by_code[code]["account_id"] = r.account_id
        else:
            by_code[code] = {
                "account_id":   r.account_id,
                "account_code": code,
                "account_name": r.account_name or "",
                "debit":  d,
                "credit": c,
                "balance": d - c,
            }

    # Key by account_id when available, else by code string
    result = {}
    for code, v in by_code.items():
        key = v["account_id"] if v["account_id"] is not None else f"code:{code}"
        result[key] = v
    return result


def _auto_journal_entry(tx: AccTransaction, client_id: int, db: Session, user_id: int):
    """Auto-generate journal entry from a transaction (sale/purchase/expense)."""
    accounts = {a.code: a for a in db.query(AccAccount).filter(AccAccount.client_id == client_id).all()}

    def get_acc(code, fallback_name):
        a = accounts.get(code)
        return (a.id if a else None, code, a.name if a else fallback_name)

    lines = []
    if tx.transaction_type == "sale":
        ar_id, ar_code, ar_name = get_acc("1220", "عملاء وأرصدة مدينة")
        vat_id, vat_code, vat_name = get_acc("2120", "ضريبة القيمة المضافة (دائن)")
        wht_id, wht_code, wht_name = get_acc("1240", "ضريبة خصم وإضافة (مدين)")
        rev_id, rev_code, rev_name = get_acc("4100", "المبيعات")
        lines = [
            {"account_id": ar_id,  "account_code": ar_code,  "account_name": ar_name,  "debit": tx.total_amount, "credit": 0, "description": f"عملاء — {tx.partner_name or ''}"},
            {"account_id": wht_id, "account_code": wht_code, "account_name": wht_name, "debit": tx.withholding_amount, "credit": 0, "description": "ضريبة خصم وإضافة"},
            {"account_id": rev_id, "account_code": rev_code, "account_name": rev_name, "debit": 0, "credit": tx.amount, "description": "مبيعات"},
            {"account_id": vat_id, "account_code": vat_code, "account_name": vat_name, "debit": 0, "credit": tx.vat_amount, "description": "ض ق م مبيعات"},
        ]
    elif tx.transaction_type == "purchase":
        pur_id, pur_code, pur_name = get_acc("5110", "المشتريات")
        vat_id, vat_code, vat_name = get_acc("1250", "ضريبة القيمة المضافة (مدين)")
        ap_id, ap_code, ap_name   = get_acc("2110", "موردون وأرصدة دائنة")
        wht_id, wht_code, wht_name = get_acc("2130", "ضريبة خصم وإضافة (دائن)")
        lines = [
            {"account_id": pur_id, "account_code": pur_code, "account_name": pur_name, "debit": tx.amount, "credit": 0, "description": f"مشتريات — {tx.partner_name or ''}"},
            {"account_id": vat_id, "account_code": vat_code, "account_name": vat_name, "debit": tx.vat_amount, "credit": 0, "description": "ض ق م مشتريات"},
            {"account_id": ap_id,  "account_code": ap_code,  "account_name": ap_name,  "debit": 0, "credit": tx.total_amount, "description": "موردون"},
            {"account_id": wht_id, "account_code": wht_code, "account_name": wht_name, "debit": 0, "credit": tx.withholding_amount, "description": "ضريبة خصم وإضافة"},
        ]
    elif tx.transaction_type == "expense":
        exp_id, exp_code, exp_name = get_acc("5200", "المصروفات العمومية والإدارية")
        cash_id, cash_code, cash_name = get_acc("1210", "النقدية والخزينة")
        lines = [
            {"account_id": exp_id,  "account_code": exp_code,  "account_name": exp_name,  "debit": tx.amount, "credit": 0, "description": tx.expense_category or "مصروفات"},
            {"account_id": cash_id, "account_code": cash_code, "account_name": cash_name, "debit": 0, "credit": tx.amount, "description": "خزينة"},
        ]
    elif tx.transaction_type == "asset":
        # أصل ثابت: مدين (1110 أصول ثابتة) / دائن (1210 نقدية)
        ast_id, ast_code, ast_name = get_acc("1110", "الأصول الثابتة الملموسة")
        cash_id, cash_code, cash_name = get_acc("1210", "النقدية والخزينة")
        lines = [
            {"account_id": ast_id,  "account_code": ast_code,  "account_name": ast_name,  "debit": tx.amount, "credit": 0, "description": tx.expense_category or f"أصل ثابت — {tx.partner_name or ''}"},
            {"account_id": cash_id, "account_code": cash_code, "account_name": cash_name, "debit": 0, "credit": tx.amount, "description": "سداد"},
        ]
    elif tx.transaction_type == "salary":
        # مرتبات: مدين (5220 مرتبات) / دائن (1210 نقدية)
        sal_id, sal_code, sal_name = get_acc("5220", "مصروفات الرواتب")
        cash_id, cash_code, cash_name = get_acc("1210", "النقدية والخزينة")
        lines = [
            {"account_id": sal_id,  "account_code": sal_code,  "account_name": sal_name,  "debit": tx.amount, "credit": 0, "description": tx.expense_category or "مرتبات وأجور"},
            {"account_id": cash_id, "account_code": cash_code, "account_name": cash_name, "debit": 0, "credit": tx.amount, "description": "صرف نقدي"},
        ]
    elif tx.transaction_type == "tax":
        # ضرائب: مدين (2140 ضرائب مستحقة كتسوية) / دائن (1210 نقدية)
        tax_id, tax_code, tax_name = get_acc("2140", "ضرائب مستحقة السداد")
        cash_id, cash_code, cash_name = get_acc("1210", "النقدية والخزينة")
        lines = [
            {"account_id": tax_id,  "account_code": tax_code,  "account_name": tax_name,  "debit": tx.amount, "credit": 0, "description": tx.expense_category or "ضرائب ورسوم"},
            {"account_id": cash_id, "account_code": cash_code, "account_name": cash_name, "debit": 0, "credit": tx.amount, "description": "سداد ضريبة"},
        ]

    if not lines:
        return None

    total_d = sum(l["debit"] for l in lines)
    total_c = sum(l["credit"] for l in lines)
    je = AccJournalEntry(
        client_id=client_id,
        entry_number=_je_number(client_id, db),
        date=tx.date,
        month=tx.month,
        year=tx.year,
        description=f"{tx.transaction_type} — {tx.partner_name or tx.expense_category or ''} — {tx.doc_number or ''}",
        reference=tx.doc_number,
        entry_type=tx.transaction_type,
        status="posted",
        total_debit=total_d,
        total_credit=total_c,
        is_balanced=(abs(total_d - total_c) < 0.01),
        created_by=user_id,
    )
    db.add(je)
    db.flush()
    for i, l in enumerate(lines):
        if l["debit"] == 0 and l["credit"] == 0:
            continue
        db.add(AccJournalLine(entry_id=je.id, sort_order=i, **l))
    return je


# ── Chart of Accounts ─────────────────────────────────────────────────────────

@router.get("/{client_id}/accounts")
async def list_accounts(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    accounts = db.query(AccAccount).filter(
        AccAccount.client_id == client_id
    ).order_by(AccAccount.code).all()
    return [
        {"id": a.id, "code": a.code, "name": a.name, "account_type": a.account_type,
         "parent_id": a.parent_id, "opening_balance": a.opening_balance,
         "opening_type": a.opening_type, "is_active": a.is_active, "notes": a.notes}
        for a in accounts
    ]


@router.post("/{client_id}/accounts/install-default")
async def install_default_coa(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تثبيت دليل الحسابات الافتراضي (المعيار المصري)."""
    existing = db.query(func.count(AccAccount.id)).filter(AccAccount.client_id == client_id).scalar()
    if existing:
        raise HTTPException(400, detail="دليل الحسابات موجود بالفعل. احذفه أولاً لإعادة التثبيت.")
    code_to_id = {}
    for a in sorted(DEFAULT_COA, key=lambda x: x["sort"]):
        acc = AccAccount(
            client_id=client_id,
            code=a["code"],
            name=a["name"],
            account_type=a["account_type"],
            sort_order=a["sort"],
            created_by=current_user.id,
        )
        db.add(acc)
        db.flush()
        code_to_id[a["code"]] = acc.id
    db.commit()
    return {"message": f"تم تثبيت {len(DEFAULT_COA)} حساب بنجاح", "count": len(DEFAULT_COA)}


@router.post("/install-all-coa")
async def install_all_clients_coa(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تثبيت دليل الحسابات لجميع العملاء + المكتب (office) — آمن: يتخطى من لديه حسابات مثبتة."""
    from app.models.client import Client
    if current_user.role.value != "admin":
        raise HTTPException(403, detail="للمدير فقط")

    clients = db.query(Client).all()
    installed, skipped = [], []

    # تثبيت للمكتب (client_id=None)
    office_existing = db.query(func.count(AccAccount.id)).filter(AccAccount.client_id.is_(None)).scalar()
    if not office_existing:
        for a in sorted(DEFAULT_COA, key=lambda x: x["sort"]):
            db.add(AccAccount(client_id=None, code=a["code"], name=a["name"],
                              account_type=a["account_type"], sort_order=a["sort"],
                              created_by=current_user.id))
        db.flush()
        installed.append({"id": None, "name": "المكتب (office)", "accounts": len(DEFAULT_COA)})
    else:
        skipped.append({"id": None, "name": "المكتب (office)", "reason": "موجود"})

    # تثبيت لكل عميل
    for client in clients:
        existing = db.query(func.count(AccAccount.id)).filter(AccAccount.client_id == client.id).scalar()
        if existing:
            skipped.append({"id": client.id, "name": client.name})
            continue
        for a in sorted(DEFAULT_COA, key=lambda x: x["sort"]):
            db.add(AccAccount(client_id=client.id, code=a["code"], name=a["name"],
                              account_type=a["account_type"], sort_order=a["sort"],
                              created_by=current_user.id))
        db.flush()
        installed.append({"id": client.id, "name": client.name, "accounts": len(DEFAULT_COA)})

    db.commit()
    return {
        "message": f"تم تثبيت الحسابات لـ {len(installed)} كيان، تم تخطي {len(skipped)}",
        "installed_count": len(installed),
        "skipped_count": len(skipped),
        "installed": installed,
        "skipped": skipped,
        "accounts_per_entity": len(DEFAULT_COA),
    }


@router.get("/office/accounts")
async def office_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """حسابات المكتب (client_id=NULL)"""
    accs = db.query(AccAccount).filter(AccAccount.client_id.is_(None)).order_by(AccAccount.code).all()
    return [{"id": a.id, "code": a.code, "name": a.name, "account_type": a.account_type} for a in accs]


@router.get("/office/journal-entries")
async def office_journal_entries(
    year: Optional[int] = None, month: Optional[int] = None,
    page: int = 1, page_size: int = 100,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """قيود المكتب اليومية (client_id=NULL)"""
    q = db.query(AccJournalEntry).filter(AccJournalEntry.client_id.is_(None))
    if year:  q = q.filter(AccJournalEntry.year == year)
    if month: q = q.filter(AccJournalEntry.month == month)
    total = q.count()
    items = q.order_by(AccJournalEntry.date.desc()).offset((page-1)*page_size).limit(page_size).all()
    def je_dict(je):
        return {"id": je.id, "entry_number": je.entry_number, "date": str(je.date),
                "description": je.description, "entry_type": je.entry_type, "status": je.status,
                "total_debit": je.total_debit, "total_credit": je.total_credit, "is_balanced": je.is_balanced,
                "lines": [{"account_code": l.account_code, "account_name": l.account_name,
                            "debit": l.debit, "credit": l.credit} for l in je.lines]}
    return {"total": total, "items": [je_dict(j) for j in items]}


@router.get("/office/trial-balance")
async def office_trial_balance(year: Optional[int] = None, db: Session = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    """ميزان مراجعة المكتب (client_id=NULL)"""
    balances = _account_balances(None, db, year=year)
    accounts = db.query(AccAccount).filter(AccAccount.client_id.is_(None)).order_by(AccAccount.code).all()
    acc_map = {a.id: a for a in accounts}
    rows, total_d, total_c = [], 0, 0
    for aid, b in balances.items():
        d, c = b["debit"], b["credit"]
        if d == 0 and c == 0: continue
        acc = acc_map.get(aid)
        total_d += d; total_c += c
        rows.append({"code": acc.code if acc else b.get("account_code",""),
                     "name": acc.name if acc else b.get("account_name",""),
                     "account_type": acc.account_type if acc else "unknown",
                     "debit": round(d,2), "credit": round(c,2), "balance": round(d-c,2)})
    rows.sort(key=lambda r: r["code"])
    return {"rows": rows, "total_debit": round(total_d,2), "total_credit": round(total_c,2),
            "is_balanced": abs(total_d-total_c) < 0.01, "year": year}


@router.delete("/office/journal-entries/{je_id}")
async def delete_office_journal_entry(je_id: int, db: Session = Depends(get_db),
                                      current_user: User = Depends(get_current_user)):
    """حذف قيد يومي للمكتب (للمدير فقط)."""
    if current_user.role.value != "admin":
        raise HTTPException(403, detail="للمدير فقط")
    je = db.query(AccJournalEntry).filter(AccJournalEntry.id == je_id,
                                          AccJournalEntry.client_id.is_(None)).first()
    if not je:
        raise HTTPException(404, "القيد غير موجود")
    # المدير يمكنه حذف قيود المكتب مباشرة (بما فيها posted) لأغراض التصحيح
    db.delete(je)
    db.commit()
    return {"message": "تم الحذف"}



@router.post("/{client_id}/accounts")
async def create_account(
    client_id: int,
    data: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    acc = AccAccount(client_id=client_id, created_by=current_user.id, **data.dict())
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return {"id": acc.id, "code": acc.code, "name": acc.name, "message": "تم إنشاء الحساب"}


@router.put("/{client_id}/accounts/{acc_id}")
async def update_account(
    client_id: int, acc_id: int,
    data: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    acc = db.query(AccAccount).filter(AccAccount.id == acc_id, AccAccount.client_id == client_id).first()
    if not acc:
        raise HTTPException(404, detail="الحساب غير موجود")
    for k, v in data.dict().items():
        setattr(acc, k, v)
    db.commit()
    return {"message": "تم التحديث"}


@router.delete("/{client_id}/accounts/{acc_id}")
async def delete_account(
    client_id: int, acc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    acc = db.query(AccAccount).filter(AccAccount.id == acc_id, AccAccount.client_id == client_id).first()
    if not acc:
        raise HTTPException(404, detail="الحساب غير موجود")
    has_lines = db.query(func.count(AccJournalLine.id)).filter(AccJournalLine.account_id == acc_id).scalar()
    if has_lines:
        raise HTTPException(400, detail="لا يمكن حذف حساب له قيود مرتبطة")
    db.delete(acc)
    db.commit()
    return {"message": "تم الحذف"}


# ── Journal Entries ────────────────────────────────────────────────────────────

@router.get("/{client_id}/journal-entries")
async def list_journal_entries(
    client_id: int,
    year: Optional[int] = None,
    month: Optional[int] = None,
    status: Optional[str] = None,
    entry_type: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AccJournalEntry).filter(AccJournalEntry.client_id == client_id)
    if year:   query = query.filter(AccJournalEntry.year == year)
    if month:  query = query.filter(AccJournalEntry.month == month)
    if status: query = query.filter(AccJournalEntry.status == status)
    if entry_type: query = query.filter(AccJournalEntry.entry_type == entry_type)
    if q: query = query.filter(or_(
        AccJournalEntry.description.ilike(f"%{q}%"),
        AccJournalEntry.entry_number.ilike(f"%{q}%"),
        AccJournalEntry.reference.ilike(f"%{q}%"),
    ))
    total = query.count()
    items = query.order_by(AccJournalEntry.date.desc(), AccJournalEntry.id.desc()) \
                 .offset((page-1)*page_size).limit(page_size).all()

    def je_dict(je):
        return {
            "id": je.id, "entry_number": je.entry_number,
            "date": str(je.date) if je.date else None,
            "month": je.month, "year": je.year,
            "description": je.description, "reference": je.reference,
            "entry_type": je.entry_type, "status": je.status,
            "total_debit": je.total_debit, "total_credit": je.total_credit,
            "is_balanced": je.is_balanced, "notes": je.notes,
            "lines_count": len(je.lines),
            "source_type":      getattr(je, 'source_type', None),
            "source_file":      getattr(je, 'source_file', None),
            "import_batch_id":  getattr(je, 'import_batch_id', None),
            "doc_ref":          getattr(je, 'doc_ref', None),
        }
    return {"total": total, "page": page, "items": [je_dict(i) for i in items]}


@router.post("/{client_id}/journal-entries")
async def create_journal_entry(
    client_id: int,
    data: JournalEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.lines:
        raise HTTPException(400, detail="القيد يحتاج سطراً واحداً على الأقل")
    total_d = sum(l.debit for l in data.lines)
    total_c = sum(l.credit for l in data.lines)
    je = AccJournalEntry(
        client_id=client_id,
        entry_number=_je_number(client_id, db),
        date=data.date,
        month=data.date.month,
        year=data.date.year,
        description=data.description,
        reference=data.reference,
        entry_type=data.entry_type,
        status="draft",
        total_debit=total_d,
        total_credit=total_c,
        is_balanced=(abs(total_d - total_c) < 0.01),
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(je)
    db.flush()
    for i, l in enumerate(data.lines):
        db.add(AccJournalLine(entry_id=je.id, sort_order=i, **l.dict()))
    db.commit()
    db.refresh(je)
    return {"id": je.id, "entry_number": je.entry_number, "is_balanced": je.is_balanced,
            "message": "تم إنشاء القيد" + (" ⚠️ القيد غير متوازن" if not je.is_balanced else " ✅ متوازن")}


@router.get("/{client_id}/journal-entries/{je_id}")
async def get_journal_entry(
    client_id: int, je_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    je = db.query(AccJournalEntry).filter(AccJournalEntry.id == je_id, AccJournalEntry.client_id == client_id).first()
    if not je:
        raise HTTPException(404, detail="القيد غير موجود")
    return {
        "id": je.id, "entry_number": je.entry_number,
        "date": str(je.date), "month": je.month, "year": je.year,
        "description": je.description, "reference": je.reference,
        "entry_type": je.entry_type, "status": je.status,
        "total_debit": je.total_debit, "total_credit": je.total_credit,
        "is_balanced": je.is_balanced, "notes": je.notes,
        "source_type":     getattr(je, 'source_type', None),
        "source_file":     getattr(je, 'source_file', None),
        "import_batch_id": getattr(je, 'import_batch_id', None),
        "doc_ref":         getattr(je, 'doc_ref', None),
        "lines": [
            {"id": l.id, "account_id": l.account_id, "account_code": l.account_code,
             "account_name": l.account_name, "debit": l.debit, "credit": l.credit,
             "description": l.description}
            for l in je.lines
        ],
    }


@router.patch("/{client_id}/journal-entries/{je_id}/post")
async def post_journal_entry(
    client_id: int, je_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    je = db.query(AccJournalEntry).filter(AccJournalEntry.id == je_id, AccJournalEntry.client_id == client_id).first()
    if not je:
        raise HTTPException(404, detail="القيد غير موجود")
    if je.status == "posted":
        raise HTTPException(400, detail="القيد مرحَّل بالفعل")
    if not je.is_balanced:
        raise HTTPException(400, detail="لا يمكن ترحيل قيد غير متوازن (المدين ≠ الدائن)")
    je.status = "posted"
    je.updated_at = datetime.utcnow()
    db.add(AuditLog(
        user_id=current_user.id, action="approve", module="accounting",
        record_id=je.id, record_name=je.entry_number,
        notes=f"ترحيل القيد {je.entry_number} بتاريخ {je.date}",
    ))
    db.commit()
    return {"message": "تم ترحيل القيد ✅"}


@router.post("/{client_id}/journal-entries/{je_id}/reverse")
async def reverse_journal_entry(
    client_id: int, je_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """إنشاء قيد عكسي — يعكس جميع أسطر القيد الأصلي (مدين ↔ دائن)"""
    orig = db.query(AccJournalEntry).filter(AccJournalEntry.id == je_id, AccJournalEntry.client_id == client_id).first()
    if not orig:
        raise HTTPException(404, detail="القيد غير موجود")
    if orig.status != "posted":
        raise HTTPException(400, detail="لا يمكن عكس قيد غير مرحَّل")

    today = date.today()
    rev_je = AccJournalEntry(
        client_id=client_id,
        entry_number=_je_number(client_id, db),
        date=today, month=today.month, year=today.year,
        description=f"قيد عكسي — {orig.description or orig.entry_number}",
        reference=orig.reference,
        entry_type="reversal",
        status="posted",
        total_debit=orig.total_credit,   # swapped
        total_credit=orig.total_debit,   # swapped
        is_balanced=orig.is_balanced,
        notes=f"عكس القيد رقم {orig.entry_number}",
        created_by=current_user.id,
    )
    db.add(rev_je)
    db.flush()

    for l in orig.lines:
        db.add(AccJournalLine(
            entry_id=rev_je.id,
            account_id=l.account_id,
            account_code=l.account_code,
            account_name=l.account_name,
            debit=l.credit,    # swapped
            credit=l.debit,    # swapped
            description=f"عكسي: {l.description or ''}",
            sort_order=l.sort_order,
        ))

    db.add(AuditLog(
        user_id=current_user.id, action="create", module="accounting",
        record_id=rev_je.id, record_name=rev_je.entry_number,
        notes=f"قيد عكسي للقيد الأصلي {orig.entry_number}",
        old_data={"original_je_id": orig.id, "original_number": orig.entry_number},
    ))
    db.commit()
    db.refresh(rev_je)
    return {"id": rev_je.id, "entry_number": rev_je.entry_number, "message": f"✅ تم إنشاء القيد العكسي {rev_je.entry_number}"}


@router.delete("/{client_id}/journal-entries/{je_id}")
async def delete_journal_entry(
    client_id: int, je_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    je = db.query(AccJournalEntry).filter(AccJournalEntry.id == je_id, AccJournalEntry.client_id == client_id).first()
    if not je:
        raise HTTPException(404, detail="القيد غير موجود")
    if je.status == "posted":
        raise HTTPException(400, detail="لا يمكن حذف قيد مرحَّل — استخدم القيد العكسي")
    db.add(AuditLog(
        user_id=current_user.id, action="delete", module="accounting",
        record_id=je.id, record_name=je.entry_number,
        notes=f"حذف القيد {je.entry_number} (مسودة)",
    ))
    db.delete(je)
    db.commit()
    return {"message": "تم حذف القيد"}


# ── Transactions (Sales / Purchases / Expenses) ───────────────────────────────

@router.get("/{client_id}/transactions")
async def list_transactions(
    client_id: int,
    transaction_type: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AccTransaction).filter(AccTransaction.client_id == client_id)
    if transaction_type: query = query.filter(AccTransaction.transaction_type == transaction_type)
    if year:  query = query.filter(AccTransaction.year == year)
    if month: query = query.filter(AccTransaction.month == month)
    if q: query = query.filter(or_(
        AccTransaction.partner_name.ilike(f"%{q}%"),
        AccTransaction.doc_number.ilike(f"%{q}%"),
    ))
    total = query.count()
    # Build totals with explicit filters matching the items query
    tot_q = db.query(
        func.sum(AccTransaction.amount),
        func.sum(AccTransaction.vat_amount),
        func.sum(AccTransaction.total_amount),
    ).filter(AccTransaction.client_id == client_id)
    if transaction_type: tot_q = tot_q.filter(AccTransaction.transaction_type == transaction_type)
    if year:  tot_q = tot_q.filter(AccTransaction.year == year)
    if month: tot_q = tot_q.filter(AccTransaction.month == month)
    if q: tot_q = tot_q.filter(or_(
        AccTransaction.partner_name.ilike(f"%{q}%"),
        AccTransaction.doc_number.ilike(f"%{q}%"),
    ))
    t_amt, t_vat, t_total = tot_q.one()
    totals = {
        "amount": float(t_amt or 0),
        "vat":    float(t_vat or 0),
        "total":  float(t_total or 0),
    }
    items = query.order_by(AccTransaction.date.desc(), AccTransaction.id.desc()) \
                 .offset((page-1)*page_size).limit(page_size).all()

    def tx_dict(t):
        return {
            "id": t.id, "transaction_type": t.transaction_type,
            "date": str(t.date) if t.date else None, "month": t.month, "year": t.year,
            "partner_name": t.partner_name, "partner_tax_id": t.partner_tax_id,
            "doc_number": t.doc_number,
            "amount": t.amount, "vat_rate": t.vat_rate, "vat_amount": t.vat_amount,
            "withholding_rate": t.withholding_rate, "withholding_amount": t.withholding_amount,
            "total_amount": t.total_amount, "net_amount": t.net_amount,
            "expense_category": t.expense_category, "notes": t.notes,
            "journal_entry_id": t.journal_entry_id,
        }
    return {"total": total, "totals": totals, "page": page, "items": [tx_dict(i) for i in items]}


@router.get("/{client_id}/transactions/{tx_id}")
async def get_transaction(
    client_id: int, tx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(AccTransaction).filter(AccTransaction.id == tx_id, AccTransaction.client_id == client_id).first()
    if not tx:
        raise HTTPException(404, detail="المعاملة غير موجودة")
    return {
        "id": tx.id, "transaction_type": tx.transaction_type,
        "date": str(tx.date) if tx.date else None, "month": tx.month, "year": tx.year,
        "partner_name": tx.partner_name, "partner_tax_id": tx.partner_tax_id,
        "doc_number": tx.doc_number,
        "amount": float(tx.amount or 0), "vat_rate": float(tx.vat_rate or 0),
        "vat_amount": float(tx.vat_amount or 0),
        "withholding_rate": float(tx.withholding_rate or 0),
        "withholding_amount": float(tx.withholding_amount or 0),
        "total_amount": float(tx.total_amount or 0), "net_amount": float(tx.net_amount or 0),
        "expense_category": tx.expense_category, "notes": tx.notes,
        "journal_entry_id": tx.journal_entry_id,
    }


@router.post("/{client_id}/transactions")
async def create_transaction(
    client_id: int,
    data: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = AccTransaction(
        client_id=client_id,
        month=data.date.month,
        year=data.date.year,
        created_by=current_user.id,
        **data.dict(),
    )
    db.add(tx)
    db.flush()

    # Auto-generate journal entry
    je = _auto_journal_entry(tx, client_id, db, current_user.id)
    if je:
        tx.journal_entry_id = je.id

    db.commit()
    return {"id": tx.id, "journal_entry_id": tx.journal_entry_id,
            "message": "تم الحفظ وتوليد القيد تلقائياً ✅"}


@router.put("/{client_id}/transactions/{tx_id}")
async def update_transaction(
    client_id: int, tx_id: int,
    data: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(AccTransaction).filter(AccTransaction.id == tx_id, AccTransaction.client_id == client_id).first()
    if not tx:
        raise HTTPException(404, detail="المعاملة غير موجودة")

    # Delete old journal entry (if not posted via manual review)
    if tx.journal_entry_id:
        old_je = db.query(AccJournalEntry).filter(AccJournalEntry.id == tx.journal_entry_id).first()
        if old_je and old_je.status != "posted":
            db.delete(old_je)
            db.flush()
            tx.journal_entry_id = None
        elif old_je and old_je.status == "posted":
            # Create reversal for posted JE, then regenerate
            rev_je = AccJournalEntry(
                client_id=client_id,
                entry_number=_je_number(client_id, db),
                date=date.today(), month=date.today().month, year=date.today().year,
                description=f"عكسي لتعديل معاملة — {old_je.description or old_je.entry_number}",
                entry_type="reversal", status="posted",
                total_debit=old_je.total_credit, total_credit=old_je.total_debit,
                is_balanced=old_je.is_balanced,
                notes=f"تعديل تلقائي للمعاملة رقم {tx_id}",
                created_by=current_user.id,
            )
            db.add(rev_je); db.flush()
            for l in old_je.lines:
                db.add(AccJournalLine(entry_id=rev_je.id, account_id=l.account_id,
                    account_code=l.account_code, account_name=l.account_name,
                    debit=l.credit, credit=l.debit, description=f"عكسي: {l.description or ''}",
                    sort_order=l.sort_order))
            tx.journal_entry_id = None

    for k, v in data.dict().items():
        setattr(tx, k, v)
    tx.month = data.date.month
    tx.year = data.date.year
    db.flush()

    # Regenerate journal entry
    new_je = _auto_journal_entry(tx, client_id, db, current_user.id)
    if new_je:
        tx.journal_entry_id = new_je.id

    db.commit()
    return {"message": "تم التحديث وإعادة توليد القيد تلقائياً ✅"}


@router.delete("/{client_id}/transactions/{tx_id}")
async def delete_transaction(
    client_id: int, tx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(AccTransaction).filter(AccTransaction.id == tx_id, AccTransaction.client_id == client_id).first()
    if not tx:
        raise HTTPException(404, detail="المعاملة غير موجودة")
    if tx.journal_entry_id:
        je = db.query(AccJournalEntry).filter(AccJournalEntry.id == tx.journal_entry_id).first()
        if je:
            db.delete(je)
    db.delete(tx)
    db.commit()
    return {"message": "تم الحذف"}


# ── Trial Balance ─────────────────────────────────────────────────────────────

@router.get("/{client_id}/trial-balance")
async def trial_balance(
    client_id: int,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    balances = _account_balances(client_id, db, year, month)
    accounts = db.query(AccAccount).filter(AccAccount.client_id == client_id, AccAccount.is_active == True).order_by(AccAccount.code).all()

    rows = []
    total_d = total_c = 0
    seen_codes = set()

    for a in accounts:
        # Look up by account_id first, then by "code:X" key for old NULL-id lines
        b = balances.get(a.id) or balances.get(f"code:{a.code}", {"debit": 0, "credit": 0})
        seen_codes.add(a.code)
        d = b["debit"] + (a.opening_balance if a.opening_type == "debit" else 0)
        c = b["credit"] + (a.opening_balance if a.opening_type == "credit" else 0)
        if d == 0 and c == 0:
            continue
        total_d += d
        total_c += c
        rows.append({
            "account_id": a.id, "code": a.code, "name": a.name,
            "account_type": a.account_type,
            "debit": round(d, 4), "credit": round(c, 4),
            "balance": round(d - c, 4),
        })
    # Include journal lines not matched by any CoA account (orphan lines)
    for key, b in balances.items():
        code = b.get("account_code", "")
        if code in seen_codes:
            continue
        d = b["debit"]
        c = b["credit"]
        if d == 0 and c == 0:
            continue
        total_d += d
        total_c += c
        rows.append({
            "account_id": key,
            "code": code,
            "name": b.get("account_name", "حساب غير مصنف"),
            "account_type": "unknown",
            "debit": round(d, 4), "credit": round(c, 4),
            "balance": round(d - c, 4),
        })
    rows.sort(key=lambda r: r.get("code") or "")
    return {
        "rows": rows,
        "total_debit": round(total_d, 4),
        "total_credit": round(total_c, 4),
        "is_balanced": abs(total_d - total_c) < 0.01,
        "year": year, "month": month,
    }


# ── Financial Reports ─────────────────────────────────────────────────────────

@router.get("/{client_id}/reports/income")
async def income_statement(
    client_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    balances = _account_balances(client_id, db, year=year)

    # Sum by account_type from journal lines
    type_totals = {}
    for aid, b in balances.items():
        acc_id = b.get("account_id")
        acc_code = b.get("account_code", "")
        if acc_id is not None:
            acc = db.query(AccAccount).filter(AccAccount.id == acc_id, AccAccount.client_id == client_id).first()
        else:
            acc = db.query(AccAccount).filter(AccAccount.code == acc_code, AccAccount.client_id == client_id).first()
        if not acc:
            continue
        t = acc.account_type
        if t not in type_totals:
            type_totals[t] = {"debit": 0, "credit": 0}
        type_totals[t]["debit"] += b["debit"]
        type_totals[t]["credit"] += b["credit"]

    revenue  = type_totals.get("revenue", {}).get("credit", 0) - type_totals.get("revenue", {}).get("debit", 0)
    cogs     = type_totals.get("expense", {}).get("debit", 0) - type_totals.get("expense", {}).get("credit", 0)
    gross    = revenue - cogs
    net      = gross  # simplified (no other adjustments yet)

    # Also get from transactions for detail breakdown
    tx_q = db.query(AccTransaction).filter(AccTransaction.client_id == client_id)
    if year:
        tx_q = tx_q.filter(AccTransaction.year == year)
    tx_sales = tx_q.filter(AccTransaction.transaction_type == "sale").with_entities(func.sum(AccTransaction.amount)).scalar() or 0
    tx_purchases = tx_q.filter(AccTransaction.transaction_type == "purchase").with_entities(func.sum(AccTransaction.amount)).scalar() or 0
    tx_expenses = tx_q.filter(AccTransaction.transaction_type == "expense").with_entities(func.sum(AccTransaction.amount)).scalar() or 0

    # Determine source: prefer journal entries (more accurate), fall back to transactions
    has_je_data = (revenue > 0 or cogs > 0)
    if not has_je_data and (tx_sales > 0 or tx_purchases > 0 or tx_expenses > 0):
        # Fallback to transactions when no journal entries exist
        revenue  = tx_sales
        cogs     = tx_purchases
        gross    = revenue - cogs
        net      = gross - tx_expenses
        source   = "transactions"
    else:
        source   = "journal_entries"

    return {
        "year": year,
        "source": source,
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross, 2),
        "total_expenses": round(cogs if source == "journal_entries" else tx_purchases + tx_expenses, 2),
        "net_profit": round(net if source == "journal_entries" else revenue - tx_purchases - tx_expenses, 2),
        # Transaction detail always available
        "tx_sales": round(tx_sales, 2),
        "tx_purchases": round(tx_purchases, 2),
        "tx_expenses": round(tx_expenses, 2),
    }


@router.get("/{client_id}/reports/balance-sheet")
async def balance_sheet(
    client_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    balances = _account_balances(client_id, db, year=year)
    accounts = db.query(AccAccount).filter(AccAccount.client_id == client_id).all()
    acc_map = {a.id: a for a in accounts}

    # Infer account_type from account_code when CoA not installed
    def _infer_type(code: str) -> str:
        if not code:
            return "asset"
        c = code[:1]
        if c == "1":   return "asset"
        if c == "2":   return "liability"
        if c == "3":   return "equity"
        if c == "4":   return "revenue"
        if c in ("5","6","7"): return "expense"
        return "asset"

    groups = {"asset": [], "liability": [], "equity": [], "revenue": [], "expense": []}
    for aid, b in balances.items():
        acc = acc_map.get(aid)
        code = acc.code if acc else b.get("account_code", "")
        name = acc.name if acc else b.get("account_name", "حساب غير مصنف")
        atype = acc.account_type if acc else _infer_type(code)
        if atype not in groups:
            atype = "asset"
        net = b["debit"] - b["credit"]
        groups[atype].append({
            "code": code, "name": name,
            "debit": b["debit"], "credit": b["credit"], "balance": net,
        })

    total_assets     = sum(r["balance"] for r in groups["asset"])
    total_liabs      = sum(-r["balance"] for r in groups["liability"])
    total_equity     = sum(-r["balance"] for r in groups["equity"])
    net_profit       = sum(-r["balance"] for r in groups["revenue"]) - sum(r["balance"] for r in groups["expense"])

    return {
        "year": year,
        "assets": {"items": groups["asset"], "total": round(total_assets, 2)},
        "liabilities": {"items": groups["liability"], "total": round(total_liabs, 2)},
        "equity": {"items": groups["equity"], "total": round(total_equity + net_profit, 2)},
        "net_profit": round(net_profit, 2),
        "total_liabilities_equity": round(total_liabs + total_equity + net_profit, 2),
    }


@router.get("/{client_id}/reports/vat")
async def vat_summary(
    client_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    months_ar = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]
    result = []
    total_sales_vat = total_purch_vat = 0

    for m in range(1, 13):
        qbase = db.query(AccTransaction).filter(AccTransaction.client_id == client_id, AccTransaction.month == m)
        if year: qbase = qbase.filter(AccTransaction.year == year)
        sales_vat  = qbase.filter(AccTransaction.transaction_type == "sale").with_entities(func.sum(AccTransaction.vat_amount)).scalar() or 0
        sales_net  = qbase.filter(AccTransaction.transaction_type == "sale").with_entities(func.sum(AccTransaction.amount)).scalar() or 0
        purch_vat  = qbase.filter(AccTransaction.transaction_type == "purchase").with_entities(func.sum(AccTransaction.vat_amount)).scalar() or 0
        purch_net  = qbase.filter(AccTransaction.transaction_type == "purchase").with_entities(func.sum(AccTransaction.amount)).scalar() or 0
        net_vat    = sales_vat - purch_vat
        total_sales_vat += sales_vat
        total_purch_vat += purch_vat
        result.append({
            "month": m, "month_name": months_ar[m-1],
            "sales_net": round(sales_net, 2), "sales_vat": round(sales_vat, 2),
            "purch_net": round(purch_net, 2), "purch_vat": round(purch_vat, 2),
            "net_vat": round(net_vat, 2),
            "status": "مستحق" if net_vat > 0 else ("دائن" if net_vat < 0 else "—"),
        })
    return {
        "year": year,
        "months": result,
        "total_sales_vat": round(total_sales_vat, 2),
        "total_purch_vat": round(total_purch_vat, 2),
        "net_vat": round(total_sales_vat - total_purch_vat, 2),
    }


@router.get("/{client_id}/summary")
async def accounting_summary(
    client_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dashboard summary for the accounting module."""
    def _sum(tx_type, col):
        q = db.query(func.sum(col)).filter(
            AccTransaction.client_id == client_id,
            AccTransaction.transaction_type == tx_type,
        )
        if year: q = q.filter(AccTransaction.year == year)
        return float(q.scalar() or 0)

    def _count():
        q = db.query(func.count(AccTransaction.id)).filter(AccTransaction.client_id == client_id)
        if year: q = q.filter(AccTransaction.year == year)
        return q.scalar() or 0

    sales     = _sum("sale",     AccTransaction.amount)
    purchases = _sum("purchase", AccTransaction.amount)
    expenses  = _sum("expense",  AccTransaction.amount)
    sales_vat = _sum("sale",     AccTransaction.vat_amount)
    purch_vat = _sum("purchase", AccTransaction.vat_amount)
    # total with VAT for dashboard display
    sales_total = _sum("sale",     AccTransaction.total_amount)
    tx_count    = _count()
    je_count  = db.query(func.count(AccJournalEntry.id)).filter(AccJournalEntry.client_id == client_id).scalar() or 0
    acc_count = db.query(func.count(AccAccount.id)).filter(AccAccount.client_id == client_id).scalar() or 0

    return {
        "sales": round(sales, 2),
        "sales_total": round(sales_total, 2),  # incl. VAT
        "purchases": round(purchases, 2),
        "expenses": round(expenses, 2),
        "gross_profit": round(sales - purchases, 2),
        "net_profit": round(sales - purchases - expenses, 2),
        "net_vat": round(sales_vat - purch_vat, 2),
        "tx_count": tx_count,
        "je_count": je_count,
        "acc_count": acc_count,
        "year": year,
    }


# ── Excel Import ──────────────────────────────────────────────────────────────

@router.post("/{client_id}/import/excel")
async def import_excel(
    client_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    استيراد Excel — يتعرف على الشيتات: مبيعات، مشتريات، مصروفات
    بنفس هيكل الملف المرفق تماماً.
    """
    import io
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(500, detail="مكتبة pandas غير مثبتة على الخادم")

    content = await file.read()
    try:
        xl = pd.ExcelFile(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, detail=f"ملف Excel غير صالح: {e}")

    imported = {"sales": 0, "purchases": 0, "expenses": 0, "errors": []}

    SALES_COLS    = {"الشهر":0,"السنة":1,"التاريخ":2,"اسم الشركة":3,"رقم المستند":6,"قيمة":7,"ض ق م":8,"الاجمالي":9,"خصم واضافة":10,"الاجمالي بعد الخصم":11}
    PURCH_COLS    = {"الشهر":0,"السنة":1,"التاريخ":2,"اسم الشركة":3,"رقم المستند":6,"قيمة":7,"ض ق م":8,"الاجمالي":9,"خصم واضافة":10,"الاجمالي بعد الخصم":11,"نسبة":12}
    EXPENSE_COLS  = {"السنة":0,"الشهر":1,"التاريخ":2,"المصروف":3,"نوع المصروف":4,"القيمة":5}

    for sheet in xl.sheet_names:
        df = pd.read_excel(xl, sheet_name=sheet, header=None)
        sname = sheet.strip()

        if "مبيع" in sname:
            # find header row (row with "الشهر")
            hrow = None
            for i, row in df.iterrows():
                if any(str(v).strip() == "الشهر" for v in row.values):
                    hrow = i; break
            if hrow is None: continue
            for i, row in df.iterrows():
                if i <= hrow: continue
                try:
                    amount = float(row.iloc[7]) if pd.notna(row.iloc[7]) else 0
                    if amount == 0: continue
                    raw_date = row.iloc[2]
                    if pd.isna(raw_date): continue
                    tx_date = pd.to_datetime(raw_date).date()
                    vat_amt = float(row.iloc[8]) if pd.notna(row.iloc[8]) else 0
                    total   = float(row.iloc[9]) if pd.notna(row.iloc[9]) else amount + vat_amt
                    wht_amt = float(row.iloc[10]) if pd.notna(row.iloc[10]) else 0
                    net     = float(row.iloc[11]) if pd.notna(row.iloc[11]) else total - wht_amt
                    tx = AccTransaction(
                        client_id=client_id, transaction_type="sale",
                        date=tx_date, month=tx_date.month, year=tx_date.year,
                        partner_name=str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else None,
                        doc_number=str(int(row.iloc[6])) if pd.notna(row.iloc[6]) else None,
                        amount=amount, vat_rate=0.14, vat_amount=vat_amt,
                        withholding_amount=wht_amt, total_amount=total, net_amount=net,
                        created_by=current_user.id,
                    )
                    db.add(tx); db.flush()
                    je = _auto_journal_entry(tx, client_id, db, current_user.id)
                    if je: tx.journal_entry_id = je.id
                    imported["sales"] += 1
                except Exception as ex:
                    imported["errors"].append(f"مبيعات صف {i}: {ex}")

        elif "مشتر" in sname:
            hrow = None
            for i, row in df.iterrows():
                if any(str(v).strip() == "الشهر" for v in row.values):
                    hrow = i; break
            if hrow is None: continue
            for i, row in df.iterrows():
                if i <= hrow: continue
                try:
                    amount = float(row.iloc[7]) if pd.notna(row.iloc[7]) else 0
                    if amount == 0: continue
                    raw_date = row.iloc[2]
                    if pd.isna(raw_date): continue
                    tx_date = pd.to_datetime(raw_date).date()
                    vat_amt = float(row.iloc[8]) if pd.notna(row.iloc[8]) else 0
                    total   = float(row.iloc[9]) if pd.notna(row.iloc[9]) else amount + vat_amt
                    wht_amt = float(row.iloc[10]) if pd.notna(row.iloc[10]) else 0
                    net     = float(row.iloc[11]) if pd.notna(row.iloc[11]) else total - wht_amt
                    tx = AccTransaction(
                        client_id=client_id, transaction_type="purchase",
                        date=tx_date, month=tx_date.month, year=tx_date.year,
                        partner_name=str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else None,
                        doc_number=str(int(row.iloc[6])) if pd.notna(row.iloc[6]) else None,
                        amount=amount, vat_rate=0.14, vat_amount=vat_amt,
                        withholding_amount=wht_amt, total_amount=total, net_amount=net,
                        created_by=current_user.id,
                    )
                    db.add(tx); db.flush()
                    je = _auto_journal_entry(tx, client_id, db, current_user.id)
                    if je: tx.journal_entry_id = je.id
                    imported["purchases"] += 1
                except Exception as ex:
                    imported["errors"].append(f"مشتريات صف {i}: {ex}")

        elif "مصروف" in sname:
            hrow = None
            for i, row in df.iterrows():
                if any(str(v).strip() == "المصروف" for v in row.values):
                    hrow = i; break
            if hrow is None: continue
            for i, row in df.iterrows():
                if i <= hrow: continue
                try:
                    amount = float(row.iloc[5]) if pd.notna(row.iloc[5]) else 0
                    if amount == 0: continue
                    raw_date = row.iloc[2]
                    if pd.isna(raw_date): continue
                    tx_date = pd.to_datetime(raw_date).date()
                    tx = AccTransaction(
                        client_id=client_id, transaction_type="expense",
                        date=tx_date, month=tx_date.month, year=tx_date.year,
                        partner_name=str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else None,
                        expense_category=str(row.iloc[4]).strip() if pd.notna(row.iloc[4]) else None,
                        amount=amount, total_amount=amount, net_amount=amount,
                        created_by=current_user.id,
                    )
                    db.add(tx); db.flush()
                    je = _auto_journal_entry(tx, client_id, db, current_user.id)
                    if je: tx.journal_entry_id = je.id
                    imported["expenses"] += 1
                except Exception as ex:
                    imported["errors"].append(f"مصروفات صف {i}: {ex}")

    db.commit()
    total = imported["sales"] + imported["purchases"] + imported["expenses"]
    return {
        "success": True,
        "imported": imported,
        "total": total,
        "message": f"✅ تم استيراد {total} معاملة ({imported['sales']} مبيعات، {imported['purchases']} مشتريات، {imported['expenses']} مصروفات)",
        "errors_count": len(imported["errors"]),
        "errors": imported["errors"][:10],
    }

# ── Free Invoice OCR — PDF / Image → Journal Entry (no API cost) ──────────────

def _extract_text_from_pdf(content: bytes) -> str:
    """Extract text from PDF using pdfplumber (free, no API)."""
    try:
        import pdfplumber, io
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except ImportError:
        pass
    # Fallback: try pypdf
    try:
        import pypdf, io
        reader = pypdf.PdfReader(io.BytesIO(content))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    except ImportError:
        pass
    return ""

def _extract_text_from_image(content: bytes) -> str:
    """Extract text from image using pytesseract (free OCR)."""
    try:
        import pytesseract
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(content))
        # Try Arabic+English
        try:
            return pytesseract.image_to_string(img, lang="ara+eng")
        except Exception:
            return pytesseract.image_to_string(img)
    except ImportError:
        pass
    return ""

def _parse_invoice_text(text: str, filename: str) -> dict:
    """Parse extracted text with regex to identify invoice fields. Free, no API."""
    import re
    from datetime import datetime as dt

    t = text.lower()
    fname = filename.lower()

    # ── Detect transaction type ──────────────────────────────
    score = {"sale": 0, "purchase": 0, "expense": 0, "asset": 0, "salary": 0, "tax": 0}

    SALE_KW     = ["sales invoice","invoice","فاتورة مبيعات","فاتورة بيع","sold to","bill to",
                   "inv-","receipt to","customer","عميل","مبيعات","إيراد","revenue"]
    PURCH_KW    = ["purchase","supplier bill","فاتورة مشتريات","فاتورة شراء","purchased from",
                   "vendor","supplier","مورد","مشتريات","شراء","pur-","bill from"]
    EXPENSE_KW  = ["electricity","utility","bill","كهرباء","اتصالات","phone","internet","مياه",
                   "water","rent receipt","إيجار","مصروف","expense","خدمة","service fee"]
    ASSET_KW    = ["equipment","furniture","asset","laptop","computer","vehicle","سيارة","معدات",
                   "أثاث","أصل","fixed asset","machinery","أجهزة"]
    SALARY_KW   = ["payroll","salary","wages","مرتبات","رواتب","أجور","payslip","كشف رواتب"]
    TAX_KW      = ["tax authority","ضريبة","vat return","tax notice","إشعار ضريبي","ض ق م",
                   "ضريبة القيمة المضافة","tax invoice","withholding","ضريبة دخل"]

    for kw in SALE_KW:    score["sale"]     += t.count(kw) * 3
    for kw in PURCH_KW:   score["purchase"] += t.count(kw) * 3
    for kw in EXPENSE_KW: score["expense"]  += t.count(kw) * 2
    for kw in ASSET_KW:   score["asset"]    += t.count(kw) * 3
    for kw in SALARY_KW:  score["salary"]   += t.count(kw) * 4
    for kw in TAX_KW:     score["tax"]      += t.count(kw) * 3

    # Filename hints
    for kw in ["sale","inv","مبيعات"]:
        if kw in fname: score["sale"] += 5
    for kw in ["pur","buy","مشتريات","مورد"]:
        if kw in fname: score["purchase"] += 5
    for kw in ["expense","مصروف","كهرباء","utility"]:
        if kw in fname: score["expense"] += 5

    tx_type = max(score, key=lambda k: score[k])
    if score[tx_type] == 0:
        tx_type = "expense"  # safe default

    # ── Confidence based on keyword match strength ───────────
    best_score = score[tx_type]
    confidence = min(95, max(30, 40 + best_score * 5))

    # ── Extract amounts ──────────────────────────────────────
    # Match numbers like 15,000.00 or 15000 or ١٥٬٠٠٠
    amt_patterns = [
        r'total[\s:]*(?:due|amount|egp)?[\s:]*([0-9][0-9,\.]+)',
        r'(?:grand total|net total|amount due)[\s:]*([0-9][0-9,\.]+)',
        r'(?:الإجمالي|الصافي|إجمالي)[\s:]*([0-9][0-9,\.]+)',
        r'([0-9][0-9,\.]{4,})',  # fallback: any big number
    ]
    amounts = []
    for pat in amt_patterns:
        for m in re.finditer(pat, t):
            try:
                v = float(m.group(1).replace(",", ""))
                if v > 10:
                    amounts.append(v)
            except Exception:
                pass

    # VAT patterns
    vat_patterns = [
        r'vat[\s:14%]*([0-9][0-9,\.]+)',
        r'(?:ض ق م|ضريبة القيمة المضافة)[\s:]*([0-9][0-9,\.]+)',
        r'tax[\s:14%]*([0-9][0-9,\.]+)',
    ]
    vat_amounts = []
    for pat in vat_patterns:
        for m in re.finditer(pat, t):
            try:
                v = float(m.group(1).replace(",", ""))
                if 0 < v < 1000000:
                    vat_amounts.append(v)
            except Exception:
                pass

    wht_patterns = [
        r'withholding[\s:3%]*([0-9][0-9,\.]+)',
        r'(?:خصم وإضافة|استقطاع)[\s:]*([0-9][0-9,\.]+)',
    ]
    wht_amounts = []
    for pat in wht_patterns:
        for m in re.finditer(pat, t):
            try:
                v = float(m.group(1).replace(",", ""))
                if 0 < v < 100000:
                    wht_amounts.append(v)
            except Exception:
                pass

    # Pick best amounts
    vat    = vat_amounts[0] if vat_amounts else 0.0
    wht    = wht_amounts[0] if wht_amounts else 0.0

    # Net/total = largest extracted amount (likely grand total)
    net_candidates = sorted(set(amounts), reverse=True)
    net = net_candidates[0] if net_candidates else 0.0

    # Amount before VAT
    if net > 0 and vat > 0:
        amount = net - vat if net > vat else net
    else:
        amount = net

    # ── Extract date ─────────────────────────────────────────
    date_pats = [
        r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})',
        r'(\d{1,2}[-/]\d{1,2}[-/]\d{4})',
        r'(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})',
    ]
    found_date = None
    for pat in date_pats:
        m = re.search(pat, t, re.IGNORECASE)
        if m:
            raw_d = m.group(1)
            for fmt in ("%Y-%m-%d","%Y/%m/%d","%d-%m-%Y","%d/%m/%Y","%d %B %Y","%d %b %Y"):
                try:
                    found_date = dt.strptime(raw_d, fmt).strftime("%Y-%m-%d")
                    break
                except Exception:
                    pass
            if found_date:
                break

    # ── Extract document number ──────────────────────────────
    doc_number = None
    # Try "Invoice No: INV-2026-0055" style
    m = re.search(r'(?:invoice|bill|receipt|فاتورة|إيصال)[^\n]{0,20}?([A-Z]{2,4}[-_]\d[\w\-/]*)', text, re.IGNORECASE)
    if m:
        doc_number = m.group(1).strip()[:30]
    else:
        # Fallback: any standalone code like INV-001
        m = re.search(r'\b([A-Z]{2,4}[-_]\d[\w\-/]*)', text)
        if m:
            doc_number = m.group(1).strip()[:30]

    # ── Extract partner name ─────────────────────────────────
    partner_pats = [
        r'(?:to|from|sold to|bill to|customer|client|supplier|vendor|عميل|مورد|من|إلى)[\s:]+([^\n]{3,60})',
        r'(?:company|co\.|ltd|llc|شركة|مؤسسة|مجموعة)[^\n]{0,60}',
    ]
    partner = None
    for pat in partner_pats:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            candidate = m.group(0).strip()[:80]
            if len(candidate) > 5:
                partner = candidate
                break

    # ── Build suggested JE hint ──────────────────────────────
    je_map = {
        "sale":     {"debit": "1220 عملاء",         "credits": ["4100 مبيعات","2120 ض.ق.م"]},
        "purchase": {"debit": "5110 مشتريات",        "credits": ["2110 موردون"]},
        "expense":  {"debit": "5200 مصروفات",        "credits": ["1210 نقدية"]},
        "asset":    {"debit": "1110 أصول ثابتة",     "credits": ["1210 نقدية"]},
        "salary":   {"debit": "5220 رواتب",           "credits": ["1210 نقدية"]},
        "tax":      {"debit": "2140 ضرائب مستحقة",   "credits": ["1210 نقدية"]},
    }

    return {
        "tx_type":    tx_type,
        "confidence": confidence,
        "date":       found_date,
        "amount":     round(amount, 2),
        "vat":        round(vat, 2),
        "wht":        round(wht, 2),
        "net":        round(net, 2),
        "partner":    partner,
        "doc_number": doc_number,
        "description": f"{tx_type} — {doc_number or ''}" if doc_number else tx_type,
        "suggested_je": je_map.get(tx_type, {}),
        "raw_text_preview": text[:300],
    }

@router.post("/{client_id}/import/invoice")
async def import_invoice(
    client_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """قراءة فاتورة PDF أو صورة مجاناً (OCR محلي) واقتراح القيد المحاسبي."""
    content = await file.read()
    if not content:
        raise HTTPException(400, detail="الملف فارغ")

    filename = (file.filename or "file").lower()
    mime = file.content_type or ""

    if filename.endswith(".pdf") or "pdf" in mime:
        is_pdf = True
    elif any(filename.endswith(ext) for ext in (".jpg",".jpeg",".png",".webp",".bmp",".tiff")):
        is_pdf = False
    else:
        raise HTTPException(400, detail="يجب أن يكون الملف PDF أو صورة (JPG/PNG/WebP)")

    if len(content) > 20_000_000:
        raise HTTPException(400, detail="حجم الملف كبير — الحد الأقصى 20 MB")

    # Extract text
    if is_pdf:
        text = _extract_text_from_pdf(content)
    else:
        text = _extract_text_from_image(content)

    if not text or len(text.strip()) < 5:
        raise HTTPException(422, detail="لم نتمكن من قراءة نص من الملف — تأكد أن الملف واضح وغير مشفّر")

    result = _parse_invoice_text(text, filename)

    return {
        "success":     True,
        "filename":    file.filename,
        "text_length": len(text),
        **result,
    }


# ── Smart Excel Import — Preview + Confirm ────────────────────────────────────

# ══════════════════════════════════════════════════════════════════════════════
# SMART EXCEL ENGINE v2 — يقرأ أي ملف Excel بغض النظر عن التنسيق أو المصدر
# ══════════════════════════════════════════════════════════════════════════════

def _smart_detect_tx_type(sheet_name: str, columns: list, sample_rows: list) -> tuple:
    """Universal Engine wrapper. Returns (tx_type, confidence_pct, source_hint)."""
    return _engine_detect_tx_type(sheet_name, columns, sample_rows)


def _smart_map_columns(cols: list, df_sample=None) -> dict:
    """Universal Engine wrapper. Returns {field: col_idx}."""
    return _engine_map_columns(cols, df_sample)


def _smart_parse_date(raw) -> Optional[str]:
    """تحليل التاريخ بأي صيغة شائعة."""
    import pandas as pd
    if raw is None: return None
    try:
        if hasattr(raw, 'strftime'):  # datetime object
            return raw.strftime("%Y-%m-%d")
        s = str(raw).strip()
        if not s or s.lower() in ('nan', 'none', 'nat', ''): return None
        # Normalize backslash separators (Windows style: 18\1\2026)
        s = s.replace('\\', '/')
        # Try pandas with dayfirst
        dt_obj = pd.to_datetime(s, dayfirst=True, errors='coerce')
        if pd.isna(dt_obj):
            # Try common formats explicitly
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y",
                        "%d.%m.%Y", "%Y/%m/%d", "%d %b %Y", "%d-%b-%Y",
                        "%Y%m%d", "%d %B %Y", "%d/%m/%y", "%m/%d/%y"):
                try:
                    from datetime import datetime
                    return datetime.strptime(s[:10], fmt).strftime("%Y-%m-%d")
                except Exception:
                    pass
            return None
        year = dt_obj.year
        if year < 1990 or year > 2100: return None
        return dt_obj.strftime("%Y-%m-%d")
    except Exception:
        return None


def _smart_parse_number(raw) -> Optional[float]:
    """تحليل أي رقم مهما كان تنسيقه."""
    if raw is None: return None
    try:
        import pandas as pd
        if isinstance(raw, (int, float)):
            if isinstance(raw, float) and pd.isna(raw): return None
            return float(raw)
        s = str(raw).strip()
        if not s or s.lower() in ('nan', 'none', ''): return None
        # Remove currency symbols, spaces, Arabic chars
        s = s.replace(',', '').replace('٬', '').replace('\xa0', '')
        s = ''.join(c for c in s if c.isdigit() or c in '.-')
        return float(s) if s else None
    except Exception:
        return None


def _row_quality_check(row_dict: dict) -> list:
    """فحص جودة كل صف — يرجع قائمة مشاكل."""
    issues = []
    amount = row_dict.get("amount", 0) or 0
    vat = row_dict.get("vat", 0) or 0
    net = row_dict.get("net", 0) or 0
    date = row_dict.get("date")

    if amount <= 0:
        issues.append("مبلغ صفر أو سالب")
    if amount > 0 and vat > 0:
        vat_rate = vat / amount
        if vat_rate > 0.20 or (vat_rate < 0.05 and vat_rate > 0):
            issues.append(f"نسبة ض.ق.م غير منطقية ({vat_rate:.1%})")
    if not date:
        issues.append("تاريخ غير صالح")
    if not row_dict.get("partner") and not row_dict.get("doc_number"):
        issues.append("بيانات العميل/المستند مفقودة")

    return issues


def _detect_tx_type(sheet_name: str, columns: list) -> str:
    """Legacy wrapper — يستخدم الـ smart engine."""
    tx_type, _, _ = _smart_detect_tx_type(sheet_name, columns, [])
    return tx_type


def _map_columns(df, tx_type: str) -> dict:
    """Legacy wrapper — يستخدم الـ smart engine."""
    cols = [str(c).strip() for c in df.columns]
    return _smart_map_columns(cols)


def _confidence_score(mapping: dict, tx_type: str) -> int:
    score = 0
    if mapping.get("date") is not None:    score += 35
    if mapping.get("amount") is not None:  score += 35
    if mapping.get("partner") is not None: score += 15
    if mapping.get("desc") is not None:    score += 10
    if mapping.get("doc") is not None:     score += 5
    return score


def _is_totals_row(row) -> bool:
    """هل الصف صف مجاميع أو إجمالي؟ يُتجاهَل دون خطأ."""
    totals_keywords = [
        'إجمالي', 'مجموع', 'total', 'grand total', 'subtotal',
        '**', 'الإجمالي العام', 'الإجمالي', 'ملخص', 'summary',
    ]
    for v in row.values:
        if v is None: continue
        if isinstance(v, float):
            import pandas as pd
            if pd.isna(v): continue
        s = str(v).strip().lower()
        if any(kw in s for kw in totals_keywords):
            return True
    return False


def _parse_excel_rows(df, mapping: dict, tx_type: str, sheet_name: str) -> tuple:
    """Parse rows with full diagnostics. Returns (good_rows, error_rows)."""
    import pandas as pd
    good_rows  = []
    error_rows = []

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # Excel row number (1-based + header)
        errors  = []
        warnings = []

        # تخطي صفوف المجاميع بصمت — ليست خطأ
        if _is_totals_row(row):
            continue

        def val(key):
            ci = mapping.get(key)
            if ci is None: return None
            if isinstance(ci, int) and ci < len(row):
                v = row.iloc[ci]
            else:
                return None
            if isinstance(v, float) and pd.isna(v): return None
            return v

        # ── raw values from sheet (for diagnostics) ──
        raw_date_val   = val("date")
        raw_amount_val = val("amount")
        raw_vat_val    = val("vat")

        # ── date: warning only — fallback to today if missing/invalid ──
        tx_date = _smart_parse_date(raw_date_val)
        if not tx_date:
            from datetime import date as _date
            tx_date = _date.today().strftime("%Y-%m-%d")
            if raw_date_val is None or (isinstance(raw_date_val, float) and pd.isna(raw_date_val)):
                warnings.append({"field": "date", "reason": "التاريخ فارغ — استُخدم تاريخ اليوم",
                                  "sheet_value": None, "action": "تم استيراده بتاريخ اليوم"})
            else:
                warnings.append({"field": "date", "reason": f"تاريخ غير مفهوم ({raw_date_val}) — استُخدم تاريخ اليوم",
                                  "sheet_value": str(raw_date_val), "action": "تم استيراده بتاريخ اليوم"})

        # ── amount: FATAL only if NO amount column exists at all ──
        amount = _smart_parse_number(raw_amount_val)
        if mapping.get("amount") is None:
            # Try fallback to net column
            net_fallback = _smart_parse_number(val("net"))
            if net_fallback and net_fallback > 0:
                amount = net_fallback
                warnings.append({"field": "amount", "reason": "عمود المبلغ غير موجود — استُخدم عمود الإجمالي بديلاً",
                                  "sheet_value": None, "action": f"مبلغ = {amount}"})
            else:
                errors.append({"field": "amount", "reason": "لا يوجد عمود مبلغ في الشيت",
                                "sheet_value": None, "parsed_value": 0})
                amount = None
        elif amount is None:
            warnings.append({"field": "amount", "reason": "المبلغ فارغ في هذا الصف",
                              "sheet_value": str(raw_amount_val) if raw_amount_val is not None else None,
                              "action": "تم استيراده بمبلغ صفر"})
            amount = 0.0
        elif amount <= 0:
            warnings.append({"field": "amount", "reason": f"المبلغ صفر أو سالب ({amount})",
                              "sheet_value": str(raw_amount_val), "action": "تم استيراده كما هو"})

        # ── vat (warning only) ──
        vat = _smart_parse_number(raw_vat_val) or 0.0
        if mapping.get("vat") is None:
            warnings.append({"field": "vat", "reason": "لم يُكتشف عمود الضريبة — سيُحسب تلقائياً 14%", "sheet_value": None, "parsed_value": 0})
        if amount and amount > 0 and vat > 0:
            vat_rate = vat / amount
            if vat_rate > 0.30:
                warnings.append({"field": "vat", "reason": f"نسبة ض.ق.م عالية جداً ({vat_rate:.1%}) — هل هذا إجمالي وليس ضريبة؟", "sheet_value": str(raw_vat_val), "parsed_value": round(vat, 2)})
            elif 0 < vat_rate < 0.01:
                warnings.append({"field": "vat", "reason": f"نسبة ض.ق.م منخفضة جداً ({vat_rate:.2%})", "sheet_value": str(raw_vat_val), "parsed_value": round(vat, 2)})

        wht  = _smart_parse_number(val("wht"))  or 0.0
        disc = _smart_parse_number(val("discount")) or 0.0
        net_raw = _smart_parse_number(val("net"))
        net  = net_raw if (net_raw and net_raw > 0) else (round((amount or 0) + vat - wht, 2))

        partner_raw = val("partner")
        partner = str(partner_raw).strip() if partner_raw is not None else None
        if partner and partner.lower() in ('nan', 'none', ''): partner = None
        if not partner:
            warnings.append({"field": "partner", "reason": "اسم العميل/المورد فارغ", "sheet_value": None, "parsed_value": None})

        desc_raw = val("desc")
        desc = str(desc_raw).strip() if desc_raw is not None else None
        if desc and desc.lower() in ('nan', 'none', ''): desc = None

        doc_raw = val("doc")
        doc_num = None
        if doc_raw is not None:
            doc_str = str(doc_raw).strip()
            if doc_str and doc_str.lower() not in ('nan', 'none'):
                doc_str = doc_str.replace(".0", "") if doc_str.endswith(".0") else doc_str
                doc_num = doc_str[:50]

        currency_raw = val("currency")
        currency = str(currency_raw).strip() if currency_raw is not None else "EGP"
        if not currency or currency.lower() in ('nan', 'none'): currency = "EGP"

        row_dict = {
            "row_index":    int(idx),
            "row_num":      row_num,
            "sheet":        sheet_name,
            "date":         tx_date if tx_date else None,
            "amount":       round(amount, 2) if amount else 0,
            "vat":          round(vat, 2),
            "wht":          round(wht, 2),
            "discount":     round(disc, 2),
            "net":          round(net, 2),
            "partner":      partner,
            "description":  desc,
            "doc_number":   doc_num,
            "currency":     currency,
            "tx_type":      tx_type,
            # raw sheet values for display
            "raw_date":     str(raw_date_val) if raw_date_val is not None else None,
            "raw_amount":   str(raw_amount_val) if raw_amount_val is not None else None,
            "raw_vat":      str(raw_vat_val) if raw_vat_val is not None else None,
            "errors":       errors,
            "warnings":     warnings,
        }

        # FATAL = no amount column at all → error_row (cannot import)
        # Everything else (bad date, empty cell, zero amount, missing partner) → warning → good_row
        if errors:
            row_dict["status"] = "error"
            row_dict["skip_reason"] = errors[0]["reason"]
            error_rows.append(row_dict)
        elif warnings:
            row_dict["status"] = "warning"
            row_dict["issues"]  = [w["reason"] for w in warnings]
            row_dict["actions"] = [w.get("action","") for w in warnings]
            row_dict["needs_review"] = False  # warnings don't block import
            good_rows.append(row_dict)
        else:
            row_dict["status"] = "ok"
            row_dict["issues"] = []
            row_dict["needs_review"] = False
            good_rows.append(row_dict)

    return good_rows, error_rows

class ImportConfirmRow(BaseModel):
    date: str
    amount: float
    vat: float = 0
    wht: float = 0
    net: float = 0
    partner: Optional[str] = None
    description: Optional[str] = None
    doc_number: Optional[str] = None
    tx_type: str   # sale|purchase|expense|asset|salary|tax
    expense_category: Optional[str] = None
    currency: str = "EGP"

class ImportConfirmRequest(BaseModel):
    rows: List[ImportConfirmRow]
    filename: str = "ملف Excel"
    import_good_only: bool = False
    section_type: Optional[str] = None  # sale|purchase|expense|asset|salary

@router.post("/{client_id}/import/excel/preview")
async def import_excel_preview(
    client_id: int,
    file: UploadFile = File(...),
    section: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Smart Excel Engine v2 — معاينة كاملة مع فحص جودة + مطابقة مجاميع + كشف تكرار.
    section: sale|purchase|expense|asset|salary — إن أُرسل يُقيّد الشيتات لهذا القسم فقط.
    """
    import io
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(500, detail="مكتبة pandas غير مثبتة")

    content = await file.read()
    try:
        xl = pd.ExcelFile(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, detail=f"ملف Excel غير صالح: {e}")

    # جلب رقم الفواتير الموجودة بالفعل لهذا العميل لكشف التكرار
    existing_docs = set(
        r[0] for r in db.query(AccTransaction.doc_number)
        .filter(AccTransaction.client_id == client_id, AccTransaction.doc_number.isnot(None))
        .all()
    )

    sheets_result = []
    all_good_rows  = []
    all_error_rows = []

    for sheet_name in xl.sheet_names:
        try:
            df_raw = pd.read_excel(xl, sheet_name=sheet_name, header=None)
            if df_raw.empty or len(df_raw) < 2:
                continue

            # اكتشاف صف الرأس
            header_row = 0
            for i, row in df_raw.iterrows():
                non_null = [v for v in row.values
                            if v is not None
                            and not (isinstance(v, float) and pd.isna(v))
                            and str(v).strip()
                            and not str(v).replace(".", "").lstrip("-").isdigit()]
                if len(non_null) >= 3:
                    header_row = i
                    break

            df = pd.read_excel(xl, sheet_name=sheet_name, header=header_row)
            df = df.dropna(how="all")

            cols = [str(c).strip() for c in df.columns]
            sample_data = [list(r) for _, r in df.head(5).iterrows()]

            tx_type, type_conf, _ = _smart_detect_tx_type(sheet_name, cols, sample_data)
            mapping  = _smart_map_columns(cols, df.head(20))
            field_conf = get_field_confidences(cols, df.head(20))
            col_conf = _confidence_score(mapping, tx_type)
            confidence = min(int((type_conf + col_conf) / 2), 95)

            # ── فلترة حسب القسم المطلوب ──
            SECTION_TX_MAP = {
                "sale":     ["sale"],
                "purchase": ["purchase"],
                "expense":  ["expense"],
                "asset":    ["asset"],
                "salary":   ["salary"],
            }
            if section and tx_type not in SECTION_TX_MAP.get(section, [tx_type]):
                SECTION_AR = {"sale":"مبيعات","purchase":"مشتريات","expense":"مصروفات","asset":"أصول","salary":"مرتبات"}
                sheets_result.append({
                    "sheet": sheet_name, "skipped": True,
                    "skip_reason": f"هذا الشيت ({tx_type}) لا ينتمي لقسم {SECTION_AR.get(section, section)} — تم تخطيه",
                    "raw_rows_count": len(df), "ok_rows_count": 0, "warning_rows_count": 0,
                    "error_rows_count": 0, "confidence": confidence, "totals_match": True,
                    "needs_review_count": 0, "diff_analysis": None, "col_mapping_detail": {},
                    "error_rows": [], "sample": [], "columns": cols[:10],
                    "col_mapping": {}, "tx_type": tx_type,
                })
                continue

            # تخطي الشيتات التي ليست بيانات فعلية (تقارير، ملخصات)
            # شرط التخطي: لا يوجد عمود تاريخ أو المبلغ — هذه شيتات تحليلية
            if mapping.get("date") is None and mapping.get("amount") is None:
                sheets_result.append({
                    "sheet": sheet_name, "skipped": True,
                    "skip_reason": "شيت تحليلي أو تقرير — لا يحتوي بيانات قابلة للاستيراد",
                    "raw_rows_count": len(df), "ok_rows_count": 0, "warning_rows_count": 0,
                    "error_rows_count": 0, "confidence": confidence, "totals_match": True,
                    "needs_review_count": 0, "diff_analysis": None, "col_mapping_detail": {},
                    "error_rows": [], "sample": [], "columns": cols[:10],
                    "col_mapping": {}, "tx_type": tx_type,
                })
                continue

            # تخطي شيتات البنود التفصيلية: فيها مبالغ لكن مافيش تاريخ
            if mapping.get("date") is None:
                sheets_result.append({
                    "sheet": sheet_name, "skipped": True,
                    "skip_reason": f"لم يُكتشف عمود التاريخ — قد تكون بنوداً تفصيلية. الأعمدة المتاحة: {', '.join(cols[:8])}",
                    "raw_rows_count": len(df), "ok_rows_count": 0, "warning_rows_count": 0,
                    "error_rows_count": 0, "confidence": confidence, "totals_match": True,
                    "needs_review_count": 0, "diff_analysis": None,
                    "col_mapping_detail": {f: {"found": mapping.get(f) is not None, "column_name": cols[mapping[f]] if mapping.get(f) is not None else None, "col_index": mapping.get(f), "confidence": "high" if mapping.get(f) is not None else "missing"} for f in ["date","amount","vat","partner","doc","net","wht","desc"]},
                    "error_rows": [], "sample": [], "columns": cols[:15],
                    "col_mapping": {k: (cols[v] if v is not None else None) for k, v in mapping.items()},
                    "tx_type": tx_type,
                })
                continue

            # تعيين الأعمدة مع التفاصيل وثقة كل حقل
            col_mapping_detail = {}
            any_low_confidence = False
            for field in ["date", "amount", "vat", "partner", "doc", "net", "wht", "desc"]:
                idx = mapping.get(field)
                fc = field_conf.get(field, {})
                conf_score = fc.get("confidence", 0)
                needs_review = fc.get("needs_review", idx is None)
                if needs_review and field in ("date", "amount"):
                    any_low_confidence = True
                col_mapping_detail[field] = {
                    "found":        idx is not None,
                    "column_name":  cols[idx] if idx is not None else None,
                    "col_index":    idx,
                    "confidence":   conf_score,
                    "method":       fc.get("method", "none"),
                    "needs_review": needs_review,
                }

            good_rows, error_rows = _parse_excel_rows(df, mapping, tx_type, sheet_name)

            # مجاميع الشيت من الـ raw data — نستثني صفوف المجاميع
            sheet_total_amount = 0.0
            sheet_total_vat    = 0.0
            sheet_total_net    = 0.0
            amt_idx = mapping.get("amount")
            vat_idx = mapping.get("vat")
            net_idx = mapping.get("net")
            raw_rows_count = 0
            for _, raw_row in df.iterrows():
                if _is_totals_row(raw_row):
                    continue  # تخطي صفوف المجاميع من حساب الـ expected
                a = _smart_parse_number(raw_row.iloc[amt_idx] if amt_idx is not None and amt_idx < len(raw_row) else None) or 0
                v = _smart_parse_number(raw_row.iloc[vat_idx] if vat_idx is not None and vat_idx < len(raw_row) else None) or 0
                n = _smart_parse_number(raw_row.iloc[net_idx] if net_idx is not None and net_idx < len(raw_row) else None) or 0
                sheet_total_amount += a
                sheet_total_vat    += v
                sheet_total_net    += n
                raw_rows_count     += 1

            parsed_total_amount = sum(r["amount"] for r in good_rows)
            parsed_total_vat    = sum(r["vat"]    for r in good_rows)
            parsed_total_net    = sum(r["net"]    for r in good_rows)

            amount_diff = abs(round(sheet_total_amount - parsed_total_amount, 2))
            totals_match = amount_diff <= 1.0

            # تشخيص سبب الفرق
            diff_analysis = None
            if not totals_match and amount_diff > 1:
                reasons = []
                if amt_idx is None:
                    reasons.append(f"عمود المبلغ لم يُكتشف — النظام لم يقرأ أي قيمة (مجموع مستخرج = 0)")
                else:
                    if len(error_rows) > 0:
                        err_amount = sum(
                            _smart_parse_number(r.get("raw_amount")) or 0
                            for r in error_rows
                        )
                        reasons.append(f"تم تجاهل {len(error_rows)} صف بسبب أخطاء (خسارة تقريبية: {round(err_amount,2):,} جنيه)")
                    if parsed_total_amount == 0 and sheet_total_amount > 0:
                        reasons.append(f"العمود المكتشف ({cols[amt_idx]}) لا يحتوي أرقام قابلة للقراءة")
                    elif amount_diff > 0:
                        reasons.append(f"مجموع الشيت: {sheet_total_amount:,.2f} | مجموع مستخرج: {parsed_total_amount:,.2f} | فرق: {amount_diff:,.2f}")
                if not reasons:
                    reasons.append(f"فرق {amount_diff:,.2f} جنيه — قد يكون بسبب صفوف الإجمالي داخل الشيت")
                diff_analysis = {
                    "sheet_total":  round(sheet_total_amount, 2),
                    "parsed_total": round(parsed_total_amount, 2),
                    "diff":         round(amount_diff, 2),
                    "reasons":      reasons,
                    "error_rows_count": len(error_rows),
                    "amount_col":   cols[amt_idx] if amt_idx is not None else None,
                }

            # كشف الشيت المكرر: لو كل doc_numbers موجودة في شيت سابق
            current_docs = set(r.get("doc_number") for r in good_rows if r.get("doc_number"))
            seen_docs_so_far = set(r.get("doc_number") for r in all_good_rows if r.get("doc_number"))
            is_duplicate_sheet = (len(current_docs) > 0 and
                                  len(current_docs - seen_docs_so_far) == 0 and
                                  len(seen_docs_so_far) > 0)

            if is_duplicate_sheet:
                sheets_result.append({
                    "sheet": sheet_name, "skipped": True,
                    "skip_reason": f"شيت مكرر — جميع فواتيره ({len(current_docs)}) موجودة بالفعل في شيت سابق",
                    "raw_rows_count": raw_rows_count, "ok_rows_count": 0, "warning_rows_count": 0,
                    "error_rows_count": 0, "confidence": confidence, "totals_match": True,
                    "needs_review_count": 0, "diff_analysis": None, "col_mapping_detail": col_mapping_detail,
                    "error_rows": [], "sample": good_rows[:3], "columns": cols[:15],
                    "col_mapping": {k: (cols[v] if v is not None else None) for k, v in mapping.items()},
                    "tx_type": tx_type,
                })
                continue  # لا تُضف صفوفه لكل_good_rows

            sheets_result.append({
                "sheet":               sheet_name,
                "tx_type":             tx_type,
                "confidence":          confidence,
                "raw_rows_count":      raw_rows_count,
                "ok_rows_count":       len([r for r in good_rows if r["status"]=="ok"]),
                "warning_rows_count":  len([r for r in good_rows if r["status"]=="warning"]),
                "error_rows_count":    len(error_rows),
                "columns":             cols[:30],
                "col_mapping":         {k: (cols[v] if v is not None else None) for k, v in mapping.items()},
                "col_mapping_detail":  col_mapping_detail,
                "any_low_confidence":  any_low_confidence,
                "sample":              good_rows[:5],
                "error_rows":          error_rows[:50],
                "sheet_total_amount":  round(sheet_total_amount, 2),
                "sheet_total_vat":     round(sheet_total_vat, 2),
                "sheet_total_net":     round(sheet_total_net, 2),
                "parsed_total_amount": round(parsed_total_amount, 2),
                "parsed_total_vat":    round(parsed_total_vat, 2),
                "parsed_total_net":    round(parsed_total_net, 2),
                "totals_match":        totals_match,
                "amount_diff":         round(amount_diff, 2),
                "diff_analysis":       diff_analysis,
                "needs_review_count":  len([r for r in good_rows if r.get("needs_review")]),
                "quality_issues":      [{"row": r["row_num"], "sheet": sheet_name, "issues": r.get("issues",[])} for r in good_rows if r.get("needs_review")][:50],
            })
            all_good_rows.extend(good_rows)
            all_error_rows.extend(error_rows)
        except Exception as ex:
            sheets_result.append({
                "sheet": sheet_name, "error": str(ex),
                "raw_rows_count": 0, "ok_rows_count": 0, "warning_rows_count": 0, "error_rows_count": 0,
                "confidence": 0, "totals_match": False, "needs_review_count": 0,
                "diff_analysis": None, "col_mapping_detail": {},
            })

    # إزالة التكرار داخل الملف
    seen_file = set()
    unique_good = []
    for r in all_good_rows:
        key = (r.get("date"), r["amount"], r.get("doc_number") or r["tx_type"])
        if key not in seen_file:
            seen_file.add(key)
            doc = r.get("doc_number")
            r["already_in_db"] = bool(doc and doc in existing_docs)
            unique_good.append(r)

    new_rows       = [r for r in unique_good if not r.get("already_in_db")]
    duplicate_rows = [r for r in unique_good if r.get("already_in_db")]
    total_needs_review = sum(1 for r in new_rows if r.get("needs_review"))

    any_totals_mismatch = any(
        not s.get("totals_match", True) for s in sheets_result if "error" not in s
    )
    # لا يُوقف الاستيراد — فقط تحذير
    import_blocked = False
    block_reason   = None
    # يُوقف فقط لو لا يوجد أي صف صالح على الإطلاق
    if len(new_rows) == 0 and len(all_error_rows) > 0:
        import_blocked = True
        block_reason   = "جميع الصفوف تحتوي أخطاء — لا يوجد صف صالح للاستيراد"

    # Build skipped_details: rows with warnings + skipped sheets
    warning_rows = [r for r in new_rows if r.get("status") == "warning"]
    ok_rows      = [r for r in new_rows if r.get("status") == "ok"]
    skipped_sheets = [s for s in sheets_result if s.get("skipped")]

    # Skipped row details (date fallback, empty amount, etc.)
    skipped_row_details = []
    for r in warning_rows[:50]:
        for issue in (r.get("issues") or []):
            skipped_row_details.append({
                "sheet": r.get("sheet",""), "row": r.get("row_num",""),
                "issue": issue,
                "action": (r.get("actions") or [issue])[0] if r.get("actions") else "تم استيراده مع التحذير",
            })

    # ── تحقق من حالة الشيتات الصالحة للقسم المطلوب ──
    importable_sheets = [s for s in sheets_result if not s.get("skipped") and not s.get("error")]
    needs_sheet_selection = False
    sheet_candidates = []
    if section and len(importable_sheets) > 1:
        needs_sheet_selection = True
        sheet_candidates = [
            {"sheet": s["sheet"], "confidence": s["confidence"],
             "row_count": s["ok_rows_count"] + s["warning_rows_count"],
             "tx_type": s["tx_type"]}
            for s in importable_sheets
        ]

    return {
        "sheets":               sheets_result,
        "total_rows":           len(unique_good),
        "new_rows_count":       len(new_rows),
        "ok_rows_count":        len(ok_rows),
        "warning_rows_count":   len(warning_rows),
        "duplicate_rows_count": len(duplicate_rows),
        "error_rows_count":     len(all_error_rows),
        "rows":                 new_rows,
        "error_rows":           all_error_rows[:100],
        "duplicate_rows":       duplicate_rows[:20],
        "total_needs_review":   total_needs_review,
        "any_totals_mismatch":  any_totals_mismatch,
        "import_blocked":       import_blocked,
        "block_reason":         block_reason,
        "section":              section,
        "needs_sheet_selection": needs_sheet_selection,
        "sheet_candidates":     sheet_candidates,
        "importable_count":     len(new_rows),
        "skipped_sheets":       [{"sheet": s["sheet"], "reason": s.get("skip_reason","")} for s in skipped_sheets],
        "skipped_row_details":  skipped_row_details,
        "fatal_errors":         all_error_rows[:20],
        "message":              f"سيتم استيراد {len(new_rows)} صف من {len(importable_sheets)} شيت",
    }


@router.post("/{client_id}/import/excel/confirm")
async def import_excel_confirm(
    client_id: int,
    data: ImportConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """اعتماد المعاينة — يحفظ الصفوف ويُنشئ Batch + قيود مرتبطة بالمصدر."""
    from datetime import datetime as dt
    ensure_batch_migrations(db)

    imported = {"sale": 0, "purchase": 0, "expense": 0, "asset": 0, "salary": 0, "tax": 0, "errors": []}

    # إنشاء Import Batch يربط كل المعاملات بعملية الاستيراد
    batch = AccImportBatch(
        client_id=client_id,
        filename=data.filename,
        source_type="excel_import",
        imported_by=current_user.id,
    )
    # section_type — يُخزن القسم الذي استُورد من خلاله
    try:
        batch.section_type = data.section_type
    except Exception:
        pass
    db.add(batch); db.flush()
    batch_id = batch.id

    imported_ids = []
    je_ids = []
    for row in data.rows:
        try:
            tx_date = dt.strptime(row.date[:10], "%Y-%m-%d").date()
            net = row.net if row.net > 0 else row.amount + row.vat - row.wht
            tx_type = row.tx_type if row.tx_type in ("sale","purchase","expense","asset","salary","tax") else "expense"
            tx = AccTransaction(
                client_id=client_id,
                transaction_type=tx_type,
                date=tx_date,
                month=tx_date.month,
                year=tx_date.year,
                partner_name=row.partner,
                doc_number=row.doc_number,
                expense_category=row.expense_category or row.description,
                amount=row.amount,
                vat_rate=0.14 if row.vat > 0 else 0,
                vat_amount=row.vat,
                withholding_amount=row.wht,
                total_amount=row.amount + row.vat,
                net_amount=net,
                notes=row.description,
                import_batch_id=batch_id,
                created_by=current_user.id,
            )
            db.add(tx); db.flush()
            je = _auto_journal_entry(tx, client_id, db, current_user.id)
            if je:
                tx.journal_entry_id = je.id
                try:
                    je.import_batch_id = batch_id
                    je.source_file = data.filename
                    je.source_type = "excel_import"
                    je.doc_ref = row.doc_number
                except Exception:
                    pass
                je_ids.append(je.id)
            imported[tx_type] = imported.get(tx_type, 0) + 1
            imported_ids.append(tx.id)
        except Exception as ex:
            imported["errors"].append(f"صف {row.date}: {ex}")

    # تحديث إحصائيات الـ Batch
    batch.tx_count        = len(imported_ids)
    batch.je_count        = len(je_ids)
    batch.total_sales     = sum(r.amount for r in data.rows if r.tx_type == "sale")
    batch.total_purchases = sum(r.amount for r in data.rows if r.tx_type == "purchase")
    batch.total_expenses  = sum(r.amount for r in data.rows if r.tx_type == "expense")
    batch.total_salary    = sum(r.amount for r in data.rows if r.tx_type == "salary")
    batch.total_vat       = sum(r.vat for r in data.rows)
    batch.total_net       = sum(r.net for r in data.rows)

    db.commit()
    total = sum(v for k, v in imported.items() if k != "errors")
    return {
        "success":      True,
        "imported":     imported,
        "imported_ids": imported_ids,
        "batch_id":     batch_id,
        "total":        total,
        "message":      f"✅ تم استيراد {total} معاملة وإنشاء القيود المحاسبية تلقائياً",
        "errors_count": len(imported["errors"]),
        "errors":       imported["errors"][:10],
    }


class DeleteBatchRequest(BaseModel):
    tx_ids: List[int]

@router.post("/{client_id}/transactions/delete-batch")
async def delete_transactions_batch(
    client_id: int,
    data: DeleteBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """حذف مجموعة معاملات وقيودها دفعة واحدة (undo import)."""
    deleted = 0
    for tx_id in data.tx_ids:
        tx = db.query(AccTransaction).filter(AccTransaction.id == tx_id, AccTransaction.client_id == client_id).first()
        if not tx:
            continue
        if tx.journal_entry_id:
            je = db.query(AccJournalEntry).filter(AccJournalEntry.id == tx.journal_entry_id).first()
            if je:
                db.delete(je)
        db.delete(tx)
        deleted += 1
    db.commit()
    return {"success": True, "deleted": deleted, "message": f"تم حذف {deleted} معاملة وقيودها"}


# ── Import Batch Management ────────────────────────────────────────────────────

@router.get("/{client_id}/import/batches")
async def list_import_batches(
    client_id: int,
    section_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """سجل عمليات الاستيراد. يقبل ?section_type=sale|purchase|... للفلترة."""
    ensure_batch_migrations(db)
    q = db.query(AccImportBatch)\
        .filter(AccImportBatch.client_id == client_id, AccImportBatch.status == "active")
    if section_type:
        try:
            q = q.filter(AccImportBatch.section_type == section_type)
        except Exception:
            pass
    batches = q.order_by(AccImportBatch.imported_at.desc()).all()

    from app.models.user import User as UserModel
    users = {u.id: getattr(u, 'name', getattr(u, 'full_name', str(u.id)))
             for u in db.query(UserModel).all()}

    result = []
    for b in batches:
        result.append({
            "id":              b.id,
            "filename":        b.filename,
            "source_type":     b.source_type,
            "imported_by":     users.get(b.imported_by, "—"),
            "imported_at":     b.imported_at.isoformat() if b.imported_at else None,
            "tx_count":        b.tx_count,
            "je_count":        b.je_count,
            "total_sales":     b.total_sales or 0,
            "total_purchases": b.total_purchases or 0,
            "total_expenses":  b.total_expenses or 0,
            "total_salary":    b.total_salary or 0,
            "total_vat":       b.total_vat or 0,
            "total_net":       b.total_net or 0,
            "status":          b.status,
            "section_type":    getattr(b, 'section_type', None) or "—",
        })
    return {"batches": result, "total": len(result)}


@router.delete("/{client_id}/import/batches/{batch_id}")
async def delete_import_batch(
    client_id: int,
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """حذف عملية استيراد بالكامل — TX + JE + Lines بدون التأثير على باقي العمليات."""
    ensure_batch_migrations(db)
    batch = db.query(AccImportBatch)\
        .filter(AccImportBatch.id == batch_id, AccImportBatch.client_id == client_id).first()
    if not batch:
        raise HTTPException(404, "عملية الاستيراد غير موجودة")

    txs = db.query(AccTransaction)\
        .filter(AccTransaction.import_batch_id == batch_id, AccTransaction.client_id == client_id).all()

    je_ids_to_delete = set()
    deleted_tx = 0

    for tx in txs:
        if tx.journal_entry_id:
            je_ids_to_delete.add(tx.journal_entry_id)
        db.delete(tx)
        deleted_tx += 1

    # أيضاً: احذف أي JE مرتبط بهذا الـ Batch مباشرةً (بغض النظر عن TX)
    orphan_jes = db.query(AccJournalEntry)\
        .filter(AccJournalEntry.import_batch_id == batch_id,
                AccJournalEntry.client_id == client_id).all()
    for je in orphan_jes:
        je_ids_to_delete.add(je.id)

    # احذف كل الـ JEs المجمّعة
    deleted_je = 0
    for je_id in je_ids_to_delete:
        je = db.query(AccJournalEntry).filter(AccJournalEntry.id == je_id).first()
        if je:
            db.delete(je)
            deleted_je += 1

    batch.status = "deleted"
    db.commit()
    return {
        "success":                True,
        "deleted_transactions":   deleted_tx,
        "deleted_journal_entries":deleted_je,
        "message": f"تم حذف {deleted_tx} معاملة و{deleted_je} قيد — بدون التأثير على باقي البيانات",
    }


@router.post("/{client_id}/import/cleanup-orphans")
async def cleanup_orphan_journal_entries(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """حذف القيود اليتيمة — JEs بدون TX مرتبط (من استيرادات قديمة أو نسخ تجريبية)."""
    all_jes = db.query(AccJournalEntry)\
        .filter(AccJournalEntry.client_id == client_id).all()

    # جمع كل journal_entry_ids المربوطة بـ TX فعلي
    linked_je_ids = set(
        r[0] for r in db.query(AccTransaction.journal_entry_id)
        .filter(AccTransaction.client_id == client_id,
                AccTransaction.journal_entry_id.isnot(None)).all()
    )

    # أنواع القيود التلقائية (ليست يدوية حقيقية من المستخدم)
    auto_types = {'sale', 'purchase', 'expense', 'salary', 'asset', 'tax',
                  'reversal', 'auto', 'excel_import', None}

    deleted = 0
    for je in all_jes:
        is_orphan = je.id not in linked_je_ids
        is_auto = je.entry_type in auto_types or getattr(je, 'source_type', None) in ('excel_import', 'auto', None)
        if is_orphan and is_auto:
            # إجبار الحذف بغض النظر عن الحالة
            db.delete(je)
            deleted += 1

    db.commit()
    return {"success": True, "deleted_orphans": deleted,
            "message": f"تم حذف {deleted} قيد يتيم"}


# ═══════════════════════════════════════════════════════════════════════════════
# ERP PHASE 1 — General Ledger, Treasury, Checks, Advances, AR/AP, JE Copy
# ═══════════════════════════════════════════════════════════════════════════════

# ── Pydantic schemas for new features ────────────────────────────────────────

class TreasuryCreate(BaseModel):
    name: str
    treasury_type: str = "cash"
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    opening_balance: float = 0
    notes: Optional[str] = None

class TreasuryTxCreate(BaseModel):
    treasury_id: int
    date: str
    tx_type: str           # deposit | withdrawal | transfer_out
    amount: float
    to_treasury_id: Optional[int] = None
    description: Optional[str] = None
    reference: Optional[str] = None

class CheckCreate(BaseModel):
    check_type: str        # incoming | outgoing
    check_number: Optional[str] = None
    bank_name: Optional[str] = None
    branch: Optional[str] = None
    amount: float
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    partner_name: Optional[str] = None
    partner_phone: Optional[str] = None
    treasury_id: Optional[int] = None
    notes: Optional[str] = None

class AdvanceCreate(BaseModel):
    advance_type: str = "advance"   # advance | custody
    employee_name: str
    employee_id_ref: Optional[str] = None
    amount: float
    issue_date: str
    due_date: Optional[str] = None
    purpose: Optional[str] = None
    notes: Optional[str] = None


def _parse_date(d) -> date:
    if isinstance(d, date): return d
    return datetime.strptime(str(d)[:10], "%Y-%m-%d").date()


# ── General Ledger (دفتر الأستاذ) ────────────────────────────────────────────

@router.get("/{client_id}/ledger/{account_id}")
async def general_ledger(
    client_id: int,
    account_id: int,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """كشف حساب لحساب معين مع رصيد متراكم"""
    acc = db.query(AccAccount).filter_by(id=account_id, client_id=client_id).first()
    if not acc:
        raise HTTPException(404, detail="الحساب غير موجود")

    q = (db.query(AccJournalLine, AccJournalEntry)
         .join(AccJournalEntry, AccJournalLine.entry_id == AccJournalEntry.id)
         .filter(AccJournalLine.account_id == account_id,
                 AccJournalEntry.client_id == client_id,
                 AccJournalEntry.status == "posted"))

    if from_date:
        q = q.filter(AccJournalEntry.date >= _parse_date(from_date))
    if to_date:
        q = q.filter(AccJournalEntry.date <= _parse_date(to_date))

    rows = q.order_by(AccJournalEntry.date, AccJournalEntry.id).all()

    # Calculate opening balance before from_date
    opening = acc.opening_balance or 0
    if acc.opening_type == "credit":
        opening = -opening
    if from_date:
        prev = (db.query(
                    func.sum(AccJournalLine.debit) - func.sum(AccJournalLine.credit)
                )
                .join(AccJournalEntry)
                .filter(AccJournalLine.account_id == account_id,
                        AccJournalEntry.client_id == client_id,
                        AccJournalEntry.status == "posted",
                        AccJournalEntry.date < _parse_date(from_date))
                .scalar() or 0)
        opening += prev

    lines = []
    running = opening
    for line, entry in rows:
        running += (line.debit or 0) - (line.credit or 0)
        lines.append({
            "id": line.id,
            "date": str(entry.date),
            "entry_number": entry.entry_number,
            "description": line.description or entry.description or "",
            "reference": entry.reference or "",
            "debit": line.debit or 0,
            "credit": line.credit or 0,
            "balance": round(running, 2),
            "partner_name": line.partner_name or "",
            "entry_status": entry.status,
        })

    total_debit  = sum(l["debit"]  for l in lines)
    total_credit = sum(l["credit"] for l in lines)
    return {
        "account": {"id": acc.id, "code": acc.code, "name": acc.name, "type": acc.account_type},
        "opening_balance": round(opening, 2),
        "lines": lines,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "closing_balance": round(opening + total_debit - total_credit, 2),
    }


# ── Journal Entry Copy ────────────────────────────────────────────────────────

@router.post("/{client_id}/journal-entries/{je_id}/copy")
async def copy_journal_entry(
    client_id: int,
    je_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """نسخ قيد — ينشئ قيد مسودة جديد بنفس السطور"""
    orig = db.query(AccJournalEntry).filter_by(id=je_id, client_id=client_id).first()
    if not orig:
        raise HTTPException(404)
    today = date.today()
    new_je = AccJournalEntry(
        client_id=client_id,
        entry_number=_je_number(client_id, db),
        date=today, month=today.month, year=today.year,
        description=f"نسخة من: {orig.description or orig.entry_number}",
        reference=orig.reference,
        entry_type=orig.entry_type,
        status="draft",
        total_debit=orig.total_debit, total_credit=orig.total_credit,
        is_balanced=orig.is_balanced,
        created_by=current_user.id,
    )
    db.add(new_je); db.flush()
    for l in orig.lines:
        db.add(AccJournalLine(
            entry_id=new_je.id, account_id=l.account_id,
            account_code=l.account_code, account_name=l.account_name,
            debit=l.debit, credit=l.credit,
            description=l.description, sort_order=l.sort_order,
        ))
    db.commit()
    return {"id": new_je.id, "entry_number": new_je.entry_number, "message": "✅ تم نسخ القيد"}


# ── Treasury CRUD ─────────────────────────────────────────────────────────────

@router.get("/{client_id}/treasuries")
async def list_treasuries(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(AccTreasury).filter_by(client_id=client_id, is_active=True).all()
    result = []
    for t in rows:
        txs = db.query(AccTreasuryTx).filter_by(treasury_id=t.id).all()
        balance = t.opening_balance or 0
        for tx in txs:
            if tx.tx_type in ("deposit", "transfer_in"):
                balance += tx.amount
            else:
                balance -= tx.amount
        result.append({
            "id": t.id, "name": t.name, "treasury_type": t.treasury_type,
            "bank_name": t.bank_name, "account_number": t.account_number,
            "opening_balance": t.opening_balance, "current_balance": round(balance, 2),
            "notes": t.notes,
        })
    return result


@router.post("/{client_id}/treasuries")
async def create_treasury(
    client_id: int,
    body: TreasuryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = AccTreasury(client_id=client_id, created_by=current_user.id, **body.dict())
    db.add(t); db.commit(); db.refresh(t)
    return {"id": t.id, "name": t.name, "message": "✅ تم إنشاء الخزينة"}


@router.put("/{client_id}/treasuries/{t_id}")
async def update_treasury(
    client_id: int, t_id: int, body: TreasuryCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    t = db.query(AccTreasury).filter_by(id=t_id, client_id=client_id).first()
    if not t: raise HTTPException(404)
    for k, v in body.dict(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    return {"message": "✅ تم التحديث"}


@router.delete("/{client_id}/treasuries/{t_id}")
async def delete_treasury(
    client_id: int, t_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    t = db.query(AccTreasury).filter_by(id=t_id, client_id=client_id).first()
    if not t: raise HTTPException(404)
    t.is_active = False
    db.commit()
    return {"message": "✅ تم الحذف"}


@router.get("/{client_id}/treasuries/{t_id}/transactions")
async def list_treasury_txs(
    client_id: int, t_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    txs = (db.query(AccTreasuryTx)
           .filter_by(treasury_id=t_id, client_id=client_id)
           .order_by(AccTreasuryTx.date.desc())
           .all())
    return [{"id": t.id, "date": str(t.date), "tx_type": t.tx_type,
             "amount": t.amount, "description": t.description,
             "reference": t.reference, "to_treasury_id": t.to_treasury_id} for t in txs]


@router.post("/{client_id}/treasuries/transactions")
async def create_treasury_tx(
    client_id: int,
    body: TreasuryTxCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx_date = _parse_date(body.date)
    tx = AccTreasuryTx(
        client_id=client_id,
        treasury_id=body.treasury_id,
        date=tx_date,
        tx_type=body.tx_type,
        amount=body.amount,
        to_treasury_id=body.to_treasury_id,
        description=body.description,
        reference=body.reference,
        created_by=current_user.id,
    )
    db.add(tx)
    # If transfer, create the incoming side
    if body.tx_type == "transfer_out" and body.to_treasury_id:
        tx_in = AccTreasuryTx(
            client_id=client_id,
            treasury_id=body.to_treasury_id,
            date=tx_date,
            tx_type="transfer_in",
            amount=body.amount,
            to_treasury_id=body.treasury_id,
            description=f"تحويل من: {body.description or ''}",
            created_by=current_user.id,
        )
        db.add(tx_in)
    db.commit()
    return {"message": "✅ تم تسجيل الحركة"}


@router.delete("/{client_id}/treasuries/transactions/{tx_id}")
async def delete_treasury_tx(
    client_id: int, tx_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    tx = db.query(AccTreasuryTx).filter_by(id=tx_id, client_id=client_id).first()
    if not tx: raise HTTPException(404)
    db.delete(tx); db.commit()
    return {"message": "✅ تم الحذف"}


# ── Checks ────────────────────────────────────────────────────────────────────

@router.get("/{client_id}/checks")
async def list_checks(
    client_id: int,
    check_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AccCheck).filter_by(client_id=client_id)
    if check_type: q = q.filter_by(check_type=check_type)
    if status: q = q.filter_by(status=status)
    rows = q.order_by(AccCheck.due_date).all()
    today = date.today()
    return [{
        "id": c.id, "check_type": c.check_type, "check_number": c.check_number,
        "bank_name": c.bank_name, "branch": c.branch,
        "amount": c.amount, "issue_date": str(c.issue_date) if c.issue_date else None,
        "due_date": str(c.due_date) if c.due_date else None,
        "days_to_due": (c.due_date - today).days if c.due_date else None,
        "partner_name": c.partner_name, "partner_phone": c.partner_phone,
        "status": c.status, "notes": c.notes,
        "treasury_id": c.treasury_id,
    } for c in rows]


@router.post("/{client_id}/checks")
async def create_check(
    client_id: int, body: CheckCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    c = AccCheck(
        client_id=client_id, created_by=current_user.id,
        check_type=body.check_type, check_number=body.check_number,
        bank_name=body.bank_name, branch=body.branch,
        amount=body.amount,
        issue_date=_parse_date(body.issue_date) if body.issue_date else None,
        due_date=_parse_date(body.due_date) if body.due_date else None,
        partner_name=body.partner_name, partner_phone=body.partner_phone,
        treasury_id=body.treasury_id, notes=body.notes,
    )
    db.add(c); db.commit(); db.refresh(c)
    return {"id": c.id, "message": "✅ تم تسجيل الشيك"}


@router.patch("/{client_id}/checks/{check_id}/status")
async def update_check_status(
    client_id: int, check_id: int,
    body: dict,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    c = db.query(AccCheck).filter_by(id=check_id, client_id=client_id).first()
    if not c: raise HTTPException(404)
    c.status = body.get("status", c.status)
    c.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "✅ تم تحديث حالة الشيك"}


@router.delete("/{client_id}/checks/{check_id}")
async def delete_check(
    client_id: int, check_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    c = db.query(AccCheck).filter_by(id=check_id, client_id=client_id).first()
    if not c: raise HTTPException(404)
    db.delete(c); db.commit()
    return {"message": "✅ تم الحذف"}


@router.get("/{client_id}/checks/summary")
async def checks_summary(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    rows = db.query(AccCheck).filter_by(client_id=client_id).all()
    inc = [c for c in rows if c.check_type == "incoming"]
    out = [c for c in rows if c.check_type == "outgoing"]
    overdue = [c for c in rows if c.due_date and c.due_date < today and c.status == "pending"]
    due_soon = [c for c in rows if c.due_date and 0 <= (c.due_date - today).days <= 7 and c.status == "pending"]
    return {
        "incoming_total": sum(c.amount for c in inc),
        "outgoing_total": sum(c.amount for c in out),
        "incoming_count": len(inc),
        "outgoing_count": len(out),
        "overdue_count": len(overdue),
        "overdue_amount": sum(c.amount for c in overdue),
        "due_soon_count": len(due_soon),
        "due_soon_amount": sum(c.amount for c in due_soon),
    }


# ── Advances & Custody ────────────────────────────────────────────────────────

@router.get("/{client_id}/advances")
async def list_advances(
    client_id: int,
    advance_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AccAdvance).filter_by(client_id=client_id)
    if advance_type: q = q.filter_by(advance_type=advance_type)
    if status: q = q.filter_by(status=status)
    rows = q.order_by(AccAdvance.issue_date.desc()).all()
    return [{
        "id": a.id, "advance_type": a.advance_type,
        "employee_name": a.employee_name, "employee_id_ref": a.employee_id_ref,
        "amount": a.amount, "settled_amount": a.settled_amount,
        "remaining": round(a.amount - (a.settled_amount or 0), 2),
        "issue_date": str(a.issue_date),
        "due_date": str(a.due_date) if a.due_date else None,
        "purpose": a.purpose, "status": a.status, "notes": a.notes,
    } for a in rows]


@router.post("/{client_id}/advances")
async def create_advance(
    client_id: int, body: AdvanceCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    a = AccAdvance(
        client_id=client_id, created_by=current_user.id,
        advance_type=body.advance_type,
        employee_name=body.employee_name,
        employee_id_ref=body.employee_id_ref,
        amount=body.amount,
        issue_date=_parse_date(body.issue_date),
        due_date=_parse_date(body.due_date) if body.due_date else None,
        purpose=body.purpose, notes=body.notes,
    )
    db.add(a); db.commit(); db.refresh(a)
    return {"id": a.id, "message": "✅ تم تسجيل العهدة"}


@router.patch("/{client_id}/advances/{adv_id}/settle")
async def settle_advance(
    client_id: int, adv_id: int,
    body: dict,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    a = db.query(AccAdvance).filter_by(id=adv_id, client_id=client_id).first()
    if not a: raise HTTPException(404)
    amount = float(body.get("amount", 0))
    a.settled_amount = (a.settled_amount or 0) + amount
    if a.settled_amount >= a.amount:
        a.status = "settled"
    elif a.settled_amount > 0:
        a.status = "partially_settled"
    a.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "✅ تم تسجيل التسوية", "remaining": round(a.amount - a.settled_amount, 2)}


@router.delete("/{client_id}/advances/{adv_id}")
async def delete_advance(
    client_id: int, adv_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    a = db.query(AccAdvance).filter_by(id=adv_id, client_id=client_id).first()
    if not a: raise HTTPException(404)
    db.delete(a); db.commit()
    return {"message": "✅ تم الحذف"}


# ── AR/AP — Receivables & Payables with Aging ─────────────────────────────────

@router.get("/{client_id}/ar-ap")
async def ar_ap_summary(
    client_id: int,
    tx_type: Optional[str] = None,   # sale | purchase
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """ملخص العملاء والموردين مع أعمار الديون"""
    today = date.today()
    q = db.query(AccTransaction).filter_by(client_id=client_id)
    if tx_type:
        q = q.filter(AccTransaction.transaction_type == tx_type)
    else:
        q = q.filter(AccTransaction.transaction_type.in_(["sale", "purchase"]))

    rows = q.order_by(AccTransaction.date).all()

    partners: dict = {}
    for tx in rows:
        pname = tx.partner_name or "غير محدد"
        if pname not in partners:
            partners[pname] = {
                "partner_name": pname,
                "partner_tax_id": tx.partner_tax_id or "",
                "tx_type": tx.transaction_type,
                "total_amount": 0, "total_vat": 0, "total_net": 0,
                "count": 0,
                "buckets": {"0_30": 0, "31_60": 0, "61_90": 0, "over_90": 0},
                "transactions": [],
            }
        p = partners[pname]
        p["total_amount"]  += tx.amount or 0
        p["total_vat"]     += tx.vat_amount or 0
        p["total_net"]     += tx.net_amount or tx.total_amount or 0
        p["count"]         += 1
        days = (today - tx.date).days if tx.date else 0
        if   days <= 30: p["buckets"]["0_30"]   += tx.net_amount or 0
        elif days <= 60: p["buckets"]["31_60"]  += tx.net_amount or 0
        elif days <= 90: p["buckets"]["61_90"]  += tx.net_amount or 0
        else:            p["buckets"]["over_90"] += tx.net_amount or 0
        p["transactions"].append({
            "id": tx.id, "date": str(tx.date),
            "doc_number": tx.doc_number or "",
            "amount": tx.amount, "vat": tx.vat_amount,
            "net": tx.net_amount or tx.total_amount, "days_old": days,
        })

    result = list(partners.values())
    result.sort(key=lambda x: x["total_net"], reverse=True)
    return {
        "items": result,
        "totals": {
            "total_amount": round(sum(p["total_amount"] for p in result), 2),
            "total_net": round(sum(p["total_net"] for p in result), 2),
            "count": len(result),
        }
    }


# ── Cash Flow Statement ────────────────────────────────────────────────────────

@router.get("/{client_id}/reports/cash-flow")
async def cash_flow(
    client_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """التدفقات النقدية — مبسّط من معاملات المبيعات والمشتريات والمصروفات"""
    if not year:
        year = date.today().year
    txs = db.query(AccTransaction).filter(
        AccTransaction.client_id == client_id,
        AccTransaction.year == year,
    ).all()

    monthly: dict = {}
    for tx in txs:
        m = tx.month or 1
        if m not in monthly:
            monthly[m] = {"month": m, "inflow": 0, "outflow": 0, "net": 0}
        if tx.transaction_type in ("sale", "receipt"):
            monthly[m]["inflow"] += tx.net_amount or tx.total_amount or 0
        elif tx.transaction_type in ("purchase", "expense", "payment"):
            monthly[m]["outflow"] += tx.net_amount or tx.total_amount or 0

    for m in monthly.values():
        m["net"] = round(m["inflow"] - m["outflow"], 2)
        m["inflow"] = round(m["inflow"], 2)
        m["outflow"] = round(m["outflow"], 2)

    months_list = [monthly.get(i, {"month": i, "inflow": 0, "outflow": 0, "net": 0}) for i in range(1, 13)]
    return {
        "year": year,
        "months": months_list,
        "total_inflow":  round(sum(m["inflow"]  for m in months_list), 2),
        "total_outflow": round(sum(m["outflow"] for m in months_list), 2),
        "net_cash_flow": round(sum(m["net"]     for m in months_list), 2),
    }
