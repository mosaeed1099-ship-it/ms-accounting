"""
أتعاب الحسابات — Accounting Fees (formerly Invoices)
يدير أتعاب المحاسبة الشهرية المتكررة والفواتير
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, Float, Date, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    CHECK = "check"
    INSTAPAY = "instapay"
    VODAFONE_CASH = "vodafone_cash"


class ServiceType(str, enum.Enum):
    ACCOUNTING = "accounting"          # محاسبة عامة
    TAX_RETURNS = "tax_returns"        # إقرارات ضريبية
    PAYROLL = "payroll"                # مرتبات
    VAT = "vat"                        # قيمة مضافة
    AUDIT = "audit"                    # مراجعة حسابات
    CONSULTATION = "consultation"      # استشارات
    ESTABLISHMENT = "establishment"    # تأسيس
    OTHER = "other"                    # أخرى


# الالتزامات الضريبية في مصر
EGYPTIAN_TAX_OBLIGATIONS = [
    {"key": "vat_monthly", "label": "ضريبة القيمة المضافة (شهري)", "frequency": "monthly", "due_day": 15},
    {"key": "payroll_monthly", "label": "ضريبة المرتبات (شهري)", "frequency": "monthly", "due_day": 15},
    {"key": "income_quarterly", "label": "ضريبة الدخل (ربع سنوي)", "frequency": "quarterly", "due_day": 30},
    {"key": "income_annual", "label": "إقرار ضريبة الدخل (سنوي)", "frequency": "annual", "due_day": 31},
    {"key": "withholding_monthly", "label": "الخصم والإضافة (شهري)", "frequency": "monthly", "due_day": 15},
    {"key": "stamp_quarterly", "label": "ضريبة الدمغة (ربع سنوي)", "frequency": "quarterly", "due_day": 30},
    {"key": "work_profit", "label": "ضريبة كسب العمل", "frequency": "monthly", "due_day": 15},
    {"key": "social_insurance", "label": "التأمينات الاجتماعية", "frequency": "monthly", "due_day": 15},
    {"key": "tax_facilities", "label": "التسهيلات الضريبية", "frequency": "annual", "due_day": 31},
    {"key": "quarterly_declaration", "label": "الإقرار الربع سنوي", "frequency": "quarterly", "due_day": 30},
    {"key": "annual_declaration", "label": "الإقرار السنوي", "frequency": "annual", "due_day": 31},
    {"key": "form_41", "label": "نموذج 41 (سنوي)", "frequency": "annual", "due_day": 31},
]


class Invoice(Base):
    """أتعاب الحسابات — Accounting Fees Record"""
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(30), unique=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    # نوع الخدمة
    service_type = Column(Enum(ServiceType, values_callable=lambda x: [e.value for e in x]),
                          default=ServiceType.ACCOUNTING)

    # للأتعاب الشهرية المتكررة
    is_monthly_fee = Column(Boolean, default=True)
    period_month = Column(Integer)    # الشهر (1-12)
    period_year = Column(Integer)     # السنة
    period_label = Column(String(50)) # "يناير 2026"

    # الالتزامات المشمولة في هذا الأتعاب (JSON)
    included_obligations = Column(JSON, default=list)

    status = Column(Enum(InvoiceStatus, values_callable=lambda x: [e.value for e in x]),
                    default=InvoiceStatus.DRAFT)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date)
    payment_date = Column(Date)

    subtotal = Column(Float, default=0)
    discount_percent = Column(Float, default=0)
    discount_amount = Column(Float, default=0)
    tax_percent = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    stamp_tax = Column(Float, default=0)
    withholding_tax = Column(Float, default=0)
    total = Column(Float, default=0)
    paid_amount = Column(Float, default=0)
    remaining = Column(Float, default=0)

    description = Column(Text)
    notes = Column(Text)
    payment_method = Column(Enum(PaymentMethod, values_callable=lambda x: [e.value for e in x]))
    bank_reference = Column(String(100))

    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client = relationship("Client", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")
    creator = relationship("User", foreign_keys=[created_by])


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    description = Column(String(500), nullable=False)
    quantity = Column(Float, default=1)
    unit_price = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    tax_percent = Column(Float, default=0)
    sort_order = Column(Integer, default=0)

    invoice = relationship("Invoice", back_populates="items")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    amount = Column(Float, nullable=False)
    payment_date = Column(Date, nullable=False)
    payment_method = Column(Enum(PaymentMethod, values_callable=lambda x: [e.value for e in x]))
    reference = Column(String(100))
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    invoice = relationship("Invoice", back_populates="payments")
    creator = relationship("User", foreign_keys=[created_by])
