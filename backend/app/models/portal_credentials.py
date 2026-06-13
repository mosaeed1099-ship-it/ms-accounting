from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PortalCredential(Base):
    """بيانات البوابات الضريبية لكل عميل — أدمن فقط، لا تظهر في تقارير عامة"""
    __tablename__ = "portal_credentials"

    id         = Column(Integer, primary_key=True, index=True)
    client_id  = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # بيانات الممثل / العميل الشخصي
    contact_person   = Column(String(200))   # اسم العميل المسؤول
    national_id      = Column(String(30))    # الرقم القومي

    # منظومة ساب / اي سيرفيس
    portal_system    = Column(String(50))    # ساب | اي سيرفيس | غيره
    portal_username  = Column(String(200))
    portal_password  = Column(Text)          # مشفر base64 في المستقبل

    # الفاتورة الإلكترونية
    einvoice_email   = Column(String(200))
    einvoice_password = Column(Text)

    # الإيميل
    email_address    = Column(String(200))
    email_password   = Column(Text)

    # منظومة توحيد المرتبات
    payroll_username = Column(String(200))
    payroll_password = Column(Text)
    payroll_type     = Column(String(20))    # شهري | سنوي

    # نوع الإقرار
    declaration_type = Column(String(50))    # دخل | ض ق م | تسهيلات

    # ميتاداتا
    notes      = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client     = relationship("Client", back_populates="portal_credentials")
    creator    = relationship("User", foreign_keys=[created_by])
