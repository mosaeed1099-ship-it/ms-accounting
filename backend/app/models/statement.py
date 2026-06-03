from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class FinancialStatement(Base):
    __tablename__ = "financial_statements"

    id             = Column(Integer, primary_key=True, index=True)
    client_id      = Column(Integer, ForeignKey("clients.id"))
    year           = Column(Integer, nullable=False)
    period         = Column(String(50), default="annual")   # annual/semi/quarterly
    statement_type = Column(String(50), default="balance")  # balance / tax / other

    # ── مراحل الإنجاز ──────────────────────────────────────
    is_printed  = Column(Boolean, default=False)
    printed_at  = Column(DateTime)
    is_sent     = Column(Boolean, default=False)   # ذهبت للشركة
    sent_at     = Column(DateTime)
    is_signed   = Column(Boolean, default=False)   # رجعت موقعة
    signed_at   = Column(DateTime)
    is_archived = Column(Boolean, default=False)   # نزلت الأرشيف
    archived_at = Column(DateTime)

    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes       = Column(Text)
    created_at  = Column(DateTime, default=datetime.utcnow)
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)

    client   = relationship("Client", foreign_keys=[client_id])
    assignee = relationship("User",   foreign_keys=[assigned_to])
    creator  = relationship("User",   foreign_keys=[created_by])
