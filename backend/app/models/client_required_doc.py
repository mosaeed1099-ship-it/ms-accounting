"""
المستندات المطلوبة من العميل — يديرها الموظف من النظام الداخلي
العميل يشوفها فقط في البوابة
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ClientRequiredDoc(Base):
    __tablename__ = "client_required_docs"

    id          = Column(Integer, primary_key=True, index=True)
    client_id   = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_name    = Column(String(300), nullable=False)   # اسم المستند المطلوب
    notes       = Column(Text)                          # ملاحظة للعميل
    is_received = Column(Boolean, default=False)        # هل تم الاستلام؟
    received_at = Column(DateTime(timezone=True))       # تاريخ الاستلام
    created_by  = Column(Integer, ForeignKey("users.id"))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    client      = relationship("Client")
    creator     = relationship("User", foreign_keys=[created_by])
