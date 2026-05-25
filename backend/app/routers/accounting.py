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
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.accounting import AccAccount, AccJournalEntry, AccJournalLine, AccTransaction, AccTreasury

router = APIRouter(prefix="/api/accounting", tags=["accounting"])

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

def _je_number(client_id: int, db: Session) -> str:
    count = db.query(func.count(AccJournalEntry.id)).filter(AccJournalEntry.client_id == client_id).scalar() or 0
    return f"JE-{datetime.now().year}-{str(count + 1).zfill(4)}"


def _account_balances(client_id: int, db: Session,
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
            AccJournalEntry.client_id == client_id,
            AccJournalEntry.status == "posted",
        )
    )
    if year:
        query = query.filter(AccJournalEntry.year == year)
    if month:
        query = query.filter(AccJournalEntry.month == month)
    query = query.group_by(AccJournalLine.account_id, AccJournalLine.account_code, AccJournalLine.account_name)
    rows = query.all()

    result = {}
    for r in rows:
        d = float(r.total_debit or 0)
        c = float(r.total_credit or 0)
        result[r.account_id] = {
            "account_id": r.account_id,
            "account_code": r.account_code or "",
            "account_name": r.account_name or "",
            "debit": d,
            "credit": c,
            "balance": d - c,
        }
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
            {"account_id": ar_id,  "account_code": ar_code,  "account_name": ar_name,  "debit": tx.net_amount, "credit": 0, "description": f"عملاء — {tx.partner_name or ''}"},
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
            {"account_id": ap_id,  "account_code": ap_code,  "account_name": ap_name,  "debit": 0, "credit": tx.net_amount, "description": "موردون"},
            {"account_id": wht_id, "account_code": wht_code, "account_name": wht_name, "debit": 0, "credit": tx.withholding_amount, "description": "ضريبة خصم وإضافة"},
        ]
    elif tx.transaction_type == "expense":
        exp_id, exp_code, exp_name = get_acc("5200", "المصروفات العمومية والإدارية")
        cash_id, cash_code, cash_name = get_acc("1210", "النقدية والخزينة")
        lines = [
            {"account_id": exp_id,  "account_code": exp_code,  "account_name": exp_name,  "debit": tx.amount, "credit": 0, "description": tx.expense_category or "مصروفات"},
            {"account_id": cash_id, "account_code": cash_code, "account_name": cash_name, "debit": 0, "credit": tx.amount, "description": "خزينة"},
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
    db.commit()
    return {"message": "تم ترحيل القيد ✅"}


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
        raise HTTPException(400, detail="لا يمكن حذف قيد مرحَّل — يمكنك إنشاء قيد عكسي فقط")
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
    totals = {
        "amount": db.query(func.sum(AccTransaction.amount)).filter(AccTransaction.client_id == client_id).scalar() or 0,
        "vat": db.query(func.sum(AccTransaction.vat_amount)).filter(AccTransaction.client_id == client_id).scalar() or 0,
        "total": db.query(func.sum(AccTransaction.total_amount)).filter(AccTransaction.client_id == client_id).scalar() or 0,
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
    for k, v in data.dict().items():
        setattr(tx, k, v)
    tx.month = data.date.month
    tx.year = data.date.year
    db.commit()
    return {"message": "تم التحديث"}


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
    for a in accounts:
        b = balances.get(a.id, {"debit": 0, "credit": 0})
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
        acc = db.query(AccAccount).filter(AccAccount.id == aid).first()
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

    # Also get from transactions for more detail
    tx_sales = db.query(func.sum(AccTransaction.amount)).filter(
        AccTransaction.client_id == client_id,
        AccTransaction.transaction_type == "sale",
        *([AccTransaction.year == year] if year else [])
    ).scalar() or 0

    tx_purchases = db.query(func.sum(AccTransaction.amount)).filter(
        AccTransaction.client_id == client_id,
        AccTransaction.transaction_type == "purchase",
        *([AccTransaction.year == year] if year else [])
    ).scalar() or 0

    tx_expenses = db.query(func.sum(AccTransaction.amount)).filter(
        AccTransaction.client_id == client_id,
        AccTransaction.transaction_type == "expense",
        *([AccTransaction.year == year] if year else [])
    ).scalar() or 0

    # Use tx data if journal entries are empty
    if revenue == 0 and tx_sales > 0:
        revenue  = tx_sales
        cogs     = tx_purchases + tx_expenses
        gross    = revenue - tx_purchases
        net      = gross - tx_expenses

    return {
        "year": year,
        "revenue": round(revenue, 2),
        "tx_sales": round(tx_sales, 2),
        "tx_purchases": round(tx_purchases, 2),
        "tx_expenses": round(tx_expenses, 2),
        "cogs": round(tx_purchases, 2),
        "gross_profit": round(revenue - tx_purchases, 2),
        "total_expenses": round(tx_expenses, 2),
        "net_profit": round(revenue - tx_purchases - tx_expenses, 2),
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

    groups = {"asset": [], "liability": [], "equity": [], "revenue": [], "expense": []}
    for aid, b in balances.items():
        acc = acc_map.get(aid)
        if not acc:
            continue
        net = b["debit"] - b["credit"]
        groups[acc.account_type].append({
            "code": acc.code, "name": acc.name,
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
    qbase = db.query(AccTransaction).filter(AccTransaction.client_id == client_id)
    if year: qbase = qbase.filter(AccTransaction.year == year)

    sales     = qbase.filter(AccTransaction.transaction_type == "sale").with_entities(func.sum(AccTransaction.amount)).scalar() or 0
    purchases = qbase.filter(AccTransaction.transaction_type == "purchase").with_entities(func.sum(AccTransaction.amount)).scalar() or 0
    expenses  = qbase.filter(AccTransaction.transaction_type == "expense").with_entities(func.sum(AccTransaction.amount)).scalar() or 0
    sales_vat = qbase.filter(AccTransaction.transaction_type == "sale").with_entities(func.sum(AccTransaction.vat_amount)).scalar() or 0
    purch_vat = qbase.filter(AccTransaction.transaction_type == "purchase").with_entities(func.sum(AccTransaction.vat_amount)).scalar() or 0
    tx_count  = qbase.count()
    je_count  = db.query(func.count(AccJournalEntry.id)).filter(AccJournalEntry.client_id == client_id).scalar() or 0
    acc_count = db.query(func.count(AccAccount.id)).filter(AccAccount.client_id == client_id).scalar() or 0

    return {
        "sales": round(sales, 2),
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
