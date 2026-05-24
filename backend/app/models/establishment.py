"""
نموذج تأسيس الشركات - Company Establishment Workflow
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class EstablishmentStatus:
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"


class CompanyType:
    LLC = "llc"               # شركة ذات مسؤولية محدودة
    JSC = "jsc"               # شركة مساهمة
    SOLE = "sole"             # مؤسسة فردية
    PARTNERSHIP = "partnership"  # شراكة
    NGO = "ngo"               # جمعية / مؤسسة غير ربحية
    BRANCH = "branch"         # فرع شركة أجنبية


class CompanyEstablishment(Base):
    __tablename__ = "company_establishments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)   # EST-0001

    # بيانات الشركة
    company_name = Column(String, nullable=False)
    company_name_en = Column(String)
    company_type = Column(String, default=CompanyType.LLC)
    activity = Column(String)
    governorate = Column(String)
    capital = Column(Float)

    # ربط بعميل / Lead
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)

    # الحالة العامة
    status = Column(String, default=EstablishmentStatus.IN_PROGRESS)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)

    # مراحل التأسيس (كل مرحلة: status + date + notes)
    # المرحلة 1: حجز الاسم
    name_reservation_status = Column(String, default="pending")
    name_reservation_date = Column(DateTime, nullable=True)
    name_reservation_notes = Column(Text)
    name_reservation_deadline = Column(DateTime, nullable=True)

    # المرحلة 2: السجل التجاري
    commercial_register_status = Column(String, default="pending")
    commercial_register_number = Column(String)
    commercial_register_date = Column(DateTime, nullable=True)
    commercial_register_notes = Column(Text)
    commercial_register_deadline = Column(DateTime, nullable=True)

    # المرحلة 3: البطاقة الضريبية
    tax_card_status = Column(String, default="pending")
    tax_card_number = Column(String)
    tax_card_date = Column(DateTime, nullable=True)
    tax_card_notes = Column(Text)
    tax_card_deadline = Column(DateTime, nullable=True)

    # المرحلة 4: تسجيل القيمة المضافة
    vat_registration_status = Column(String, default="pending")
    vat_number = Column(String)
    vat_date = Column(DateTime, nullable=True)
    vat_notes = Column(Text)
    vat_deadline = Column(DateTime, nullable=True)

    # المرحلة 5: التأمينات الاجتماعية
    insurance_status = Column(String, default="pending")
    insurance_number = Column(String)
    insurance_date = Column(DateTime, nullable=True)
    insurance_notes = Column(Text)
    insurance_deadline = Column(DateTime, nullable=True)

    # المرحلة 6: فتح الحساب البنكي
    bank_account_status = Column(String, default="pending")
    bank_name = Column(String)
    bank_account_number = Column(String)
    bank_date = Column(DateTime, nullable=True)
    bank_notes = Column(Text)
    bank_deadline = Column(DateTime, nullable=True)

    # ملاحظات عامة
    notes = Column(Text)
    completed_at = Column(DateTime, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_user = relationship("User", foreign_keys=[assigned_to], backref="establishments")
    lead = relationship("Lead", backref="establishment")

    @property
    def stages(self):
        """إرجاع مراحل التأسيس كقائمة"""
        return [
            {"key": "name_reservation",    "label": "حجز الاسم",         "icon": "📝",
             "status": self.name_reservation_status,    "date": self.name_reservation_date,
             "deadline": self.name_reservation_deadline, "notes": self.name_reservation_notes},
            {"key": "commercial_register", "label": "السجل التجاري",     "icon": "🏛️",
             "status": self.commercial_register_status, "date": self.commercial_register_date,
             "deadline": self.commercial_register_deadline, "notes": self.commercial_register_notes,
             "number": self.commercial_register_number},
            {"key": "tax_card",            "label": "البطاقة الضريبية",  "icon": "🪪",
             "status": self.tax_card_status,            "date": self.tax_card_date,
             "deadline": self.tax_card_deadline, "notes": self.tax_card_notes,
             "number": self.tax_card_number},
            {"key": "vat_registration",    "label": "تسجيل ق.م.م",       "icon": "🧾",
             "status": self.vat_registration_status,    "date": self.vat_date,
             "deadline": self.vat_deadline, "notes": self.vat_notes,
             "number": self.vat_number},
            {"key": "insurance",           "label": "التأمينات",          "icon": "🛡️",
             "status": self.insurance_status,           "date": self.insurance_date,
             "deadline": self.insurance_deadline, "notes": self.insurance_notes,
             "number": self.insurance_number},
            {"key": "bank_account",        "label": "الحساب البنكي",     "icon": "🏦",
             "status": self.bank_account_status,        "date": self.bank_date,
             "deadline": self.bank_deadline, "notes": self.bank_notes,
             "number": self.bank_account_number},
        ]

    @property
    def progress(self):
        """نسبة الإنجاز"""
        stages = self.stages
        done = sum(1 for s in stages if s["status"] == "done")
        return int(done / len(stages) * 100) if stages else 0
