"""
نموذج عروض أسعار تأسيس الشركات — Smart Quotation System
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Date, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


# ── Status flow ────────────────────────────────────────────────────────────
# draft → sent → (opened → replied) → accepted / rejected / negotiation / expired

class Quotation(Base):
    __tablename__ = "quotations"

    id             = Column(Integer, primary_key=True, index=True)
    quote_number   = Column(String(30), unique=True, index=True)  # QUO-2026-0001
    version        = Column(Integer, default=1)

    # ── Client info (standalone — no client_id required until converted) ──
    client_name    = Column(String(200), nullable=False)
    client_phone   = Column(String(30))
    client_email   = Column(String(150))

    # ── Company establishment details ─────────────────────────────────────
    legal_entity       = Column(String(100))   # نوع الكيان القانوني
    activity           = Column(String(300))   # النشاط
    activity_location  = Column(String(100))   # مقر النشاط
    capital            = Column(Float, default=0)  # رأس المال بالجنيه

    # ── Services content (JSON lists) ─────────────────────────────────────
    deliverables   = Column(JSON)   # ما يستلمه العميل
    requirements   = Column(JSON)   # المطلوب من العميل
    extra_services = Column(JSON)   # خدمات إضافية مخصصة

    # ── Pricing ───────────────────────────────────────────────────────────
    expenses_total     = Column(Float, default=0)   # إجمالي المصاريف والأتعاب
    government_fees    = Column(Float, default=0)   # رسوم حكومية
    office_fees        = Column(Float, default=0)   # أتعاب المكتب
    notes              = Column(Text)

    # ── Branding / signature ─────────────────────────────────────────────
    greeting       = Column(String(100), default="مساء الخير")  # مساء/صباح الخير
    advisor_name   = Column(String(100))   # المستشار / عمرو شعبان

    # ── Status & tracking ─────────────────────────────────────────────────
    status             = Column(String(30), default="draft")
    sent_at            = Column(DateTime, nullable=True)
    opened_at          = Column(DateTime, nullable=True)
    last_contact_at    = Column(DateTime, nullable=True)
    client_notes       = Column(Text)   # ملاحظات العميل / تعليقاته

    # ── Validity ──────────────────────────────────────────────────────────
    valid_until    = Column(Date, nullable=True)

    # ── Links ─────────────────────────────────────────────────────────────
    # Linked to existing lead (from CRM)
    lead_id    = Column(Integer, ForeignKey("leads.id"),    nullable=True)
    # Linked to client after conversion/acceptance
    client_id  = Column(Integer, ForeignKey("clients.id"), nullable=True)

    # ── Metadata ──────────────────────────────────────────────────────────
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── Relationships ─────────────────────────────────────────────────────
    lead             = relationship("Lead",   foreign_keys=[lead_id],   back_populates="quotations")
    client           = relationship("Client", foreign_keys=[client_id], backref="quotations")
    created_by_user  = relationship("User",   foreign_keys=[created_by], backref="created_quotations")


class QuotationTemplate(Base):
    """Templates for common legal entity types — pre-fills deliverables & requirements."""
    __tablename__ = "quotation_templates"

    id               = Column(Integer, primary_key=True)
    name             = Column(String(150))      # اسم القالب
    legal_entity     = Column(String(100))      # الكيان القانوني الافتراضي
    greeting         = Column(String(100), default="مساء الخير")
    deliverables     = Column(JSON)             # قائمة المستلمات الافتراضية
    requirements     = Column(JSON)             # قائمة المتطلبات الافتراضية
    default_expenses = Column(Float, default=0) # سعر افتراضي
    is_active        = Column(Boolean, default=True)
    sort_order       = Column(Integer, default=0)
    created_by       = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
