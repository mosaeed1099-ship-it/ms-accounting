from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class DocumentCategory(str, enum.Enum):
    CONTRACT = "contract"
    INVOICE = "invoice"
    TAX_RETURN = "tax_return"
    FINANCIAL_STATEMENT = "financial_statement"
    ID_DOCUMENTS = "id_documents"
    COMMERCIAL_REGISTER = "commercial_register"
    TAX_CARD = "tax_card"                   # بطاقة ضريبية
    VAT_CERTIFICATE = "vat_certificate"    # شهادة تسجيل ضريبة القيمة المضافة
    BANK_STATEMENT = "bank_statement"
    PAYROLL = "payroll"
    ESTABLISHMENT = "establishment"        # مستندات التأسيس
    NATIONAL_ID = "national_id"            # بطاقة رقم قومي
    OTHER = "other"


CATEGORY_LABELS = {
    "contract": "عقود",
    "invoice": "فواتير",
    "tax_return": "إقرارات ضريبية",
    "financial_statement": "قوائم مالية",
    "id_documents": "وثائق هوية",
    "commercial_register": "سجل تجاري",
    "tax_card": "بطاقة ضريبية",
    "vat_certificate": "شهادة القيمة المضافة",
    "bank_statement": "كشف حساب بنكي",
    "payroll": "مرتبات",
    "establishment": "مستندات تأسيس",
    "national_id": "بطاقة رقم قومي",
    "other": "مستندات أخرى",
}


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    original_name = Column(String(300))
    file_path = Column(String(500))          # local path (optional if gdrive)
    file_type = Column(String(50))
    file_size = Column(BigInteger)
    category = Column(String(50), default="other")
    client_id = Column(Integer, ForeignKey("clients.id"))
    description = Column(Text)
    tags = Column(String(500))
    extracted_text = Column(Text)            # OCR result
    year = Column(Integer)
    month = Column(Integer)
    is_archived = Column(Boolean, default=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ─── Google Drive fields ───
    gdrive_file_id = Column(String(100))    # Drive file ID
    gdrive_view_url = Column(String(500))   # https://drive.google.com/file/d/{id}/view
    gdrive_thumb_url = Column(String(500))  # thumbnail URL
    gdrive_mime_type = Column(String(100))  # e.g. application/pdf
    gdrive_folder_path = Column(String(500))  # original path in Drive

    client = relationship("Client", back_populates="documents")
    uploader = relationship("User", foreign_keys=[uploaded_by])
