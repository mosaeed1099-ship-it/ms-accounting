from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base


class WALog(Base):
    __tablename__ = "wa_logs"

    id         = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    phone      = Column(String(30))
    recipient  = Column(String(100))  # employee name
    message    = Column(Text)
    success    = Column(Boolean, default=False)
    error      = Column(Text, nullable=True)
    task_id    = Column(Integer, nullable=True)
    sent_by    = Column(String(100), nullable=True)
