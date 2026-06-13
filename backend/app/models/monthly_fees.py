from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class MFClientStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class MonthlyFeeClient(Base):
    __tablename__ = "mf_clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    monthly_fee = Column(Float, default=0)
    status = Column(Enum(MFClientStatus), default=MFClientStatus.ACTIVE)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    records = relationship("MonthlyFeeRecord", back_populates="client", cascade="all, delete-orphan")


class MonthlyFeeRecord(Base):
    """سجل الأتعاب الشهرية لكل عميل — واحد لكل شهر"""
    __tablename__ = "mf_records"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("mf_clients.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1-12

    fee_amount = Column(Float, default=0)       # الأتعاب المقررة لهذا الشهر
    balance_carried = Column(Float, default=0)  # رصيد مرحّل من الشهر السابق
    total_due = Column(Float, default=0)        # إجمالي المطلوب = fee + carried
    paid_amount = Column(Float, default=0)      # المبلغ المدفوع
    remaining = Column(Float, default=0)        # المتبقي

    paid = Column(Boolean, default=False)       # هل سدّد كامل المستحق؟
    paid_date = Column(Date)                    # تاريخ آخر دفعة
    bayan = Column(String(200))                 # البيان (تم دفع / ...)
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client = relationship("MonthlyFeeClient", back_populates="records")
