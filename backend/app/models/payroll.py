"""
الرواتب وشؤون الموظفين — Payroll & HR Module
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Date, ForeignKey, Boolean
from datetime import datetime
from app.database import Base


class Employee(Base):
    """بيانات الموظفين الأساسية"""
    __tablename__ = "hr_employees"

    id               = Column(Integer, primary_key=True, index=True)
    client_id        = Column(Integer, ForeignKey("clients.id"), nullable=True)  # موظف عميل (للضريبة)
    name             = Column(String(200), nullable=False)
    national_id      = Column(String(30), nullable=True)
    insurance_start_date = Column(Date)   # تاريخ الاشتراك في التأمين
    job_title        = Column(String(150))
    department       = Column(String(100))
    hire_date        = Column(Date)
    base_salary      = Column(Float, default=0)
    variable_pay     = Column(Float, default=0)   # متغيرات / حوافز
    allowances       = Column(Float, default=0)   # بدلات معفاة من الضريبة
    insurance_number = Column(String(50))
    insurance_share  = Column(Float, default=0)   # نسبة تأمين الموظف %
    company_insurance= Column(Float, default=0)   # نسبة تأمين الشركة %
    bank_name        = Column(String(100))
    bank_account     = Column(String(50))
    phone            = Column(String(30))
    email            = Column(String(100))
    status           = Column(String(20), default="active")   # active | inactive | terminated
    notes            = Column(Text)
    created_by       = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PayrollRun(Base):
    """مسير الرواتب الشهري — Monthly Payroll"""
    __tablename__ = "payroll_runs"

    id            = Column(Integer, primary_key=True, index=True)
    month         = Column(Integer, nullable=False)
    year          = Column(Integer, nullable=False)
    status        = Column(String(20), default="draft")   # draft | approved | paid
    total_gross   = Column(Float, default=0)   # إجمالي الرواتب
    total_deduct  = Column(Float, default=0)   # إجمالي الخصومات
    total_net     = Column(Float, default=0)   # صافي المدفوع
    notes         = Column(Text)
    approved_by   = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at   = Column(DateTime)
    created_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PayrollItem(Base):
    """بند راتب موظف في مسير معين"""
    __tablename__ = "payroll_items"

    id                 = Column(Integer, primary_key=True, index=True)
    run_id             = Column(Integer, ForeignKey("payroll_runs.id"), nullable=False, index=True)
    employee_id        = Column(Integer, ForeignKey("hr_employees.id"), nullable=False, index=True)
    employee_name      = Column(String(200))

    # المبالغ
    base_salary        = Column(Float, default=0)
    allowances         = Column(Float, default=0)    # بدلات
    overtime           = Column(Float, default=0)    # أوفرتايم
    bonus              = Column(Float, default=0)    # مكافأة
    gross_salary       = Column(Float, default=0)    # إجمالي الراتب

    # الخصومات
    insurance_employee = Column(Float, default=0)    # تأمين الموظف
    insurance_company  = Column(Float, default=0)    # تأمين الشركة
    income_tax         = Column(Float, default=0)    # ضريبة دخل
    deductions_other   = Column(Float, default=0)    # خصومات أخرى
    advances_deduct    = Column(Float, default=0)    # خصم سلف
    total_deductions   = Column(Float, default=0)    # إجمالي الخصومات

    net_salary         = Column(Float, default=0)    # صافي الراتب
    paid               = Column(Boolean, default=False)
    payment_date       = Column(Date)
    notes              = Column(Text)
    created_at         = Column(DateTime, default=datetime.utcnow)
