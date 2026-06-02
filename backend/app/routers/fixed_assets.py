"""
Fixed Assets Router — الأصول الثابتة
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.fixed_asset import FixedAsset, AssetDepreciation

router = APIRouter(prefix="/api/assets", tags=["fixed_assets"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class AssetIn(BaseModel):
    client_id: Optional[int] = None
    asset_number: Optional[str] = None
    name: str
    category: Optional[str] = None
    purchase_date: date
    purchase_value: float
    useful_life_years: float = 5
    residual_value: float = 0
    depreciation_method: str = "straight_line"
    location: Optional[str] = None
    serial_number: Optional[str] = None
    supplier: Optional[str] = None
    notes: Optional[str] = None

# ── Helpers ───────────────────────────────────────────────────────────────────

def _calc_depreciation(asset: FixedAsset):
    """حساب الإهلاك السنوي والقيمة الدفترية"""
    depreciable = asset.purchase_value - asset.residual_value
    if asset.useful_life_years <= 0:
        return 0, asset.accumulated_dep, asset.purchase_value - asset.accumulated_dep

    if asset.depreciation_method == "straight_line":
        annual = round(depreciable / asset.useful_life_years, 2)
    else:  # declining balance — 2x straight line
        rate = 2 / asset.useful_life_years
        book = asset.purchase_value - asset.accumulated_dep
        annual = round(max(0, book * rate), 2)

    book_value = max(asset.residual_value,
                     round(asset.purchase_value - asset.accumulated_dep, 2))
    return annual, asset.accumulated_dep, book_value


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_assets(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(FixedAsset)
    if client_id is not None:
        q = q.filter(FixedAsset.client_id == client_id)
    if status:
        q = q.filter(FixedAsset.status == status)
    if category:
        q = q.filter(FixedAsset.category == category)
    assets = q.order_by(FixedAsset.purchase_date.desc()).all()
    result = []
    for a in assets:
        annual, accum, book = _calc_depreciation(a)
        d = a.__dict__.copy()
        d.pop("_sa_instance_state", None)
        d["annual_depreciation"] = annual
        d["book_value"] = book
        result.append(d)
    return result


@router.post("")
def create_asset(
    body: AssetIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    data = body.dict()
    asset = FixedAsset(**data, created_by=current_user.id)
    # Calculate initial annual depreciation
    depreciable = asset.purchase_value - asset.residual_value
    if asset.useful_life_years > 0:
        asset.annual_depreciation = round(depreciable / asset.useful_life_years, 2)
    asset.book_value = asset.purchase_value
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.put("/{asset_id}")
def update_asset(
    asset_id: int,
    body: AssetIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(FixedAsset).filter(FixedAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(404, "أصل غير موجود")
    for k, v in body.dict().items():
        setattr(asset, k, v)
    depreciable = asset.purchase_value - asset.residual_value
    if asset.useful_life_years > 0:
        asset.annual_depreciation = round(depreciable / asset.useful_life_years, 2)
    asset.book_value = max(asset.residual_value,
                           asset.purchase_value - asset.accumulated_dep)
    asset.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(asset)
    return asset


@router.post("/{asset_id}/depreciate")
def run_depreciation(
    asset_id: int,
    year: int = Query(...),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """تشغيل الإهلاك لسنة/شهر معين"""
    asset = db.query(FixedAsset).filter(FixedAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(404)
    if asset.status == "disposed":
        raise HTTPException(400, "الأصل مُستبعد")

    annual, accum, book = _calc_depreciation(asset)
    dep_amount = round(annual / 12, 2) if month else annual

    dep = AssetDepreciation(
        asset_id=asset_id,
        period_year=year,
        period_month=month,
        amount=dep_amount,
        book_value_after=max(asset.residual_value, book - dep_amount),
    )
    db.add(dep)

    asset.accumulated_dep = round(asset.accumulated_dep + dep_amount, 2)
    asset.book_value = max(asset.residual_value,
                           asset.purchase_value - asset.accumulated_dep)
    asset.last_dep_date = date(year, month or 12, 1)
    if asset.book_value <= asset.residual_value:
        asset.status = "fully_depreciated"

    db.commit()
    return {"ok": True, "amount": dep_amount, "book_value": asset.book_value}


@router.put("/{asset_id}/dispose")
def dispose_asset(
    asset_id: int,
    disposal_date: date = Query(...),
    disposal_value: float = Query(0),
    disposal_reason: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(FixedAsset).filter(FixedAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(404)
    asset.status = "disposed"
    asset.disposal_date = disposal_date
    asset.disposal_value = disposal_value
    asset.disposal_reason = disposal_reason
    asset.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(FixedAsset).filter(FixedAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(404)
    db.query(AssetDepreciation).filter(AssetDepreciation.asset_id == asset_id).delete()
    db.delete(asset)
    db.commit()
    return {"ok": True}


@router.get("/stats")
def asset_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total = db.query(FixedAsset).filter(FixedAsset.status == "active").count()
    total_value = db.query(func.sum(FixedAsset.purchase_value)).filter(
        FixedAsset.status == "active").scalar() or 0
    total_book = db.query(func.sum(FixedAsset.book_value)).filter(
        FixedAsset.status == "active").scalar() or 0
    total_dep = db.query(func.sum(FixedAsset.accumulated_dep)).filter(
        FixedAsset.status != "disposed").scalar() or 0
    return {
        "total_assets": total,
        "total_purchase_value": total_value,
        "total_book_value": total_book,
        "total_accumulated_dep": total_dep,
    }
