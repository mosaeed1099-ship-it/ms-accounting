from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class InternalMail(Base):
    __tablename__ = "internal_mails"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(300), nullable=False)
    document_type = Column(String(100))          # نوع الورقة
    client_id   = Column(Integer, ForeignKey("clients.id"), nullable=True)
    from_person = Column(String(200))            # من أحضر الأوراق
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    status      = Column(String(20), default="open")  # open / within / closed
    received_date = Column(Date)
    within_date = Column(DateTime)               # تاريخ تسليم للموظف
    closed_date = Column(DateTime)
    notes       = Column(Text)
    created_at  = Column(DateTime, default=datetime.utcnow)
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)

    client   = relationship("Client",  foreign_keys=[client_id])
    assignee = relationship("User",    foreign_keys=[assigned_to])
    creator  = relationship("User",    foreign_keys=[created_by])
