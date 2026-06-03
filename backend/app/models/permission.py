from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

MODULES = [
    "dashboard","clients","invoices","tasks","documents","tax",
    "accounting","payroll","fixed_assets","reports","leads",
    "quotations","obligations","collection","postal","statements",
    "timesheet","settlements","eta","users","settings",
    "company_documents","office_services","folders","audit_logs","client_portal"
]

class UserPermission(Base):
    __tablename__ = "user_permissions"
    __table_args__ = (UniqueConstraint("user_id","module","client_id", name="uq_user_module_client"),)

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module       = Column(String(50), nullable=False)
    can_view     = Column(Boolean, default=True)
    can_add      = Column(Boolean, default=False)
    can_edit     = Column(Boolean, default=False)
    can_delete   = Column(Boolean, default=False)
    can_export   = Column(Boolean, default=False)
    can_approve  = Column(Boolean, default=False)
    # null = all clients; set to restrict to one client
    client_id    = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    user   = relationship("User", back_populates="permissions")
    client = relationship("Client")
