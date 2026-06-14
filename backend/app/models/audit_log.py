from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action      = Column(String(20), nullable=True)    # create|update|delete|view|export|approve
    module      = Column(String(50), nullable=True)
    record_id   = Column(Integer)
    record_name = Column(String(300))
    old_data    = Column(JSON)
    new_data    = Column(JSON)
    ip_address  = Column(String(50))
    notes       = Column(Text)
    # HTTP-level audit fields (populated by AuditMiddleware)
    method      = Column(String(10))
    path        = Column(String(500))
    entity_type = Column(String(50))
    entity_id   = Column(Integer)
    status_code = Column(Integer)
    user_agent  = Column(String(200))
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User")
