"""
نموذج تأسيس الشركات - Company Formation Workflow (v2)
النموذج الجديد: Lead → Client → CompanyFormationCase (مستقل تماماً)
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


# ── مراحل التأسيس الـ 10 ──────────────────────────────
FORMATION_STAGES = [
    ("name_reservation",  "حجز اسم",                  "📝"),
    ("name_approved",     "إقرار قبول",               "✅"),
    ("under_review",      "تحت المراجعة",             "🔍"),
    ("fees_payment",      "دفع الرسوم والتوقيع",      "💳"),
    ("follow_up",         "في المتابعة",              "📞"),
    ("lawyers_syndicate", "نقابة المحامين",           "⚖️"),
    ("real_estate",       "الشهر العقاري",            "🏢"),
    ("chamber_commerce",  "الغرفة التجارية",          "🏛️"),
    ("commercial_register","السجل التجاري",           "📋"),
    ("docs_received",     "استلام المستندات",         "📂"),
    ("tax_card",          "الضرائب",                  "🪪"),
    ("completed",         "مكتمل",                    "🎉"),
]
FORMATION_STAGE_KEYS = [s[0] for s in FORMATION_STAGES]


class CompanyType:
    LLC         = "llc"
    JSC         = "jsc"
    SOLE        = "sole"
    PARTNERSHIP = "partnership"
    NGO         = "ngo"
    BRANCH      = "branch"
    REP         = "rep"


# ── ملف التأسيس الرئيسي ──────────────────────────────
class CompanyFormationCase(Base):
    """
    ملف تأسيس مستقل مرتبط بعميل (وليس بـ Lead مباشرة).
    العميل الواحد يمكن أن يكون له أكثر من ملف.
    """
    __tablename__ = "company_formation_cases"

    id          = Column(Integer, primary_key=True, index=True)
    code        = Column(String, unique=True, index=True)   # CFC-0001

    # ── بيانات الشركة ──
    company_name    = Column(String, nullable=False)
    company_name_en = Column(String)
    company_type    = Column(String, default=CompanyType.LLC)
    activity        = Column(String)
    governorate     = Column(String)
    capital         = Column(Float)
    proposed_names  = Column(Text)      # JSON list

    # ── روابط ──
    client_id   = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    lead_id     = Column(Integer, ForeignKey("leads.id"),   nullable=True)   # المصدر الأصلي
    assigned_to = Column(Integer, ForeignKey("users.id"),   nullable=True)
    created_by  = Column(Integer, ForeignKey("users.id"),   nullable=True)

    # ── المرحلة الحالية (pipeline) ──
    current_stage   = Column(String, default="name_reservation", index=True)
    stage_entered_at = Column(DateTime, default=datetime.utcnow)

    # ── المالية ──
    agreed_fees     = Column(Float, default=0)   # أتعاب التأسيس المتفق عليها
    government_fees = Column(Float, default=0)   # رسوم حكومية
    total_cost      = Column(Float, default=0)   # تكاليف فعلية

    # ── مخرجات رسمية ──
    commercial_register_number = Column(String)
    tax_card_number            = Column(String)
    vat_number                 = Column(String)

    # ── الحالة العامة ──
    is_completed = Column(Boolean, default=False)
    is_cancelled = Column(Boolean, default=False)
    notes        = Column(Text)

    completed_at = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── العلاقات ──
    client       = relationship("Client",  foreign_keys=[client_id],  backref="formation_cases")
    assigned_user= relationship("User",    foreign_keys=[assigned_to], backref="formation_cases")
    events       = relationship("FormationEvent", back_populates="case",
                                cascade="all, delete-orphan", order_by="FormationEvent.created_at.desc()")

    @property
    def status(self):
        if self.is_cancelled:  return "cancelled"
        if self.is_completed:  return "completed"
        return self.current_stage

    @property
    def stage_index(self):
        try:   return FORMATION_STAGE_KEYS.index(self.current_stage)
        except: return 0

    @property
    def progress(self):
        return int((self.stage_index / (len(FORMATION_STAGE_KEYS) - 1)) * 100)

    @property
    def stage_label(self):
        for key, label, _ in FORMATION_STAGES:
            if key == self.current_stage:
                return label
        return self.current_stage


# ── أحداث الـ Timeline ────────────────────────────────
class FormationEvent(Base):
    """سجل كل حدث داخل ملف التأسيس"""
    __tablename__ = "formation_events"

    id          = Column(Integer, primary_key=True, index=True)
    case_id     = Column(Integer, ForeignKey("company_formation_cases.id"), nullable=False, index=True)

    event_type  = Column(String, nullable=False)
    # أنواع الأحداث:
    # stage_change | document_received | payment_received | note_added
    # whatsapp_sent | email_sent | call_made | file_submitted | completed | cancelled

    title       = Column(String)          # عنوان الحدث
    description = Column(Text)            # تفاصيل
    old_stage   = Column(String)          # المرحلة السابقة (عند stage_change)
    new_stage   = Column(String)          # المرحلة الجديدة
    amount      = Column(Float)           # المبلغ (عند payment)

    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_name = Column(String)      # cached name
    created_at  = Column(DateTime, default=datetime.utcnow, index=True)

    case        = relationship("CompanyFormationCase", back_populates="events")
    user        = relationship("User", foreign_keys=[created_by], backref="formation_events")


# ── نبقي الـ model القديم للتوافقية مع البيانات الموجودة ──
class EstablishmentStatus:
    PENDING     = "pending"
    IN_PROGRESS = "in_progress"
    DONE        = "done"
    BLOCKED     = "blocked"
    CANCELLED   = "cancelled"


class CompanyEstablishment(Base):
    """النموذج القديم — محفوظ للبيانات الموجودة فقط"""
    __tablename__ = "company_establishments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    company_name = Column(String, nullable=False)
    company_name_en = Column(String)
    company_type = Column(String, default=CompanyType.LLC)
    activity = Column(String)
    governorate = Column(String)
    capital = Column(Float)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    status = Column(String, default=EstablishmentStatus.IN_PROGRESS)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    name_reservation_status = Column(String, default="pending")
    name_reservation_date = Column(DateTime, nullable=True)
    name_reservation_notes = Column(Text)
    commercial_register_status = Column(String, default="pending")
    commercial_register_number = Column(String)
    commercial_register_date = Column(DateTime, nullable=True)
    commercial_register_notes = Column(Text)
    tax_card_status = Column(String, default="pending")
    tax_card_number = Column(String)
    tax_card_date = Column(DateTime, nullable=True)
    tax_card_notes = Column(Text)
    vat_registration_status = Column(String, default="pending")
    vat_number = Column(String)
    vat_date = Column(DateTime, nullable=True)
    vat_notes = Column(Text)
    insurance_status = Column(String, default="pending")
    insurance_number = Column(String)
    insurance_date = Column(DateTime, nullable=True)
    insurance_notes = Column(Text)
    bank_account_status = Column(String, default="pending")
    bank_name = Column(String)
    bank_account_number = Column(String)
    bank_date = Column(DateTime, nullable=True)
    bank_notes = Column(Text)
    notes = Column(Text)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    assigned_user = relationship("User", foreign_keys=[assigned_to], backref="establishments")

    @property
    def stages(self):
        return [
            {"key": "name_reservation",    "label": "حجز الاسم",         "status": self.name_reservation_status,    "date": self.name_reservation_date},
            {"key": "commercial_register", "label": "السجل التجاري",     "status": self.commercial_register_status, "date": self.commercial_register_date},
            {"key": "tax_card",            "label": "البطاقة الضريبية",  "status": self.tax_card_status,            "date": self.tax_card_date},
            {"key": "vat_registration",    "label": "تسجيل ق.م.م",       "status": self.vat_registration_status,    "date": self.vat_date},
            {"key": "insurance",           "label": "التأمينات",          "status": self.insurance_status,           "date": self.insurance_date},
            {"key": "bank_account",        "label": "الحساب البنكي",     "status": self.bank_account_status,        "date": self.bank_date},
        ]

    @property
    def progress(self):
        stages = self.stages
        done = sum(1 for s in stages if s["status"] == "done")
        return int(done / len(stages) * 100) if stages else 0
