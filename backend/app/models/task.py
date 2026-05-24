from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, Date, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    DONE = "done"
    CANCELLED = "cancelled"


class TaskPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskCategory(str, enum.Enum):
    TAX = "tax"
    ACCOUNTING = "accounting"
    AUDIT = "audit"
    PAYROLL = "payroll"
    LEGAL = "legal"
    CONSULTATION = "consultation"
    OTHER = "other"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text)
    client_id = Column(Integer, ForeignKey("clients.id"))
    status = Column(Enum(TaskStatus, values_callable=lambda x: [e.value for e in x]), default=TaskStatus.TODO)
    priority = Column(Enum(TaskPriority), default=TaskPriority.MEDIUM)
    category = Column(Enum(TaskCategory), default=TaskCategory.OTHER)
    due_date = Column(Date)
    completed_at = Column(DateTime(timezone=True))
    estimated_hours = Column(Integer)
    actual_hours = Column(Integer)
    tags = Column(String(500))
    assigned_to = Column(Integer, ForeignKey("users.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client = relationship("Client", back_populates="tasks")
    assigned_to_user = relationship("User", back_populates="tasks_assigned", foreign_keys=[assigned_to])
    created_by_user = relationship("User", back_populates="tasks_created", foreign_keys=[created_by])
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("Task", back_populates="comments")
    user = relationship("User")
