"""
الأصول الثابتة — Fixed Assets Module
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Date, ForeignKey, Boolean
from datetime import datetime
from app.database import Base


class FixedAsset(Base):
    """سجل الأصول الثابتة"""
    __tablename__ = "fixed_assets"

    id                  = Column(Integer, primary_key=True, index=True)
    client_id           = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    # nullable → أصول المكتب نفسه إذا client_id = None

    asset_number        = Column(String(50), index=True)   # رقم الأصل
    name                = Column(String(200), nullable=False)
    category            = Column(String(100))
    # عقارات | سيارات | أثاث | أجهزة | معدات | برامج

    purchase_date       = Column(Date, nullable=False)
    purchase_value      = Column(Float, nullable=False, default=0)   # تكلفة الشراء
    useful_life_years   = Column(Float, default=5)           # العمر الإنتاجي (سنوات)
    residual_value      = Column(Float, default=0)           # القيمة المتبقية
    depreciation_method = Column(String(30), default="straight_line")
    # straight_line | declining_balance

    # محسوبة
    annual_depreciation = Column(Float, default=0)    # الإهلاك السنوي
    accumulated_dep     = Column(Float, default=0)    # مجمع الإهلاك حتى الآن
    book_value          = Column(Float, default=0)    # القيمة الدفترية

    location            = Column(String(200))         # مكان الأصل
    serial_number       = Column(String(100))
    supplier            = Column(String(200))
    status              = Column(String(20), default="active")
    # active | disposed | fully_depreciated | under_maintenance

    disposal_date       = Column(Date)
    disposal_value      = Column(Float, default=0)
    disposal_reason     = Column(Text)

    last_dep_date       = Column(Date)    # آخر تاريخ إهلاك
    notes               = Column(Text)
    created_by          = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AssetDepreciation(Base):
    """سجل الإهلاك السنوي/الشهري"""
    __tablename__ = "asset_depreciations"

    id           = Column(Integer, primary_key=True, index=True)
    asset_id     = Column(Integer, ForeignKey("fixed_assets.id"), nullable=False, index=True)
    period_year  = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=True)   # None = سنوي
    amount       = Column(Float, nullable=False, default=0)
    book_value_after = Column(Float, default=0)     # القيمة الدفترية بعد الإهلاك
    notes        = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow)
