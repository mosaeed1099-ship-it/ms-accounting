"""
نماذج نظام الحسابات — Accounting Module
كل client لديه نظام محاسبي مستقل كامل:
  - دليل الحسابات (Chart of Accounts)
  - القيود اليومية (Journal Entries)
  - معاملات المبيعات / المشتريات / المصروفات
"""
import enum
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Date, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


# ── Chart of Accounts ─────────────────────────────────────────────────────────

class AccAccount(Base):
    """دليل الحسابات — Chart of Accounts (per client)"""
    __tablename__ = "acc_accounts"

    id             = Column(Integer, primary_key=True, index=True)
    client_id      = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    code           = Column(String(20), nullable=False)   # 1210 / 4110 ...
    name           = Column(String(200), nullable=False)
    account_type   = Column(String(20), default="asset")
    # asset | liability | equity | revenue | expense
    parent_id      = Column(Integer, ForeignKey("acc_accounts.id"), nullable=True)
    is_active      = Column(Boolean, default=True)
    opening_balance = Column(Float, default=0)
    opening_type   = Column(String(10), default="debit")  # debit | credit
    notes          = Column(Text)
    sort_order     = Column(Integer, default=0)
    created_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    lines    = relationship("AccJournalLine", back_populates="account")
    children = relationship("AccAccount", back_populates="parent")
    parent   = relationship("AccAccount", back_populates="children", remote_side=[id])


# ── Journal Entries ────────────────────────────────────────────────────────────

class AccJournalEntry(Base):
    """القيد اليومي — Journal Entry header"""
    __tablename__ = "acc_journal_entries"

    id           = Column(Integer, primary_key=True, index=True)
    client_id    = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    entry_number = Column(String(30), index=True)   # JE-2025-0001
    date         = Column(Date, nullable=False)
    month        = Column(Integer)
    year         = Column(Integer)
    description  = Column(Text)
    reference    = Column(String(100))   # invoice / doc number
    entry_type   = Column(String(30), default="manual")
    # manual | sale | purchase | expense | opening | transfer
    status       = Column(String(20), default="draft")
    # draft | posted | reviewed
    total_debit  = Column(Float, default=0)
    total_credit = Column(Float, default=0)
    is_balanced  = Column(Boolean, default=False)
    notes        = Column(Text)
    created_by   = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lines = relationship("AccJournalLine", back_populates="entry",
                         cascade="all, delete-orphan", order_by="AccJournalLine.sort_order")


class AccJournalLine(Base):
    """سطر القيد — Journal Entry Line (debit/credit)"""
    __tablename__ = "acc_journal_lines"

    id           = Column(Integer, primary_key=True, index=True)
    entry_id     = Column(Integer, ForeignKey("acc_journal_entries.id"), nullable=False)
    account_id   = Column(Integer, ForeignKey("acc_accounts.id"), nullable=True)
    account_code = Column(String(20))
    account_name = Column(String(200))   # cached — survives account renames
    debit        = Column(Float, default=0)
    credit       = Column(Float, default=0)
    description  = Column(Text)
    sort_order   = Column(Integer, default=0)

    entry   = relationship("AccJournalEntry", back_populates="lines")
    account = relationship("AccAccount", back_populates="lines")


# ── Transactions (Sales / Purchases / Expenses) ───────────────────────────────

class AccTransaction(Base):
    """
    معاملات مالية — sales, purchases, expenses
    يولد قيدًا يوميًا تلقائيًا عند الحفظ.
    مبني على هيكل ملف الإكسل الفعلي.
    """
    __tablename__ = "acc_transactions"

    id               = Column(Integer, primary_key=True, index=True)
    client_id        = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    transaction_type = Column(String(20), nullable=False)
    # sale | purchase | expense | receipt | payment
    date             = Column(Date, nullable=False)
    month            = Column(Integer)
    year             = Column(Integer)

    # الطرف الآخر (عميل / مورد / جهة المصروف)
    partner_name     = Column(String(200))
    partner_tax_id   = Column(String(50))   # رقم التسجيل الضريبي

    doc_number       = Column(String(30))   # رقم المستند / الفاتورة

    # القيم المالية (نفس هيكل الإكسل)
    amount           = Column(Float, default=0)   # القيمة قبل الضريبة
    vat_rate         = Column(Float, default=0.14)
    vat_amount       = Column(Float, default=0)   # ض ق م
    withholding_rate = Column(Float, default=0)
    withholding_amount = Column(Float, default=0)  # خصم وإضافة
    total_amount     = Column(Float, default=0)   # الإجمالي (amount + vat)
    net_amount       = Column(Float, default=0)   # الإجمالي بعد الخصم

    # تصنيف المصروف (للمصروفات فقط)
    expense_category = Column(String(100))

    notes            = Column(Text)
    # رابط بالقيد المولَّد تلقائيًا
    journal_entry_id = Column(Integer, ForeignKey("acc_journal_entries.id"), nullable=True)

    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Treasury / Bank Accounts ──────────────────────────────────────────────────

class AccTreasury(Base):
    """الخزائن والحسابات البنكية — per client"""
    __tablename__ = "acc_treasuries"

    id          = Column(Integer, primary_key=True, index=True)
    client_id   = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    name        = Column(String(150), nullable=False)   # الخزينة الرئيسية / CIB ...
    treasury_type = Column(String(20), default="cash")  # cash | bank
    bank_name   = Column(String(100))
    account_number = Column(String(50))
    opening_balance = Column(Float, default=0)
    current_balance = Column(Float, default=0)   # computed
    is_active   = Column(Boolean, default=True)
    notes       = Column(Text)
    account_id  = Column(Integer, ForeignKey("acc_accounts.id"), nullable=True)
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
