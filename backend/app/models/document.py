from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey, BigInteger
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
    BANK_STATEMENT = "bank_statement"
    PAYROLL = "payroll"
    OTHER = "other"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    original_name = Column(String(300))
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50))
    file_size = Column(BigInteger)
    category = Column(Enum(DocumentCategory), default=DocumentCategory.OTHER)
    client_id = Column(Integer, ForeignKey("clients.id"))
    description = Column(Text)
    tags = Column(String(500))
    extracted_text = Column(Text)  # OCR result
    year = Column(Integer)
    month = Column(Integer)
    is_archived = Column(Boolean, default=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    client = relationship("Client", back_populates="documents")
    uploader = relationship("User", foreign_keys=[uploaded_by])
