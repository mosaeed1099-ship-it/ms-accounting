from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TaxReturnType(str, enum.Enum):
    VAT_MONTHLY = "vat_monthly"
    VAT_QUARTERLY = "vat_quarterly"
    INCOME_ANNUAL = "income_annual"
    WITHHOLDING = "withholding"
    STAMP_TAX = "stamp_tax"
    SALARY_TAX = "salary_tax"


class TaxReturnStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    LATE = "late"


class TaxReturn(Base):
    __tablename__ = "tax_returns"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    return_type = Column(Enum(TaxReturnType), nullable=False)
    status = Column(Enum(TaxReturnStatus), default=TaxReturnStatus.PENDING)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer)
    period_quarter = Column(Integer)
    due_date = Column(Date)
    submission_date = Column(Date)
    tax_amount = Column(Float, default=0)
    penalty = Column(Float, default=0)
    reference_number = Column(String(100))
    notes = Column(Text)
    assigned_to = Column(Integer, ForeignKey("users.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client = relationship("Client", back_populates="tax_returns")
    assigned_user = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])
