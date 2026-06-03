from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Date, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

DOC_TYPES = {
    "tax_card":         "البطاقة الضريبية",
    "commercial_reg":   "السجل التجاري",
    "vat_cert":         "شهادة القيمة المضافة",
    "import_card":      "البطاقة الاستيرادية",
    "export_card":      "البطاقة التصديرية",
    "power_of_attorney":"التوكين / التفويض",
    "license":          "ترخيص",
    "other":            "أخرى",
}

class CompanyDocument(Base):
    __tablename__ = "company_documents"

    id               = Column(Integer, primary_key=True, index=True)
    client_id        = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    doc_type         = Column(String(50), nullable=False)
    doc_name         = Column(String(200))          # custom name
    doc_number       = Column(String(100))
    issue_date       = Column(Date)
    expiry_date      = Column(Date)
    file_path        = Column(String(500))
    status           = Column(String(20), default="active")  # active|expired|expiring_soon
    alert_days       = Column(String(50), default="30,15,7") # comma-separated
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes            = Column(Text)
    is_active        = Column(Boolean, default=True)
    created_by       = Column(Integer, ForeignKey("users.id"))
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), onupdate=func.now())

    client        = relationship("Client", back_populates="company_documents")
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    creator       = relationship("User", foreign_keys=[created_by])
