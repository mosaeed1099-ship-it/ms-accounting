"""
نظام التحصيلات — Collections System
يدير تحصيلات التأسيس والأتعاب الشهرية المتكررة
"""
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, Boolean, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class CollectionType(str, enum.Enum):
    ESTABLISHMENT = "establishment"   # تأسيس
    MONTHLY_FEE = "monthly_fee"       # أتعاب شهرية


class PaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    CHECK = "check"
    INSTAPAY = "instapay"
    VODAFONE_CASH = "vodafone_cash"


class CollectionContract(Base):
    """عقد التحصيل — الاتفاق الرئيسي مع العميل"""
    __tablename__ = "collection_contracts"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    collection_type = Column(Enum(CollectionType), nullable=False)

    # بيانات الاتفاق
    title = Column(String(300), nullable=False)           # وصف الاتفاق
    agreed_amount = Column(Float, nullable=False)         # إجمالي المبلغ المتفق عليه
    service_description = Column(Text)                    # وصف الخدمة

    # للأتعاب الشهرية
    monthly_amount = Column(Float, default=0)             # قيمة الشهر الواحد
    is_recurring = Column(Boolean, default=False)         # هل متكرر؟
    recurring_day = Column(Integer, default=1)            # يوم الاستحقاق في الشهر

    # الإجماليات المحسوبة
    total_paid = Column(Float, default=0)
    total_remaining = Column(Float, default=0)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.UNPAID)

    # مسؤول التحصيل
    assigned_to = Column(Integer, ForeignKey("users.id"))

    # تواريخ
    start_date = Column(Date)
    end_date = Column(Date)
    is_active = Column(Boolean, default=True)

    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    client = relationship("Client", back_populates="collections")
    payments = relationship("CollectionPayment", back_populates="contract",
                            cascade="all, delete-orphan", order_by="CollectionPayment.payment_date")
    assigned_user = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])


class CollectionPayment(Base):
    """دفعة تحصيل"""
    __tablename__ = "collection_payments"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("collection_contracts.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    amount = Column(Float, nullable=False)
    payment_date = Column(Date, nullable=False)
    payment_method = Column(Enum(PaymentMethod), default=PaymentMethod.CASH)
    reference = Column(String(100))     # رقم مرجعي / رقم شيك
    notes = Column(Text)

    # للأتعاب الشهرية — تحديد الشهر
    period_month = Column(Integer)      # الشهر (1-12)
    period_year = Column(Integer)       # السنة

    collected_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("CollectionContract", back_populates="payments")
    collector = relationship("User", foreign_keys=[collected_by])


class MonthlyDue(Base):
    """استحقاق شهري — يُنشأ تلقائياً بداية كل شهر"""
    __tablename__ = "monthly_dues"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("collection_contracts.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    period_month = Column(Integer, nullable=False)
    period_year = Column(Integer, nullable=False)
    period_label = Column(String(50))       # "يناير 2026"

    amount_due = Column(Float, nullable=False)
    amount_paid = Column(Float, default=0)
    amount_remaining = Column(Float, default=0)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.UNPAID)

    due_date = Column(Date)
    paid_date = Column(Date)
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    contract = relationship("CollectionContract")
    client = relationship("Client")
