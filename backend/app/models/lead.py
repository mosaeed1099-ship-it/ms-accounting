"""
نموذج العملاء المحتملين (Leads) - نظام CRM
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class LeadStatus:
    NEW = "new"
    INTERESTED = "interested"
    MEETING = "meeting"
    QUOTATION_SENT = "quotation_sent"
    PAID = "paid"
    UNDER_ESTABLISHMENT = "under_establishment"
    TAX_REGISTERED = "tax_registered"
    ACCOUNTING_CLIENT = "accounting_client"
    INACTIVE = "inactive"
    LOST = "lost"


class LeadSource:
    REFERRAL = "referral"
    SOCIAL_MEDIA = "social_media"
    WEBSITE = "website"
    WALK_IN = "walk_in"
    PHONE = "phone"
    WHATSAPP = "whatsapp"
    OTHER = "other"


class ServiceType:
    ESTABLISHMENT = "establishment"
    ACCOUNTING = "accounting"
    TAX = "tax"
    PAYROLL = "payroll"
    LEGAL = "legal"
    OTHER = "other"


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)  # LDR-0001

    # بيانات أساسية
    name = Column(String, nullable=False)
    phone = Column(String)
    email = Column(String)
    company_name = Column(String)
    governorate = Column(String)

    # حالة ومصدر
    status = Column(String, default=LeadStatus.NEW)
    source = Column(String, default=LeadSource.OTHER)

    # الخدمة المطلوبة
    service_requested = Column(String, default=ServiceType.ESTABLISHMENT)
    company_type = Column(String)   # llc, jsc, sole, ngo
    estimated_capital = Column(Float)

    # تعيين موظف
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)

    # حقول إضافية للـ CRM
    has_office = Column(Boolean, default=False)           # هل يوجد مقر
    meeting_date = Column(DateTime, nullable=True)        # ميعاد الميتينج
    company_activities = Column(Text, nullable=True)      # الأنشطة
    suggested_name = Column(String, nullable=True)        # الاسم المقترح للشركة

    # ملاحظات وأسباب
    notes = Column(Text)
    lost_reason = Column(Text)

    # حقول إضافية CRM
    follow_up_date = Column(DateTime, nullable=True)          # موعد المتابعة
    has_existing_companies = Column(Boolean, default=False)   # شركات قائمة
    proposed_names = Column(Text, nullable=True)              # JSON: قائمة الأسماء المقترحة

    # ─── عرض السعر المدمج ─────────────────────────────────────────────────────
    quote_legal_entity    = Column(String, nullable=True)    # الكيان القانوني
    quote_activity        = Column(String, nullable=True)    # النشاط
    quote_location        = Column(String, nullable=True)    # الموقع / المحافظة
    quote_capital         = Column(Float,  nullable=True)    # رأس المال
    quote_total_fees      = Column(Float,  nullable=True)    # إجمالي أتعاب المكتب
    quote_government_fees = Column(Float,  nullable=True)    # الرسوم الحكومية
    quote_expenses_total  = Column(Float,  nullable=True)    # إجمالي شامل
    quote_services        = Column(Text,   nullable=True)    # JSON: [{name, price}]
    quote_required_docs   = Column(Text,   nullable=True)    # JSON: [string, ...]
    quote_notes           = Column(Text,   nullable=True)    # ملاحظات العرض
    quote_deliver_docs    = Column(Text,   nullable=True)    # JSON: [{name, checked}] مستندات تسليم العميل

    # رابط بعميل رسمي (بعد التحويل)
    converted_client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    converted_at = Column(DateTime, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assigned_user = relationship("User", foreign_keys=[assigned_to], backref="assigned_leads")
    activities = relationship("LeadActivity", back_populates="lead", cascade="all, delete-orphan", order_by="LeadActivity.created_at.desc()")
    meetings = relationship("Meeting", back_populates="lead", cascade="all, delete-orphan")
    follow_ups = relationship("FollowUp", back_populates="lead", cascade="all, delete-orphan")
    quotations = relationship("Quotation", back_populates="lead", cascade="all, delete-orphan")


class LeadActivity(Base):
    """سجل نشاطات العميل المحتمل - Timeline"""
    __tablename__ = "lead_activities"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    action = Column(String, nullable=False)   # status_change, note, call, meeting, quotation, payment
    description = Column(Text)
    old_value = Column(String)
    new_value = Column(String)
    metadata_ = Column(Text)  # JSON extra data

    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="activities")
    user = relationship("User", backref="lead_activities")


class Meeting(Base):
    """الاجتماعات"""
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)

    title = Column(String, nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=60)
    location = Column(String)          # office, online, client_site
    meeting_link = Column(String)      # Zoom/Meet link
    notes = Column(Text)
    outcome = Column(Text)

    status = Column(String, default="scheduled")  # scheduled, done, cancelled, no_show

    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="meetings")
    assigned_user = relationship("User", foreign_keys=[assigned_to], backref="meetings")


class FollowUp(Base):
    """المتابعات"""
    __tablename__ = "follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)

    due_date = Column(DateTime, nullable=False)
    follow_up_type = Column(String, default="call")  # call, whatsapp, email, meeting
    notes = Column(Text)
    result = Column(Text)

    status = Column(String, default="pending")  # pending, done, cancelled
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="follow_ups")
    assigned_user = relationship("User", foreign_keys=[assigned_to], backref="follow_ups")
