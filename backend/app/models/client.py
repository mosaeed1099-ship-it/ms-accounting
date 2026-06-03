from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, Float, Date, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ClientType(str, enum.Enum):
    # شركات
    LLC = "llc"                          # شركة ذات مسئولية محدودة
    ONE_PERSON = "one_person"            # شركة شخص واحد
    SOLE_PROPRIETORSHIP = "sole"         # منشأة فردية
    LIMITED_PARTNERSHIP = "limited_partnership"   # توصية بسيطة
    JOINT_STOCK = "joint_stock"          # مساهمة
    PARTNERSHIP = "partnership"          # تضامن
    FOREIGN_BRANCH = "foreign_branch"   # فرع شركة أجنبية
    ASSOCIATION = "association"          # جمعية
    FOUNDATION = "foundation"            # مؤسسة
    HOLDING = "holding"                  # شركة قابضة
    FREE_ZONE = "free_zone"             # شركة منطقة حرة
    INDIVIDUAL = "individual"            # فرد / شخص طبيعي
    FREELANCER = "freelancer"            # عمل حر
    # قديم للتوافق
    COMPANY = "company"


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


CLIENT_TYPE_LABELS = {
    "llc": "شركة ذات مسئولية محدودة",
    "one_person": "شركة شخص واحد",
    "sole": "منشأة فردية",
    "limited_partnership": "توصية بسيطة",
    "joint_stock": "شركة مساهمة",
    "partnership": "شركة تضامن",
    "foreign_branch": "فرع شركة أجنبية",
    "association": "جمعية",
    "foundation": "مؤسسة",
    "holding": "شركة قابضة",
    "free_zone": "شركة منطقة حرة",
    "individual": "فرد / شخص طبيعي",
    "freelancer": "عمل حر",
    "company": "شركة",
}


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    name_en = Column(String(200))
    client_type = Column(String(50), default="llc")
    status = Column(Enum(ClientStatus), default=ClientStatus.ACTIVE)

    # Contact Info
    email = Column(String(150))
    phone = Column(String(20))
    phone2 = Column(String(20))
    address = Column(Text)
    governorate = Column(String(50))
    city = Column(String(50))

    # Business Info — جميع الحقول اختيارية
    commercial_register = Column(String(50))    # اختياري — قد لا يكون موجوداً بعد
    tax_number = Column(String(50), index=True) # اختياري — قد لا يكون موجوداً بعد
    vat_number = Column(String(50))             # رقم القيمة المضافة — اختياري
    national_id = Column(String(20))
    activity = Column(String(200))
    activity_code = Column(String(20))

    # Financial Info
    tax_type = Column(Enum(TaxType), default=TaxType.VAT)
    monthly_fee = Column(Float, default=0)       # قيمة الأتعاب الشهرية المتفق عليها
    contract_value = Column(Float, default=0)
    payment_terms = Column(Integer, default=30)
    credit_limit = Column(Float, default=0)
    balance = Column(Float, default=0)

    # Tax Obligations — الالتزامات الضريبية لهذا العميل (JSON list)
    tax_obligations = Column(JSON, default=list)  # ['vat_monthly','payroll_monthly',...]

    # Contract Dates
    contract_start = Column(Date)
    contract_end = Column(Date)
    contract_renewal_date = Column(Date)

    # Extended Company Profile (Point 4)
    trade_name          = Column(String(200))          # السمة التجارية
    legal_entity        = Column(String(100))          # الكيان القانوني
    company_status      = Column(String(30), default="active")  # active|inactive|under_establishment
    activity_start_date = Column(Date)
    activity_end_date   = Column(Date)
    # language preference for this client
    preferred_lang      = Column(String(5), default="ar")

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
    collections = relationship("CollectionContract", back_populates="client", cascade="all, delete-orphan")
    company_documents = relationship("CompanyDocument", back_populates="client", cascade="all, delete-orphan")
    office_services   = relationship("OfficeService", back_populates="client", cascade="all, delete-orphan")
    portal_user       = relationship("ClientPortalUser", back_populates="client", uselist=False, cascade="all, delete-orphan")
