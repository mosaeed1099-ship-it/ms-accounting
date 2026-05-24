from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ClientType(str, enum.Enum):
    COMPANY = "company"
    INDIVIDUAL = "individual"
    FREELANCER = "freelancer"


class ClientStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PROSPECT = "prospect"
    SUSPENDED = "suspended"


class TaxType(str, enum.Enum):
    VAT = "vat"
    INCOME = "income"
    WITHHOLDING = "withholding"
    STAMP = "stamp"
    NONE = "none"


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    name_en = Column(String(200))
    client_type = Column(Enum(ClientType), default=ClientType.COMPANY)
    status = Column(Enum(ClientStatus), default=ClientStatus.ACTIVE)

    # Contact Info
    email = Column(String(150))
    phone = Column(String(20))
    phone2 = Column(String(20))
    address = Column(Text)
    governorate = Column(String(50))
    city = Column(String(50))

    # Business Info
    commercial_register = Column(String(50))
    tax_number = Column(String(50), index=True)
    national_id = Column(String(20))
    activity = Column(String(200))
    activity_code = Column(String(20))

    # Financial Info
    tax_type = Column(Enum(TaxType), default=TaxType.VAT)
    contract_value = Column(Float, default=0)
    payment_terms = Column(Integer, default=30)  # days
    credit_limit = Column(Float, default=0)
    balance = Column(Float, default=0)

    # Contract Dates
    contract_start = Column(Date)
    contract_end = Column(Date)
    contract_renewal_date = Column(Date)

    # System
    notes = Column(Text)
    tags = Column(String(500))
    assigned_accountant_id = Column(Integer, ForeignKey("users.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    assigned_accountant = relationship("User", foreign_keys=[assigned_accountant_id])
    creator = relationship("User", foreign_keys=[created_by])
    invoices = relationship("Invoice", back_populates="client")
    documents = relationship("Document", back_populates="client")
    tasks = relationship("Task", back_populates="client")
    tax_returns = relationship("TaxReturn", back_populates="client")
    contacts = relationship("ClientContact", back_populates="client")
    activities = relationship("ActivityLog", back_populates="client")
