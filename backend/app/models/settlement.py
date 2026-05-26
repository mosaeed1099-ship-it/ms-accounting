"""
تسويات الموظفين — Employee Daily Settlements & Custody Management
نظام متابعة المأموريات والمصروفات اليومية
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Date, ForeignKey, Boolean
from datetime import datetime
from app.database import Base


class EmployeeCustody(Base):
    """رصيد العهدة الحالي لكل موظف"""
    __tablename__ = "employee_custody_balances"

    id               = Column(Integer, primary_key=True, index=True)
    employee_name    = Column(String(200), unique=True, nullable=False, index=True)
    current_balance  = Column(Float, default=0)   # الرصيد الحالي في العهدة
    total_given      = Column(Float, default=0)   # إجمالي العهد المُعطاة منذ البداية
    total_spent      = Column(Float, default=0)   # إجمالي ما صُرف منذ البداية
    last_settlement_date = Column(Date)
    notes            = Column(Text)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmployeeSettlement(Base):
    """تسوية يومية لموظف — مأمورية أو مصروفات خارجية"""
    __tablename__ = "employee_settlements"

    id               = Column(Integer, primary_key=True, index=True)
    employee_name    = Column(String(200), nullable=False, index=True)

    # التاريخ والفترة
    date             = Column(Date, nullable=False, index=True)
    month            = Column(Integer, index=True)
    year             = Column(Integer, index=True)

    # تفاصيل المأمورية
    company_name     = Column(String(300))   # اسم الشركة اللي اشتغل فيها
    destination      = Column(String(500))   # راح فين (الوجهة)
    reason           = Column(Text)          # سبب المأمورية

    # المصروفات
    transportation   = Column(Float, default=0)   # الانتقالات
    meals            = Column(Float, default=0)   # مصروف الأكل
    other_expenses   = Column(Float, default=0)   # مصاريف أخرى
    total_spent      = Column(Float, default=0)   # إجمالي الصرف اليوم

    # حركة العهدة
    opening_balance  = Column(Float, default=0)   # رصيد العهدة أول اليوم (من أمس)
    custody_added    = Column(Float, default=0)   # عهدة جديدة أُضيفت اليوم
    closing_balance  = Column(Float, default=0)   # المتبقي في نهاية اليوم

    notes            = Column(Text)
    created_by       = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Appointment(Base):
    """جدول المواعيد — Appointments & Meetings"""
    __tablename__ = "appointments"

    id            = Column(Integer, primary_key=True, index=True)
    title         = Column(String(300), nullable=False)
    client_id     = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    client_name   = Column(String(200))        # cached name
    employee_name = Column(String(200))        # المسؤول
    appt_date     = Column(Date, nullable=False, index=True)
    appt_time     = Column(String(10))         # HH:MM
    location      = Column(String(300))
    description   = Column(Text)
    status        = Column(String(20), default="pending")
    # pending | confirmed | done | cancelled
    reminder_sent = Column(Boolean, default=False)
    created_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GovernmentPaper(Base):
    """الأوراق الحكومية لكل عميل — Government Documents Tracker"""
    __tablename__ = "government_papers"

    id           = Column(Integer, primary_key=True, index=True)
    client_id    = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    client_name  = Column(String(200))

    paper_type   = Column(String(100), nullable=False)
    # بطاقة ضريبية / سجل تجاري / شهادة ض ق م / بطاقة رقم قومي / عقد إيجار / ...

    paper_number = Column(String(100))
    issue_date   = Column(Date)
    expiry_date  = Column(Date, index=True)
    status       = Column(String(20), default="active")
    # active | expired | expiring_soon | pending_renewal | cancelled

    notes        = Column(Text)
    has_copy     = Column(Boolean, default=False)  # هل عندنا نسخة منه؟
    created_by   = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
