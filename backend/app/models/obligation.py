"""
محرك الالتزامات الضريبية - Tax Obligations Engine
يولد الالتزامات تلقائياً حسب نوع العميل
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class ObligationType:
    VAT_MONTHLY = "vat_monthly"
    VAT_QUARTERLY = "vat_quarterly"
    INCOME_ANNUAL = "income_annual"
    PAYROLL_MONTHLY = "payroll_monthly"
    WITHHOLDING_MONTHLY = "withholding_monthly"
    STAMP_QUARTERLY = "stamp_quarterly"
    FORM_41 = "form_41"          # نموذج 41 سنوي
    INSURANCE_MONTHLY = "insurance_monthly"


class ObligationStatus:
    UPCOMING = "upcoming"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    PAID = "paid"
    LATE = "late"
    EXEMPTED = "exempted"


class TaxObligation(Base):
    """الالتزام الضريبي المتكرر"""
    __tablename__ = "tax_obligations"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    obligation_type = Column(String, nullable=False)
    frequency = Column(String, default="monthly")   # monthly, quarterly, annual
    due_day = Column(Integer, default=15)            # يوم الاستحقاق من الشهر

    is_active = Column(Boolean, default=True)
    auto_generated = Column(Boolean, default=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)

    notes = Column(Text)
    start_date = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client", backref="obligations")
    assigned_user = relationship("User", foreign_keys=[assigned_to], backref="obligations")
    instances = relationship("ObligationInstance", back_populates="obligation", cascade="all, delete-orphan")


class ObligationInstance(Base):
    """نسخة محددة من الالتزام الضريبي (شهر/ربع/سنة)"""
    __tablename__ = "obligation_instances"

    id = Column(Integer, primary_key=True, index=True)
    obligation_id = Column(Integer, ForeignKey("tax_obligations.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    period_label = Column(String)        # "يناير 2026", "Q1 2026"
    period_year = Column(Integer)
    period_month = Column(Integer, nullable=True)
    period_quarter = Column(Integer, nullable=True)

    due_date = Column(DateTime, nullable=False)
    status = Column(String, default=ObligationStatus.UPCOMING)

    tax_amount = Column(Float, nullable=True)
    penalty = Column(Float, default=0)
    notes = Column(Text)

    submitted_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    obligation = relationship("TaxObligation", back_populates="instances")
    client = relationship("Client", backref="obligation_instances")
    assigned_user = relationship("User", foreign_keys=[assigned_to])


class Notification(Base):
    """الإشعارات الداخلية"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    title = Column(String, nullable=False)
    message = Column(Text)
    type = Column(String, default="info")   # info, warning, error, success, deadline
    link = Column(String)                   # رابط للصفحة ذات الصلة
    entity_type = Column(String)            # lead, client, obligation, task
    entity_id = Column(Integer)

    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="notifications")
