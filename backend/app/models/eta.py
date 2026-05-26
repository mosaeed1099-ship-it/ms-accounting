"""
نماذج منظومة الفاتورة الإلكترونية المصرية — ETA Integration
Egyptian Tax Authority E-Invoicing System
"""
import json
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Date, ForeignKey, Boolean
from datetime import datetime
from app.database import Base


class ETACredential(Base):
    """بيانات ربط شركة بمنظومة الفاتورة الإلكترونية"""
    __tablename__ = "eta_credentials"

    id                  = Column(Integer, primary_key=True, index=True)
    client_id           = Column(Integer, ForeignKey("clients.id"), nullable=False, unique=True, index=True)
    eta_client_id       = Column(String(300), nullable=False)          # Client ID من بوابة ETA
    eta_client_secret   = Column(Text, nullable=False)                  # Client Secret (مشفر)
    company_tin         = Column(String(50))                            # Tax ID من ETA
    company_name_eta    = Column(String(300))                           # الاسم كما يظهر في ETA
    is_active           = Column(Boolean, default=True)
    last_sync_at        = Column(DateTime)
    last_sync_status    = Column(String(50), default="never")           # never / success / failed
    last_sync_message   = Column(Text)
    total_docs_synced   = Column(Integer, default=0)
    created_by          = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ETADocument(Base):
    """فاتورة إلكترونية مسحوبة من منظومة ETA"""
    __tablename__ = "eta_documents"

    id                    = Column(Integer, primary_key=True, index=True)
    client_id             = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)

    # ETA identifiers
    eta_uuid              = Column(String(100), unique=True, index=True)  # UUID من ETA
    eta_long_id           = Column(String(500))                            # Long ID
    eta_hash_key          = Column(String(500))
    internal_id           = Column(String(100))                            # رقم الفاتورة الداخلي

    # Document classification
    doc_type              = Column(String(5))                             # I=Invoice / C=Credit / D=Debit
    doc_type_name         = Column(String(50))                            # Invoice / Credit Note / Debit Note
    doc_type_version      = Column(String(10))                            # 1.0 / 2.0
    direction             = Column(String(10), index=True)                # outgoing / incoming

    # Parties
    issuer_tin            = Column(String(50), index=True)
    issuer_name           = Column(String(300))
    issuer_type           = Column(String(20))                            # B = Business / P = Person
    receiver_tin          = Column(String(50), index=True)
    receiver_name         = Column(String(300))
    receiver_type         = Column(String(20))

    # Date & period
    doc_date              = Column(Date, index=True)
    issue_date_time       = Column(DateTime)
    period_month          = Column(Integer, index=True)
    period_year           = Column(Integer, index=True)

    # Amounts
    total_sales_amount    = Column(Float, default=0)                      # إجمالي قبل الضريبة
    total_discount_amount = Column(Float, default=0)                      # إجمالي الخصومات
    net_amount            = Column(Float, default=0)                      # صافي القيمة
    total_tax_amount      = Column(Float, default=0)                      # إجمالي الضريبة
    total_amount          = Column(Float, default=0)                      # الإجمالي شامل الضريبة
    extra_discount_amount = Column(Float, default=0)                      # خصم إضافي
    total_items_discount  = Column(Float, default=0)

    # Tax breakdown (from ETA taxTotals)
    vat_amount            = Column(Float, default=0)                      # ض ق م 14%
    table_discount_amount = Column(Float, default=0)
    withholding_amount    = Column(Float, default=0)

    # Status
    status                = Column(String(30), default="Valid", index=True)  # Valid/Invalid/Rejected/Cancelled
    status_reason         = Column(Text)

    # Cancellation / Return
    is_cancelled          = Column(Boolean, default=False)
    is_returned           = Column(Boolean, default=False)
    cancelled_by          = Column(String(100))
    cancellation_date     = Column(DateTime)

    # Linked accounting
    journal_entry_id      = Column(Integer, ForeignKey("acc_journal_entries.id"), nullable=True)
    acc_tx_id             = Column(Integer, ForeignKey("acc_transactions.id"), nullable=True)

    # Sync metadata
    raw_data              = Column(Text)                                  # JSON dump
    synced_at             = Column(DateTime, default=datetime.utcnow)
    created_at            = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "eta_uuid": self.eta_uuid,
            "internal_id": self.internal_id,
            "doc_type": self.doc_type,
            "doc_type_name": self.doc_type_name,
            "direction": self.direction,
            "issuer_name": self.issuer_name,
            "issuer_tin": self.issuer_tin,
            "receiver_name": self.receiver_name,
            "receiver_tin": self.receiver_tin,
            "doc_date": str(self.doc_date) if self.doc_date else None,
            "period_month": self.period_month,
            "period_year": self.period_year,
            "net_amount": self.net_amount,
            "vat_amount": self.vat_amount,
            "total_amount": self.total_amount,
            "status": self.status,
            "is_cancelled": self.is_cancelled,
            "is_returned": self.is_returned,
            "journal_entry_id": self.journal_entry_id,
            "acc_tx_id": self.acc_tx_id,
            "synced_at": str(self.synced_at) if self.synced_at else None,
        }
