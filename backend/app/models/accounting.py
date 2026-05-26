"""
نماذج نظام الحسابات — Accounting Module (ERP Level)
كل client لديه نظام محاسبي مستقل كامل.
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

    id              = Column(Integer, primary_key=True, index=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    code            = Column(String(20), nullable=False)
    name            = Column(String(200), nullable=False)
    name_en         = Column(String(200))
    account_type    = Column(String(20), default="asset")
    # asset | liability | equity | revenue | expense | bank | cash | receivable | payable
    account_subtype = Column(String(40))          # current_asset | fixed_asset | current_liability ...
    parent_id       = Column(Integer, ForeignKey("acc_accounts.id"), nullable=True)
    level           = Column(Integer, default=1)  # 1=root, 2=section, 3=detail
    is_active       = Column(Boolean, default=True)
    is_group        = Column(Boolean, default=False)   # group account — no direct posting
    opening_balance = Column(Float, default=0)
    opening_type    = Column(String(10), default="debit")   # debit | credit
    currency        = Column(String(10), default="EGP")
    notes           = Column(Text)
    sort_order      = Column(Integer, default=0)
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

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
    reference    = Column(String(100))
    entry_type   = Column(String(30), default="manual")
    # manual | sale | purchase | expense | opening | transfer | depreciation | closing
    status       = Column(String(20), default="draft")
    # draft | posted | reviewed
    total_debit  = Column(Float, default=0)
    total_credit = Column(Float, default=0)
    is_balanced  = Column(Boolean, default=False)
    cost_center  = Column(String(100))
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
    account_name = Column(String(200))
    debit        = Column(Float, default=0)
    credit       = Column(Float, default=0)
    description  = Column(Text)
    partner_name = Column(String(200))   # عميل / مورد لهذا السطر
    cost_center  = Column(String(100))
    sort_order   = Column(Integer, default=0)

    entry   = relationship("AccJournalEntry", back_populates="lines")
    account = relationship("AccAccount", back_populates="lines")


# ── Transactions (Sales / Purchases / Expenses) ───────────────────────────────

class AccTransaction(Base):
    """معاملات مالية — sales, purchases, expenses"""
    __tablename__ = "acc_transactions"

    id               = Column(Integer, primary_key=True, index=True)
    client_id        = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    transaction_type = Column(String(20), nullable=False)
    # sale | purchase | expense | receipt | payment
    date             = Column(Date, nullable=False)
    month            = Column(Integer)
    year             = Column(Integer)

    partner_name       = Column(String(200))
    partner_tax_id     = Column(String(50))
    doc_number         = Column(String(30))

    amount             = Column(Float, default=0)
    vat_rate           = Column(Float, default=0.14)
    vat_amount         = Column(Float, default=0)
    withholding_rate   = Column(Float, default=0)
    withholding_amount = Column(Float, default=0)
    total_amount       = Column(Float, default=0)
    net_amount         = Column(Float, default=0)

    expense_category   = Column(String(100))
    cost_center        = Column(String(100))
    notes              = Column(Text)
    journal_entry_id   = Column(Integer, ForeignKey("acc_journal_entries.id"), nullable=True)

    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Treasury / Bank Accounts ──────────────────────────────────────────────────

class AccTreasury(Base):
    """الخزائن والحسابات البنكية — per client"""
    __tablename__ = "acc_treasuries"

    id              = Column(Integer, primary_key=True, index=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    name            = Column(String(150), nullable=False)
    treasury_type   = Column(String(20), default="cash")   # cash | bank
    bank_name       = Column(String(100))
    account_number  = Column(String(50))
    opening_balance = Column(Float, default=0)
    is_active       = Column(Boolean, default=True)
    notes           = Column(Text)
    account_id      = Column(Integer, ForeignKey("acc_accounts.id"), nullable=True)
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("AccTreasuryTx", back_populates="treasury",
                                foreign_keys="AccTreasuryTx.treasury_id")


class AccTreasuryTx(Base):
    """حركات الخزينة / البنك"""
    __tablename__ = "acc_treasury_txs"

    id            = Column(Integer, primary_key=True, index=True)
    client_id     = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    treasury_id   = Column(Integer, ForeignKey("acc_treasuries.id"), nullable=False, index=True)
    date          = Column(Date, nullable=False)
    tx_type       = Column(String(20), nullable=False)
    # deposit | withdrawal | transfer_in | transfer_out
    amount        = Column(Float, nullable=False, default=0)
    to_treasury_id = Column(Integer, ForeignKey("acc_treasuries.id"), nullable=True)
    description   = Column(Text)
    reference     = Column(String(100))
    journal_entry_id = Column(Integer, ForeignKey("acc_journal_entries.id"), nullable=True)
    created_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

    treasury = relationship("AccTreasury", back_populates="transactions",
                            foreign_keys=[treasury_id])


# ── Checks ────────────────────────────────────────────────────────────────────

class AccCheck(Base):
    """الشيكات — Checks Management"""
    __tablename__ = "acc_checks"

    id            = Column(Integer, primary_key=True, index=True)
    client_id     = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    check_type    = Column(String(10), nullable=False)   # incoming | outgoing
    check_number  = Column(String(50))
    bank_name     = Column(String(100))
    branch        = Column(String(100))
    amount        = Column(Float, nullable=False, default=0)
    issue_date    = Column(Date)
    due_date      = Column(Date)
    partner_name  = Column(String(200))   # صاحب الشيك / المستلم
    partner_phone = Column(String(30))
    status        = Column(String(20), default="pending")
    # pending | deposited | cleared | rejected | cashed | cancelled
    treasury_id   = Column(Integer, ForeignKey("acc_treasuries.id"), nullable=True)
    notes         = Column(Text)
    journal_entry_id = Column(Integer, ForeignKey("acc_journal_entries.id"), nullable=True)
    created_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Employee Advances / Custody ───────────────────────────────────────────────

class AccAdvance(Base):
    """العهد والسلف — Employee Advances & Custody"""
    __tablename__ = "acc_advances"

    id              = Column(Integer, primary_key=True, index=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    advance_type    = Column(String(20), default="advance")   # advance | custody
    employee_name   = Column(String(200), nullable=False)
    employee_id_ref = Column(String(50))
    amount          = Column(Float, nullable=False, default=0)
    settled_amount  = Column(Float, default=0)
    issue_date      = Column(Date, nullable=False)
    due_date        = Column(Date)
    purpose         = Column(Text)
    status          = Column(String(20), default="active")
    # active | partially_settled | settled | cancelled
    notes           = Column(Text)
    journal_entry_id = Column(Integer, ForeignKey("acc_journal_entries.id"), nullable=True)
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
