"""
نموذج عروض الأسعار
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(String, unique=True, index=True)  # QUO-2026-0001

    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)

    status = Column(String, default="draft")  # draft, sent, accepted, rejected, expired

    # بنود العرض (JSON stored as text)
    items_json = Column(Text)   # [{"description": "", "price": 0, "notes": ""}]

    subtotal = Column(Float, default=0)
    discount = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    total = Column(Float, default=0)

    notes = Column(Text)
    terms = Column(Text)
    valid_until = Column(DateTime)

    sent_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejected_reason = Column(Text)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lead = relationship("Lead", back_populates="quotations")
    created_by_user = relationship("User", foreign_keys=[created_by], backref="quotations")
