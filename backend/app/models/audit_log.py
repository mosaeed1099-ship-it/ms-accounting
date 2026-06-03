from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action      = Column(String(20), nullable=False)   # create|update|delete|view|export|approve
    module      = Column(String(50), nullable=False)
    record_id   = Column(Integer)
    record_name = Column(String(300))
    old_data    = Column(JSON)
    new_data    = Column(JSON)
    ip_address  = Column(String(50))
    notes       = Column(Text)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
