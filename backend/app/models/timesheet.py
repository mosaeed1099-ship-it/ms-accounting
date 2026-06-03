from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    task_id     = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    client_id   = Column(Integer, ForeignKey("clients.id"), nullable=True)
    date        = Column(Date, nullable=False)
    hours       = Column(Float, nullable=False)
    description = Column(Text)
    created_at  = Column(DateTime, default=datetime.utcnow)

    employee = relationship("User",   foreign_keys=[employee_id])
    task     = relationship("Task",   foreign_keys=[task_id])
    client   = relationship("Client", foreign_keys=[client_id])
