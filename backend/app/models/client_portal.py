from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class ClientPortalUser(Base):
    __tablename__ = "client_portal_users"

    id            = Column(Integer, primary_key=True, index=True)
    client_id     = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True)
    username      = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password=Column(String(255), nullable=False)
    is_active     = Column(Boolean, default=True)
    # what the client can see
    can_see_files        = Column(Boolean, default=True)
    can_see_invoices     = Column(Boolean, default=True)
    can_see_obligations  = Column(Boolean, default=True)
    can_see_reports      = Column(Boolean, default=True)
    can_see_tasks        = Column(Boolean, default=False)
    last_login    = Column(DateTime(timezone=True))
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    client = relationship("Client", back_populates="portal_user")
