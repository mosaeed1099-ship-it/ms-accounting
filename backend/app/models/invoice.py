from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, Float, Date, ForeignKey
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


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(30), unique=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    status = Column(Enum(InvoiceStatus, values_callable=lambda x: [e.value for e in x]), default=InvoiceStatus.DRAFT)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date)
    payment_date = Column(Date)

    subtotal = Column(Float, default=0)
    discount_percent = Column(Float, default=0)
    discount_amount = Column(Float, default=0)
    tax_percent = Column(Float, default=14)  # Egyptian VAT 14%
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
