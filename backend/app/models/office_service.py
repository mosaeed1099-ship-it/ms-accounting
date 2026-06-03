from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

SERVICE_TYPES = {
    "audit":        "المراجعة",
    "accounting":   "الحسابات",
    "tax":          "الضرائب",
    "legal":        "الاستشارات القانونية",
    "tax_systems":  "منظومات الضرائب",
    "establishment":"تأسيس الشركات",
    "other":        "أخرى",
}

class OfficeService(Base):
    __tablename__ = "office_services"

    id           = Column(Integer, primary_key=True, index=True)
    client_id    = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    service_type = Column(String(50), nullable=False)
    name         = Column(String(200))
    description  = Column(Text)
    status       = Column(String(20), default="active")  # active|paused|completed
    fee          = Column(Float, default=0)
    fee_period   = Column(String(20), default="monthly") # monthly|quarterly|annual|once
    start_date   = Column(DateTime(timezone=True))
    end_date     = Column(DateTime(timezone=True))
    assigned_users= Column(String(500))  # comma-separated user IDs
    notes        = Column(Text)
    created_by   = Column(Integer, ForeignKey("users.id"))
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

    client  = relationship("Client", back_populates="office_services")
    creator = relationship("User")
    tasks   = relationship("OfficeServiceTask", back_populates="service", cascade="all, delete-orphan")


class OfficeServiceTask(Base):
    __tablename__ = "office_service_tasks"

    id           = Column(Integer, primary_key=True, index=True)
    service_id   = Column(Integer, ForeignKey("office_services.id", ondelete="CASCADE"))
    title        = Column(String(300), nullable=False)
    description  = Column(Text)
    status       = Column(String(20), default="pending")  # pending|in_progress|done
    due_date     = Column(DateTime(timezone=True))
    assigned_to  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    service      = relationship("OfficeService", back_populates="tasks")
    assigned_user= relationship("User")
