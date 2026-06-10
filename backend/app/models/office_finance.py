"""
Office Financial Management Models
إدارة المكتب المالية — Admin Only
"""
from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, Boolean, Enum as SAEnum
from app.database import Base
import enum


class OfficeRevenueCat(str, enum.Enum):
    accounting   = "accounting"    # خدمات المحاسبة
    formation     = "formation"    # تأسيس الشركات
    tax           = "tax"          # الإقرارات الضريبية
    insurance     = "insurance"    # التأمينات
    commercial    = "commercial"   # السجل التجاري
    tax_card      = "tax_card"     # البطاقة الضريبية
    consultation  = "consultation" # استشارات
    office_svc    = "office_svc"   # خدمات مكتبية
    other         = "other"        # أخرى


class OfficeExpenseCat(str, enum.Enum):
    rent          = "rent"         # إيجار
    electricity   = "electricity"  # كهرباء
    internet      = "internet"     # إنترنت
    salaries      = "salaries"     # مرتبات
    advertising   = "advertising"  # إعلانات
    marketing     = "marketing"    # تسويق
    software      = "software"     # برامج واشتراكات
    transport     = "transport"    # انتقالات
    hospitality   = "hospitality"  # ضيافة
    other         = "other"        # أخرى


REVENUE_CAT_LABELS = {
    "accounting":  "إيرادات المحاسبة",
    "formation":   "إيرادات التأسيس",
    "tax":         "إيرادات الضرائب",
    "insurance":   "إيرادات التأمينات",
    "commercial":  "إيرادات السجل التجاري",
    "tax_card":    "إيرادات البطاقة الضريبية",
    "consultation":"إيرادات الاستشارات",
    "office_svc":  "إيرادات الخدمات المكتبية",
    "other":       "إيرادات أخرى",
}

EXPENSE_CAT_LABELS = {
    "rent":        "إيجار",
    "electricity": "كهرباء",
    "internet":    "إنترنت",
    "salaries":    "مرتبات الموظفين",
    "advertising": "إعلانات",
    "marketing":   "تسويق",
    "software":    "برامج واشتراكات",
    "transport":   "انتقالات",
    "hospitality": "ضيافة",
    "other":       "مصروفات أخرى",
}


class OfficeRevenue(Base):
    """إيرادات المكتب — auto-captured + manual"""
    __tablename__ = "office_revenues"

    id          = Column(Integer, primary_key=True)
    date        = Column(Date, nullable=False, default=date.today)
    month       = Column(Integer, nullable=False)
    year        = Column(Integer, nullable=False)
    category    = Column(String(50), nullable=False, default="other")
    amount      = Column(Float, nullable=False)
    description = Column(Text)
    client_name = Column(String(300))   # اسم العميل (إن وُجد)
    source_type = Column(String(50))    # "collection" | "invoice" | "formation" | "manual"
    source_id   = Column(Integer)       # FK to source record
    is_auto     = Column(Boolean, default=False)  # auto-captured vs manual
    notes       = Column(Text)
    created_by  = Column(Integer)
    created_at  = Column(DateTime, default=datetime.utcnow)


class OfficeExpense(Base):
    """مصروفات المكتب"""
    __tablename__ = "office_expenses"

    id          = Column(Integer, primary_key=True)
    date        = Column(Date, nullable=False, default=date.today)
    month       = Column(Integer, nullable=False)
    year        = Column(Integer, nullable=False)
    category    = Column(String(50), nullable=False, default="other")
    amount      = Column(Float, nullable=False)
    description = Column(Text, nullable=False)
    vendor      = Column(String(300))
    source_type = Column(String(50), default="manual")  # "settlement" | "manual"
    source_id   = Column(Integer)
    is_auto     = Column(Boolean, default=False)
    notes       = Column(Text)
    created_by  = Column(Integer)
    created_at  = Column(DateTime, default=datetime.utcnow)


class OfficeMonthSnapshot(Base):
    """Month Closing — Snapshot لا يُعدَّل بعد الإغلاق"""
    __tablename__ = "office_month_snapshots"

    id                   = Column(Integer, primary_key=True)
    year                 = Column(Integer, nullable=False)
    month                = Column(Integer, nullable=False)
    total_revenue        = Column(Float, default=0)
    total_expense        = Column(Float, default=0)
    net_profit           = Column(Float, default=0)
    profit_margin_pct    = Column(Float, default=0)
    revenue_by_cat       = Column(Text)   # JSON
    expense_by_cat       = Column(Text)   # JSON
    new_clients_count    = Column(Integer, default=0)
    formations_count     = Column(Integer, default=0)
    declarations_count   = Column(Integer, default=0)
    partner_ms_share     = Column(Float, default=0)
    partner_ahmed_share  = Column(Float, default=0)
    closed              = Column(Boolean, default=False)
    closed_by           = Column(Integer)
    closed_at           = Column(DateTime)
    notes               = Column(Text)
    created_at          = Column(DateTime, default=datetime.utcnow)


class PartnerConfig(Base):
    """نسب توزيع الأرباح بين الشركاء"""
    __tablename__ = "partner_configs"

    id          = Column(Integer, primary_key=True)
    partner_key = Column(String(50), nullable=False, unique=True)  # "ms" | "ahmed"
    name        = Column(String(200), nullable=False)
    share_pct   = Column(Float, nullable=False, default=50.0)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
