from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    ACCOUNTANT = "accountant"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone = Column(String(20))
    whatsapp_phone = Column(String(20))       # رقم واتساب (للإشعارات التلقائية)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.ACCOUNTANT)
    is_active = Column(Boolean, default=True)
    avatar = Column(String(255))
    notes = Column(Text)
    specialization = Column(Text)     # JSON list of specialization areas
    last_login = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tasks_assigned = relationship("Task", back_populates="assigned_to_user", foreign_keys="Task.assigned_to")
    tasks_created = relationship("Task", back_populates="created_by_user", foreign_keys="Task.created_by")
    activities = relationship("ActivityLog", back_populates="user")
    permissions = relationship("UserPermission", back_populates="user", cascade="all, delete-orphan")
