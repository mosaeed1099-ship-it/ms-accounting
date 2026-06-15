"""
Office Financial Management — إدارة المكتب المالية
Admin-only endpoints
"""
import json
from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.office_finance import (
    OfficeRevenue, OfficeExpense, OfficeMonthSnapshot, PartnerConfig,
    REVENUE_CAT_LABELS, EXPENSE_CAT_LABELS
)
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/office", tags=["office-finance"])

MONTH_AR = ["","يناير","فبراير","مارس","أبريل","مايو","يونيو",
            "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]


def _admin_only(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "هذه الصفحة للمدير فقط")
    return current_user


def _auth(current_user: User = Depends(get_current_user)):
    return current_user


# ═══════════════════════════════════════════════════════════
#  SCHEMAS
# ═══════════════════════════════════════════════════════════

class RevenueIn(BaseModel):
    date: date
    category: str = "other"
    amount: float
    description: Optional[str] = None
    client_name: Optional[str] = None
    notes: Optional[str] = None

class ExpenseIn(BaseModel):
    date: date
    category: str = "other"
    amount: float
    description: str
    vendor: Optional[str] = None
    notes: Optional[str] = None

class PartnerIn(BaseModel):
    partner_key: Optional[str] = None
    partner_name: Optional[str] = None
    name: Optional[str] = None
    share_pct: float


# ═══════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════

def _rev_dict(r: OfficeRevenue) -> dict:
    return {
        "id": r.id, "date": str(r.date), "tx_date": str(r.date),
        "month": r.month, "year": r.year,
        "category": r.category,
        "category_label": REVENUE_CAT_LABELS.get(r.category, r.category),
        "amount": r.amount, "description": r.description,
        "client_name": r.client_name, "source_type": r.source_type,
        "is_auto": r.is_auto, "notes": r.notes,
        "created_at": str(r.created_at) if r.created_at else None,
    }

def _exp_dict(e: OfficeExpense) -> dict:
    return {
        "id": e.id, "date": str(e.date), "tx_date": str(e.date),
        "month": e.month, "year": e.year,
        "category": e.category,
        "category_label": EXPENSE_CAT_LABELS.get(e.category, e.category),
        "amount": e.amount, "description": e.description,
        "vendor": e.vendor, "source_type": e.source_type,
        "is_auto": e.is_auto, "notes": e.notes,
        "created_at": str(e.created_at) if e.created_at else None,
    }

def _get_partners(db: Session) -> List[PartnerConfig]:
    partners = db.query(PartnerConfig).filter(PartnerConfig.is_active == True).all()
    if not partners:
        # Seed defaults
        for key, name, pct in [("ms", "MS", 50.0), ("ahmed", "Ahmed", 50.0)]:
            db.add(PartnerConfig(partner_key=key, name=name, share_pct=pct))
        db.commit()
        partners = db.query(PartnerConfig).filter(PartnerConfig.is_active == True).all()
    return partners


# ═══════════════════════════════════════════════════════════
#  DASHBOARD KPIs
# ═══════════════════════════════════════════════════════════

@router.get("/dashboard")
def office_dashboard(
    year: int = Query(default=None),
    month: int = Query(default=None),
    db: Session = Depends(get_db),
    cu: User = Depends(_admin_only),
):
    today = date.today()
    y = year  or today.year
    m = month or today.month

    # Current period
    rev_q = db.query(func.sum(OfficeRevenue.amount)).filter(
        OfficeRevenue.year == y, OfficeRevenue.month == m)
    exp_q = db.query(func.sum(OfficeExpense.amount)).filter(
        OfficeExpense.year == y, OfficeExpense.month == m)

    total_rev  = rev_q.scalar() or 0
    total_exp  = exp_q.scalar() or 0
    net_profit = total_rev - total_exp
    margin_pct = (net_profit / total_rev * 100) if total_rev > 0 else 0

    # Previous period
    pm = m - 1 if m > 1 else 12
    py = y if m > 1 else y - 1
    prev_rev = db.query(func.sum(OfficeRevenue.amount)).filter(
        OfficeRevenue.year == py, OfficeRevenue.month == pm).scalar() or 0
    prev_exp = db.query(func.sum(OfficeExpense.amount)).filter(
        OfficeExpense.year == py, OfficeExpense.month == pm).scalar() or 0
    prev_net = prev_rev - prev_exp

    # Revenue by category
    rev_by_cat = db.query(OfficeRevenue.category, func.sum(OfficeRevenue.amount)).filter(
        OfficeRevenue.year == y, OfficeRevenue.month == m
    ).group_by(OfficeRevenue.category).all()
    rev_cats = [{"cat": c, "label": REVENUE_CAT_LABELS.get(c, c), "amount": float(a or 0)}
                for c, a in sorted(rev_by_cat, key=lambda x: -(x[1] or 0))]

    # Expense by category
    exp_by_cat = db.query(OfficeExpense.category, func.sum(OfficeExpense.amount)).filter(
        OfficeExpense.year == y, OfficeExpense.month == m
    ).group_by(OfficeExpense.category).all()
    exp_cats = [{"cat": c, "label": EXPENSE_CAT_LABELS.get(c, c), "amount": float(a or 0)}
                for c, a in sorted(exp_by_cat, key=lambda x: -(x[1] or 0))]

    # YTD (year to date)
    ytd_rev = db.query(func.sum(OfficeRevenue.amount)).filter(OfficeRevenue.year == y).scalar() or 0
    ytd_exp = db.query(func.sum(OfficeExpense.amount)).filter(OfficeExpense.year == y).scalar() or 0

    # Monthly trend (last 12 months)
    trend = []
    for i in range(11, -1, -1):
        tm = today.month - i
        ty = today.year
        while tm <= 0:
            tm += 12; ty -= 1
        r = db.query(func.sum(OfficeRevenue.amount)).filter(
            OfficeRevenue.year == ty, OfficeRevenue.month == tm).scalar() or 0
        e = db.query(func.sum(OfficeExpense.amount)).filter(
            OfficeExpense.year == ty, OfficeExpense.month == tm).scalar() or 0
        trend.append({"month": MONTH_AR[tm], "year": ty, "revenue": float(r), "expense": float(e), "profit": float(r-e)})

    # Partner distribution
    partners = _get_partners(db)
    total_pct = sum(p.share_pct for p in partners) or 100
    partner_dist = [{"key": p.partner_key, "name": p.name, "pct": p.share_pct,
                     "amount": round(net_profit * p.share_pct / total_pct, 2)} for p in partners]

    # New clients this month (from clients table)
    from app.models.client import Client
    new_clients = db.query(func.count(Client.id)).filter(
        func.extract("year",  Client.created_at) == y,
        func.extract("month", Client.created_at) == m,
    ).scalar() or 0

    return {
        "period": {"year": y, "month": m, "label": f"{MONTH_AR[m]} {y}"},
        "total_revenue":  round(total_rev, 2),
        "total_expense":  round(total_exp, 2),
        "net_profit":     round(net_profit, 2),
        "margin_pct":     round(margin_pct, 1),
        "prev_revenue":   round(prev_rev, 2),
        "prev_expense":   round(prev_exp, 2),
        "prev_net_profit":round(prev_net, 2),
        "ytd_revenue":    round(ytd_rev, 2),
        "ytd_expense":    round(ytd_exp, 2),
        "ytd_profit":     round(ytd_rev - ytd_exp, 2),
        "revenue_by_cat": rev_cats,
        "expense_by_cat": exp_cats,
        "trend":          trend,
        "partner_dist":   partner_dist,
        "new_clients":    new_clients,
        "top_revenue_cat": rev_cats[0]["label"] if rev_cats else "—",
        "top_expense_cat": exp_cats[0]["label"] if exp_cats else "—",
    }


# ═══════════════════════════════════════════════════════════
#  REVENUES
# ═══════════════════════════════════════════════════════════

@router.get("/revenues")
def list_revenues(
    year: Optional[int] = None, month: Optional[int] = None,
    category: Optional[str] = None,
    page: int = 1, page_size: int = 100,
    db: Session = Depends(get_db), cu: User = Depends(_auth),
):
    q = db.query(OfficeRevenue)
    if year:     q = q.filter(OfficeRevenue.year == year)
    if month:    q = q.filter(OfficeRevenue.month == month)
    if category: q = q.filter(OfficeRevenue.category == category)
    total = q.count()
    items = q.order_by(OfficeRevenue.date.desc(), OfficeRevenue.id.desc()) \
             .offset((page-1)*page_size).limit(page_size).all()
    total_amount = db.query(func.sum(OfficeRevenue.amount))
    if year:     total_amount = total_amount.filter(OfficeRevenue.year == year)
    if month:    total_amount = total_amount.filter(OfficeRevenue.month == month)
    return {"total": total, "total_amount": total_amount.scalar() or 0,
            "items": [_rev_dict(r) for r in items]}


@router.get("/revenues/{rev_id}")
def get_revenue(rev_id: int, db: Session = Depends(get_db), cu: User = Depends(_auth)):
    r = db.query(OfficeRevenue).filter(OfficeRevenue.id == rev_id).first()
    if not r: raise HTTPException(404)
    d = _rev_dict(r); d["tx_date"] = str(r.date); return d


@router.post("/revenues")
def add_revenue(data: RevenueIn, db: Session = Depends(get_db), cu: User = Depends(_auth)):
    r = OfficeRevenue(
        date=data.date, month=data.date.month, year=data.date.year,
        category=data.category, amount=data.amount,
        description=data.description, client_name=data.client_name,
        notes=data.notes, source_type="manual", is_auto=False, created_by=cu.id,
    )
    db.add(r); db.commit(); db.refresh(r)
    return _rev_dict(r)


@router.put("/revenues/{rev_id}")
def update_revenue(rev_id: int, data: RevenueIn, db: Session = Depends(get_db), cu: User = Depends(_auth)):
    r = db.query(OfficeRevenue).filter(OfficeRevenue.id == rev_id).first()
    if not r: raise HTTPException(404)
    r.date=data.date; r.month=data.date.month; r.year=data.date.year
    r.category=data.category; r.amount=data.amount; r.description=data.description
    r.client_name=data.client_name; r.notes=data.notes
    db.commit(); return _rev_dict(r)


@router.delete("/revenues/{rev_id}")
def delete_revenue(rev_id: int, db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    r = db.query(OfficeRevenue).filter(OfficeRevenue.id == rev_id).first()
    if not r: raise HTTPException(404)
    if r.is_auto: raise HTTPException(400, "لا يمكن حذف إيراد تلقائي — احذفه من المصدر")
    db.delete(r); db.commit()
    return {"message": "تم الحذف"}


# ═══════════════════════════════════════════════════════════
#  EXPENSES
# ═══════════════════════════════════════════════════════════

@router.get("/expenses")
def list_expenses(
    year: Optional[int] = None, month: Optional[int] = None,
    category: Optional[str] = None,
    page: int = 1, page_size: int = 100,
    db: Session = Depends(get_db), cu: User = Depends(_auth),
):
    q = db.query(OfficeExpense)
    if year:     q = q.filter(OfficeExpense.year == year)
    if month:    q = q.filter(OfficeExpense.month == month)
    if category: q = q.filter(OfficeExpense.category == category)
    total = q.count()
    items = q.order_by(OfficeExpense.date.desc(), OfficeExpense.id.desc()) \
             .offset((page-1)*page_size).limit(page_size).all()
    total_amount = db.query(func.sum(OfficeExpense.amount))
    if year:     total_amount = total_amount.filter(OfficeExpense.year == year)
    if month:    total_amount = total_amount.filter(OfficeExpense.month == month)
    return {"total": total, "total_amount": total_amount.scalar() or 0,
            "items": [_exp_dict(e) for e in items]}


@router.get("/expenses/{exp_id}")
def get_expense(exp_id: int, db: Session = Depends(get_db), cu: User = Depends(_auth)):
    e = db.query(OfficeExpense).filter(OfficeExpense.id == exp_id).first()
    if not e: raise HTTPException(404)
    d = _exp_dict(e); d["tx_date"] = str(e.date); return d


@router.post("/expenses")
def add_expense(data: ExpenseIn, db: Session = Depends(get_db), cu: User = Depends(_auth)):
    e = OfficeExpense(
        date=data.date, month=data.date.month, year=data.date.year,
        category=data.category, amount=data.amount,
        description=data.description, vendor=data.vendor,
        notes=data.notes, source_type="manual", is_auto=False, created_by=cu.id,
    )
    db.add(e); db.commit(); db.refresh(e)
    return _exp_dict(e)


@router.put("/expenses/{exp_id}")
def update_expense(exp_id: int, data: ExpenseIn, db: Session = Depends(get_db), cu: User = Depends(_auth)):
    e = db.query(OfficeExpense).filter(OfficeExpense.id == exp_id).first()
    if not e: raise HTTPException(404)
    e.date=data.date; e.month=data.date.month; e.year=data.date.year
    e.category=data.category; e.amount=data.amount; e.description=data.description
    e.vendor=data.vendor; e.notes=data.notes
    db.commit(); return _exp_dict(e)


@router.delete("/expenses/{exp_id}")
def delete_expense(exp_id: int, db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    e = db.query(OfficeExpense).filter(OfficeExpense.id == exp_id).first()
    if not e: raise HTTPException(404)
    if e.is_auto: raise HTTPException(400, "لا يمكن حذف مصروف تلقائي")
    db.delete(e); db.commit()
    return {"message": "تم الحذف"}


# ═══════════════════════════════════════════════════════════
#  PARTNERS
# ═══════════════════════════════════════════════════════════

@router.get("/partners")
def get_partners(db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    partners = _get_partners(db)
    # Calculate YTD profit for each partner
    from datetime import date as _date
    cur_year = _date.today().year
    total_rev = db.query(func.sum(OfficeRevenue.amount)).filter(OfficeRevenue.year == cur_year).scalar() or 0
    total_exp = db.query(func.sum(OfficeExpense.amount)).filter(OfficeExpense.year == cur_year).scalar() or 0
    net = total_rev - total_exp
    return [{"id": p.id, "partner_key": p.partner_key, "partner_name": p.name,
             "name": p.name, "share_pct": p.share_pct,
             "ytd_profit": round(net * p.share_pct / 100, 2) if net > 0 else 0}
            for p in partners]


@router.post("/partners")
def add_partner(data: PartnerIn, db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    name = data.partner_name or data.name or "شريك"
    import re, uuid
    key = re.sub(r'[^a-z0-9]', '', name.lower()) or str(uuid.uuid4())[:8]
    p = PartnerConfig(partner_key=key, name=name, share_pct=data.share_pct, is_active=True)
    db.add(p); db.commit(); db.refresh(p)
    return {"id": p.id, "partner_key": p.partner_key, "partner_name": p.name, "share_pct": p.share_pct}


@router.put("/partners/{partner_id}")
def update_partner(partner_id: int, data: PartnerIn,
                   db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    p = db.query(PartnerConfig).filter(PartnerConfig.id == partner_id).first()
    if not p: raise HTTPException(404)
    p.name = data.partner_name or data.name or p.name
    p.share_pct = data.share_pct
    p.is_active = True
    db.commit()
    return {"message": "تم التحديث"}


# ═══════════════════════════════════════════════════════════
#  MONTH CLOSING
# ═══════════════════════════════════════════════════════════

@router.get("/snapshots")
def list_snapshots(db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    snaps = db.query(OfficeMonthSnapshot).order_by(
        OfficeMonthSnapshot.year.desc(), OfficeMonthSnapshot.month.desc()).all()
    return [_snap_dict(s) for s in snaps]


class CloseMonthIn(BaseModel):
    year: int
    month: int

@router.post("/snapshots/close")
def close_month(
    data: CloseMonthIn,
    db: Session = Depends(get_db), cu: User = Depends(_admin_only),
):
    year, month = data.year, data.month
    existing = db.query(OfficeMonthSnapshot).filter_by(year=year, month=month).first()
    if existing and existing.closed:
        raise HTTPException(400, "الشهر مغلق بالفعل")

    # Build snapshot from current data
    total_rev = db.query(func.sum(OfficeRevenue.amount)).filter(
        OfficeRevenue.year == year, OfficeRevenue.month == month).scalar() or 0
    total_exp = db.query(func.sum(OfficeExpense.amount)).filter(
        OfficeExpense.year == year, OfficeExpense.month == month).scalar() or 0
    net = total_rev - total_exp

    rev_by_cat = dict(db.query(OfficeRevenue.category, func.sum(OfficeRevenue.amount)).filter(
        OfficeRevenue.year == year, OfficeRevenue.month == month
    ).group_by(OfficeRevenue.category).all())

    exp_by_cat = dict(db.query(OfficeExpense.category, func.sum(OfficeExpense.amount)).filter(
        OfficeExpense.year == year, OfficeExpense.month == month
    ).group_by(OfficeExpense.category).all())

    from app.models.client import Client
    new_clients = db.query(func.count(Client.id)).filter(
        func.extract("year",  Client.created_at) == year,
        func.extract("month", Client.created_at) == month,
    ).scalar() or 0

    partners = _get_partners(db)
    total_pct = sum(p.share_pct for p in partners) or 100
    ms_p    = next((p for p in partners if p.partner_key == "ms"),    None)
    ahmed_p = next((p for p in partners if p.partner_key == "ahmed"), None)
    ms_share    = net * (ms_p.share_pct / total_pct)    if ms_p    else net * 0.5
    ahmed_share = net * (ahmed_p.share_pct / total_pct) if ahmed_p else net * 0.5

    if existing:
        snap = existing
    else:
        snap = OfficeMonthSnapshot(year=year, month=month)
        db.add(snap)

    snap.total_revenue       = total_rev
    snap.total_expense       = total_exp
    snap.net_profit          = net
    snap.profit_margin_pct   = (net / total_rev * 100) if total_rev > 0 else 0
    snap.revenue_by_cat      = json.dumps({k: float(v) for k, v in rev_by_cat.items()})
    snap.expense_by_cat      = json.dumps({k: float(v) for k, v in exp_by_cat.items()})
    snap.new_clients_count   = new_clients
    snap.partner_ms_share    = round(ms_share, 2)
    snap.partner_ahmed_share = round(ahmed_share, 2)
    snap.closed              = True
    snap.closed_by           = cu.id
    snap.closed_at           = datetime.utcnow()

    db.commit()
    return {"message": f"✅ تم إغلاق {MONTH_AR[month]} {year}", "snapshot": _snap_dict(snap)}


@router.post("/snapshots/{snap_id}/reopen")
def reopen_month(snap_id: int, db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    snap = db.query(OfficeMonthSnapshot).filter(OfficeMonthSnapshot.id == snap_id).first()
    if not snap: raise HTTPException(404)
    snap.closed = False
    db.commit()
    return {"message": "تم إعادة فتح الشهر"}


def _snap_dict(s: OfficeMonthSnapshot) -> dict:
    return {
        "id": s.id, "year": s.year, "month": s.month,
        "label": f"{MONTH_AR[s.month]} {s.year}",
        "total_revenue": s.total_revenue, "total_expense": s.total_expense,
        "net_profit": s.net_profit, "profit_margin_pct": s.profit_margin_pct,
        "revenue_by_cat": json.loads(s.revenue_by_cat) if s.revenue_by_cat else {},
        "expense_by_cat": json.loads(s.expense_by_cat) if s.expense_by_cat else {},
        "new_clients_count": s.new_clients_count,
        "partner_ms_share": s.partner_ms_share,
        "partner_ahmed_share": s.partner_ahmed_share,
        "closed": s.closed,
        "closed_at": str(s.closed_at) if s.closed_at else None,
    }


# ═══════════════════════════════════════════════════════════
#  ANNUAL REPORT
# ═══════════════════════════════════════════════════════════

@router.get("/annual-report")
def annual_report(year: int, db: Session = Depends(get_db), cu: User = Depends(_admin_only)):
    months = []
    for m in range(1, 13):
        rev = db.query(func.sum(OfficeRevenue.amount)).filter(
            OfficeRevenue.year == year, OfficeRevenue.month == m).scalar() or 0
        exp = db.query(func.sum(OfficeExpense.amount)).filter(
            OfficeExpense.year == year, OfficeExpense.month == m).scalar() or 0
        months.append({
            "month": m, "label": MONTH_AR[m],
            "revenue": float(rev), "expense": float(exp), "profit": float(rev - exp),
        })

    total_rev = sum(m["revenue"] for m in months)
    total_exp = sum(m["expense"] for m in months)
    net = total_rev - total_exp

    rev_by_cat = db.query(OfficeRevenue.category, func.sum(OfficeRevenue.amount)).filter(
        OfficeRevenue.year == year).group_by(OfficeRevenue.category).all()
    exp_by_cat = db.query(OfficeExpense.category, func.sum(OfficeExpense.amount)).filter(
        OfficeExpense.year == year).group_by(OfficeExpense.category).all()

    partners = _get_partners(db)
    total_pct = sum(p.share_pct for p in partners) or 100

    return {
        "year": year,
        "months": months,
        "total_revenue": round(total_rev, 2),
        "total_expense": round(total_exp, 2),
        "net_profit":    round(net, 2),
        "margin_pct":    round(net / total_rev * 100 if total_rev > 0 else 0, 1),
        "revenue_by_cat": [{"cat": c, "label": REVENUE_CAT_LABELS.get(c,c), "amount": float(a or 0)}
                            for c,a in sorted(rev_by_cat, key=lambda x: -(x[1] or 0))],
        "expense_by_cat": [{"cat": c, "label": EXPENSE_CAT_LABELS.get(c,c), "amount": float(a or 0)}
                            for c,a in sorted(exp_by_cat, key=lambda x: -(x[1] or 0))],
        "partner_dist":  [{"key": p.partner_key, "name": p.name,
                           "amount": round(net * p.share_pct / total_pct, 2)}
                          for p in partners],
    }


# ═══════════════════════════════════════════════════════════
#  AUTO-CAPTURE HELPER (called from other routers)
# ═══════════════════════════════════════════════════════════

def auto_capture_revenue(
    db: Session,
    amount: float,
    category: str,
    tx_date: date,
    description: str,
    client_name: str = None,
    source_type: str = "manual",
    source_id: int = None,
    created_by: int = None,
):
    """Called automatically when a payment is recorded in any module."""
    if amount <= 0:
        return
    r = OfficeRevenue(
        date=tx_date, month=tx_date.month, year=tx_date.year,
        category=category, amount=amount, description=description,
        client_name=client_name, source_type=source_type, source_id=source_id,
        is_auto=True, created_by=created_by,
    )
    db.add(r)
    # Note: caller must db.commit()


@router.get("/report-pdf")
def download_report_pdf(
    year: int, month: Optional[int] = None,
    db: Session = Depends(get_db), cu: User = Depends(_admin_only),
):
    """Generate a simple HTML-based PDF report (plain text fallback if weasyprint not available)."""
    from fastapi.responses import HTMLResponse, Response
    if month:
        rev = db.query(func.sum(OfficeRevenue.amount)).filter(OfficeRevenue.year==year, OfficeRevenue.month==month).scalar() or 0
        exp = db.query(func.sum(OfficeExpense.amount)).filter(OfficeExpense.year==year, OfficeExpense.month==month).scalar() or 0
        period_label = f"{MONTH_AR[month]} {year}"
    else:
        rev = db.query(func.sum(OfficeRevenue.amount)).filter(OfficeRevenue.year==year).scalar() or 0
        exp = db.query(func.sum(OfficeExpense.amount)).filter(OfficeExpense.year==year).scalar() or 0
        period_label = f"عام {year}"

    net = rev - exp
    margin = (net/rev*100) if rev > 0 else 0
    partners = _get_partners(db)
    total_pct = sum(p.share_pct for p in partners) or 100

    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<style>
  body{{font-family:Arial,sans-serif;padding:40px;color:#1e293b;direction:rtl}}
  h1{{color:#1a2472;border-bottom:2px solid #1a2472;padding-bottom:10px}}
  table{{width:100%;border-collapse:collapse;margin-top:20px}}
  th{{background:#1a2472;color:white;padding:10px;text-align:right}}
  td{{padding:10px;border-bottom:1px solid #e2e8f0}}
  .kpi{{display:inline-block;margin:10px;padding:16px 24px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;min-width:150px;text-align:center}}
  .kpi .val{{font-size:22px;font-weight:700;color:#1a2472}}
  .kpi .lbl{{font-size:12px;color:#64748b;margin-top:4px}}
</style>
</head>
<body>
<h1>👑 تقرير المكتب المالي — {period_label}</h1>
<p style="color:#64748b">تاريخ الإصدار: {date.today()}</p>

<div style="margin:20px 0">
  <div class="kpi"><div class="val">{rev:,.0f} ج.م</div><div class="lbl">إجمالي الإيرادات</div></div>
  <div class="kpi"><div class="val">{exp:,.0f} ج.م</div><div class="lbl">إجمالي المصاريف</div></div>
  <div class="kpi"><div class="val">{net:,.0f} ج.م</div><div class="lbl">صافي الربح</div></div>
  <div class="kpi"><div class="val">{margin:.1f}%</div><div class="lbl">هامش الربح</div></div>
</div>

<h2>توزيع الأرباح</h2>
<table>
  <thead><tr><th>الشريك</th><th>النسبة</th><th>المبلغ</th></tr></thead>
  <tbody>
    {''.join(f'<tr><td>{p.name}</td><td>{p.share_pct}%</td><td>{net*p.share_pct/total_pct:,.0f} ج.م</td></tr>' for p in partners)}
  </tbody>
</table>

<p style="margin-top:40px;color:#94a3b8;font-size:12px">تم إنشاء هذا التقرير بواسطة نظام MS Accounting</p>
</body></html>"""

    return Response(content=html.encode('utf-8'), media_type="text/html",
                    headers={"Content-Disposition": f'attachment; filename="report-{year}-{month or "annual"}.html"'})


def auto_capture_expense(
    db: Session,
    amount: float,
    category: str,
    tx_date: date,
    description: str,
    vendor: str = None,
    source_type: str = "manual",
    source_id: int = None,
    created_by: int = None,
):
    """Called automatically when an expense is recorded."""
    if amount <= 0:
        return
    e = OfficeExpense(
        date=tx_date, month=tx_date.month, year=tx_date.year,
        category=category, amount=amount, description=description,
        vendor=vendor, source_type=source_type, source_id=source_id,
        is_auto=True, created_by=created_by,
    )
    db.add(e)
