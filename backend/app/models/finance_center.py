"""
المركز المالي — Finance Center Models
تحصيلات يومية من الموظفين + مصاريف يدوية للمدير فقط
"""
from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, Boolean, ForeignKey
from app.database import Base


class FinanceCollection(Base):
    """تحصيلات يومية — يضيفها الموظف، تختفي من عنده بعد اليوم، تبقى للمدير دايماً"""
    __tablename__ = "finance_collections"

    id              = Column(Integer, primary_key=True, index=True)
    date            = Column(Date, nullable=False, default=date.today, index=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    client_name     = Column(String(300), nullable=False)
    billing_month   = Column(Integer, nullable=False)   # الشهر المسدَّد عنه
    billing_year    = Column(Integer, nullable=False)
    amount          = Column(Float, nullable=False)
    payment_method  = Column(String(50), default="cash")  # cash|transfer|instapay|check
    note            = Column(Text)
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class FinanceManualExpense(Base):
    """مصاريف يدوية — للمدير فقط، لا يراها الموظفون"""
    __tablename__ = "finance_manual_expenses"

    id          = Column(Integer, primary_key=True, index=True)
    date        = Column(Date, nullable=False, default=date.today, index=True)
    month       = Column(Integer, nullable=False, index=True)
    year        = Column(Integer, nullable=False, index=True)
    description = Column(String(500), nullable=False)
    category    = Column(String(50), default="other")
    amount      = Column(Float, nullable=False)
    payment_method = Column(String(50), default="cash")
    note        = Column(Text)
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
