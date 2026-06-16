"""
Company Name Generator — rejected names database
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from datetime import datetime
from app.database import Base


class RejectedCompanyName(Base):
    """أسماء شركات تم رفضها في مصر الرقمية"""
    __tablename__ = "rejected_company_names"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(300), nullable=False, index=True)
    name_lower    = Column(String(300), nullable=False, index=True)  # for fast lookup
    activity      = Column(String(200))
    rejection_reason = Column(Text)
    rejected_date = Column(DateTime, default=datetime.utcnow)
    created_by    = Column(Integer, nullable=True)
    notes         = Column(Text)
    created_at    = Column(DateTime, default=datetime.utcnow)
