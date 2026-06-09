"""
تسويات الموظفين + المواعيد + الأوراق الحكومية
Employee Settlements · Appointments · Government Papers
"""
import json
import logging
from datetime import datetime, date
from typing import Optional, List
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.settlement import EmployeeSettlement, EmployeeCustody, Appointment, GovernmentPaper

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settlements", tags=["Settlements"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class ExpenseItem(BaseModel):
    description: str
    amount:      float = 0

class SettlementIn(BaseModel):
    employee_name:  str
    date:           str           # YYYY-MM-DD
    reason:         Optional[str] = None
    expense_items:  List[ExpenseItem] = []
    custody_added:  float = 0
    notes:          Optional[str] = None

class CustodyTopUp(BaseModel):
    employee_name: str
    amount:        float
    notes:         Optional[str] = None

class AppointmentIn(BaseModel):
    title:         str
    client_id:     Optional[int]  = None
    client_name:   Optional[str]  = None
    employee_name: Optional[str]  = None
    appt_date:     str
    appt_time:     Optional[str]  = None
    location:      Optional[str]  = None
    description:   Optional[str]  = None
    status:        Optional[str]  = "pending"

class GovernmentPaperIn(BaseModel):
    client_id:    int
    client_name:  Optional[str]  = None
    paper_type:   str
    paper_number: Optional[str]  = None
    issue_date:   Optional[str]  = None
    expiry_date:  Optional[str]  = None
    status:       Optional[str]  = "active"
    has_copy:     bool = False
    notes:        Optional[str]  = None


# ════════════════════════════════════════════════════════════════════
# SETTLEMENTS (تسويات الموظفين)
# ════════════════════════════════════════════════════════════════════

def _get_or_create_custody(name: str, db: Session) -> EmployeeCustody:
    c = db.query(EmployeeCustody).filter(EmployeeCustody.employee_name == name).first()
    if not c:
        c = EmployeeCustody(employee_name=name)
        db.add(c)
        db.flush()
    return c


@router.get("/employees")
def list_employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """قائمة الموظفين مع رصيد عهدتهم الحالي."""
    custodies = db.query(EmployeeCustody).order_by(EmployeeCustody.employee_name).all()
    result = []
    for c in custodies:
        last = (db.query(EmployeeSettlement)
                .filter(EmployeeSettlement.employee_name == c.employee_name)
                .order_by(EmployeeSettlement.date.desc())
                .first())
        result.append({
            "employee_name":  c.employee_name,
            "current_balance": c.current_balance,
            "total_given":    c.total_given,
            "total_spent":    c.total_spent,
            "last_settlement": str(last.date) if last else None,
        })
    return result


@router.post("/employees")
def add_employee(
    payload: CustodyTopUp,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """إضافة موظف جديد بعهدة افتتاحية."""
    existing = db.query(EmployeeCustody).filter(
        EmployeeCustody.employee_name == payload.employee_name.strip()
    ).first()
    if existing:
        raise HTTPException(400, "الموظف موجود بالفعل")
    c = EmployeeCustody(
        employee_name   = payload.employee_name.strip(),
        current_balance = payload.amount,
        total_given     = payload.amount,
        notes           = payload.notes,
    )
    db.add(c)
    db.commit()
    return {"message": f"✅ تمت إضافة {c.employee_name} بعهدة {payload.amount:.2f} ج.م."}


@router.post("/custody/topup")
def topup_custody(
    payload: CustodyTopUp,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """إضافة عهدة إضافية لموظف."""
    c = _get_or_create_custody(payload.employee_name.strip(), db)
    c.current_balance += payload.amount
    c.total_given     += payload.amount
    c.updated_at       = datetime.utcnow()
    db.commit()
    return {
        "message":         f"✅ تمت إضافة {payload.amount:.2f} ج.م. للعهدة",
        "new_balance":     c.current_balance,
    }


@router.post("/employees/{employee_name}/reset")
def reset_employee(
    employee_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """مسح كل تسويات الموظف وتصفير رصيده مع الاحتفاظ باسمه."""
    custody = db.query(EmployeeCustody).filter(
        EmployeeCustody.employee_name == employee_name
    ).first()
    if not custody:
        raise HTTPException(404, "الموظف غير موجود")
    db.query(EmployeeSettlement).filter(
        EmployeeSettlement.employee_name == employee_name
    ).delete(synchronize_session=False)
    custody.current_balance      = 0
    custody.total_given          = 0
    custody.total_spent          = 0
    custody.last_settlement_date = None
    custody.updated_at           = datetime.utcnow()
    db.commit()
    return {"message": f"✅ تم تصفير رصيد {employee_name} وحذف جميع التسويات"}


@router.get("/employees/{employee_name}")
def employee_detail(
    employee_name: str,
    month: Optional[int] = None,
    year:  Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تفاصيل موظف + سجل تسوياته."""
    custody = _get_or_create_custody(employee_name, db)

    q = db.query(EmployeeSettlement).filter(
        EmployeeSettlement.employee_name == employee_name
    )
    if month: q = q.filter(EmployeeSettlement.month == month)
    if year:  q = q.filter(EmployeeSettlement.year  == year)
    settlements = q.order_by(EmployeeSettlement.date.desc()).all()

    return {
        "employee_name":   custody.employee_name,
        "current_balance": custody.current_balance,
        "total_given":     custody.total_given,
        "total_spent":     custody.total_spent,
        "last_settlement": str(custody.last_settlement_date) if custody.last_settlement_date else None,
        "settlements": [_s_dict(s) for s in settlements],
    }


@router.post("")
def add_settlement(
    payload: SettlementIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تسجيل تسوية يومية جديدة."""
    name = payload.employee_name.strip()
    custody = _get_or_create_custody(name, db)

    try:
        d = datetime.strptime(payload.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "تاريخ غير صحيح")

    items      = [{"description": i.description, "amount": round(i.amount, 2)} for i in payload.expense_items]
    total_spent = round(sum(i["amount"] for i in items), 2)
    opening     = custody.current_balance
    closing     = round(opening + payload.custody_added - total_spent, 2)

    s = EmployeeSettlement(
        employee_name   = name,
        date            = d,
        month           = d.month,
        year            = d.year,
        reason          = payload.reason,
        expense_items   = json.dumps(items, ensure_ascii=False),
        total_spent     = total_spent,
        opening_balance = round(opening, 2),
        custody_added   = payload.custody_added,
        closing_balance = closing,
        notes           = payload.notes,
        created_by      = current_user.id,
    )
    db.add(s)

    # update custody balance
    custody.current_balance  = round(closing, 2)
    custody.total_given     += payload.custody_added
    custody.total_spent     += total_spent
    custody.last_settlement_date = d
    custody.updated_at       = datetime.utcnow()

    db.commit()
    db.refresh(s)
    return {
        "message":          "✅ تمت إضافة التسوية",
        "id":               s.id,
        "total_spent":      s.total_spent,
        "closing_balance":  s.closing_balance,
    }


@router.get("/{settlement_id}")
def get_settlement(
    settlement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(EmployeeSettlement).filter(EmployeeSettlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "التسوية غير موجودة")
    return _s_dict(s)


@router.put("/{settlement_id}")
def update_settlement(
    settlement_id: int,
    payload: SettlementIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تعديل تسوية موجودة مع تصحيح رصيد العهدة."""
    s = db.query(EmployeeSettlement).filter(EmployeeSettlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "التسوية غير موجودة")

    try:
        d = datetime.strptime(payload.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "تاريخ غير صحيح")

    custody = _get_or_create_custody(s.employee_name, db)

    # 1) ارجع الأثر القديم على العهدة
    custody.current_balance += s.total_spent
    custody.current_balance -= (s.custody_added or 0)
    custody.total_spent     -= (s.total_spent or 0)
    custody.total_given     -= (s.custody_added or 0)

    # 2) احسب القيم الجديدة
    items       = [{"description": i.description, "amount": round(i.amount, 2)} for i in payload.expense_items]
    total_spent = round(sum(i["amount"] for i in items), 2)
    opening     = round(custody.current_balance, 2)
    closing     = round(opening + payload.custody_added - total_spent, 2)

    # 3) حدّث السجل
    s.date            = d
    s.month           = d.month
    s.year            = d.year
    s.reason          = payload.reason
    s.expense_items   = json.dumps(items, ensure_ascii=False)
    s.total_spent     = total_spent
    s.opening_balance = opening
    s.custody_added   = payload.custody_added
    s.closing_balance = closing
    s.notes           = payload.notes
    s.updated_at      = datetime.utcnow()

    # 4) طبّق الأثر الجديد على العهدة
    custody.current_balance  = closing
    custody.total_spent     += total_spent
    custody.total_given     += payload.custody_added
    custody.last_settlement_date = d
    custody.updated_at       = datetime.utcnow()

    db.commit()
    db.refresh(s)
    return {
        "message":         "✅ تم تعديل التسوية",
        "id":              s.id,
        "total_spent":     s.total_spent,
        "closing_balance": s.closing_balance,
    }


@router.delete("/{settlement_id}")
def delete_settlement(
    settlement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(EmployeeSettlement).filter(EmployeeSettlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "التسوية غير موجودة")
    # reverse the custody balance
    custody = _get_or_create_custody(s.employee_name, db)
    custody.current_balance += s.total_spent
    custody.current_balance -= s.custody_added
    custody.total_spent     -= s.total_spent
    custody.total_given     -= s.custody_added
    db.delete(s)
    db.commit()
    return {"message": "✅ تم حذف التسوية وتعديل رصيد العهدة"}


@router.get("/daily")
def daily_report(
    date_str: str,               # ?date=YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تسويات يوم محدد لكل الموظفين."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "تاريخ غير صحيح — استخدم YYYY-MM-DD")

    settlements = (
        db.query(EmployeeSettlement)
        .filter(EmployeeSettlement.date == d)
        .order_by(EmployeeSettlement.employee_name)
        .all()
    )

    grand_total = round(sum(s.total_spent or 0 for s in settlements), 2)
    grand_custody = round(sum(s.custody_added or 0 for s in settlements), 2)

    return {
        "date":          str(d),
        "count":         len(settlements),
        "grand_total":   grand_total,
        "grand_custody": grand_custody,
        "settlements":   [_s_dict_full(s) for s in settlements],
    }


@router.get("/monthly/{month}/{year}")
def monthly_report(
    month: int,
    year:  int,
    employee_name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تقرير شهري لكل التسويات."""
    q = db.query(EmployeeSettlement).filter(
        EmployeeSettlement.month == month,
        EmployeeSettlement.year  == year,
    )
    if employee_name:
        q = q.filter(EmployeeSettlement.employee_name == employee_name)
    settlements = q.order_by(EmployeeSettlement.employee_name, EmployeeSettlement.date).all()

    # group by employee
    by_emp: dict = {}
    for s in settlements:
        n = s.employee_name
        if n not in by_emp:
            by_emp[n] = {"employee": n, "settlements": [], "total_spent": 0,
                         "total_transportation": 0, "total_meals": 0, "total_other": 0}
        by_emp[n]["settlements"].append(_s_dict_full(s))
        by_emp[n]["total_spent"]         += s.total_spent or 0
        by_emp[n]["total_transportation"] += s.transportation or 0
        by_emp[n]["total_meals"]          += s.meals or 0
        by_emp[n]["total_other"]          += s.other_expenses or 0

    return {
        "month": month,
        "year":  year,
        "employees": list(by_emp.values()),
        "grand_total": round(sum(s.total_spent or 0 for s in settlements), 2),
        "count": len(settlements),
    }


def _s_dict(s: EmployeeSettlement) -> dict:
    try:
        items = json.loads(s.expense_items or "[]")
    except Exception:
        items = []
    return {
        "id":              s.id,
        "date":            str(s.date),
        "reason":          s.reason,
        "expense_items":   items,
        "total_spent":     s.total_spent,
        "opening_balance": s.opening_balance,
        "custody_added":   s.custody_added,
        "closing_balance": s.closing_balance,
        "notes":           s.notes,
        "created_at":      str(s.created_at),
    }

def _s_dict_full(s: EmployeeSettlement) -> dict:
    """Like _s_dict but includes employee_name — used in daily/monthly aggregates."""
    d = _s_dict(s)
    d["employee_name"] = s.employee_name
    return d


# ════════════════════════════════════════════════════════════════════
# APPOINTMENTS (جدول المواعيد)
# ════════════════════════════════════════════════════════════════════

appt_router = APIRouter(prefix="/api/appointments", tags=["Appointments"])


@appt_router.get("")
def list_appointments(
    month: Optional[int] = None,
    year:  Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Appointment)
    if month: q = q.filter(Appointment.appt_date >= date(year or date.today().year, month, 1))
    if year and month:
        _, last = monthrange(year, month)
        q = q.filter(Appointment.appt_date <= date(year, month, last))
    if status: q = q.filter(Appointment.status == status)
    appts = q.order_by(Appointment.appt_date, Appointment.appt_time).all()
    return [_a_dict(a) for a in appts]


@appt_router.post("")
def create_appointment(
    payload: AppointmentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        d = datetime.strptime(payload.appt_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "تاريخ غير صحيح")
    a = Appointment(
        title         = payload.title,
        client_id     = payload.client_id,
        client_name   = payload.client_name,
        employee_name = payload.employee_name,
        appt_date     = d,
        appt_time     = payload.appt_time,
        location      = payload.location,
        description   = payload.description,
        status        = payload.status or "pending",
        created_by    = current_user.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"message": "✅ تمت إضافة الموعد", "id": a.id}


@appt_router.patch("/{appt_id}/status")
def update_appt_status(
    appt_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a = db.query(Appointment).filter(Appointment.id == appt_id).first()
    if not a: raise HTTPException(404, "الموعد غير موجود")
    a.status = payload.get("status", a.status)
    a.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "✅ تم تحديث الحالة"}


@appt_router.delete("/{appt_id}")
def delete_appointment(
    appt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a = db.query(Appointment).filter(Appointment.id == appt_id).first()
    if not a: raise HTTPException(404, "الموعد غير موجود")
    db.delete(a)
    db.commit()
    return {"message": "✅ تم حذف الموعد"}


def _a_dict(a: Appointment) -> dict:
    return {
        "id": a.id, "title": a.title, "client_id": a.client_id,
        "client_name": a.client_name, "employee_name": a.employee_name,
        "appt_date": str(a.appt_date), "appt_time": a.appt_time,
        "location": a.location, "description": a.description, "status": a.status,
    }


# ════════════════════════════════════════════════════════════════════
# GOVERNMENT PAPERS (الأوراق الحكومية)
# ════════════════════════════════════════════════════════════════════

papers_router = APIRouter(prefix="/api/government-papers", tags=["Government Papers"])


@papers_router.get("")
def list_papers(
    client_id: Optional[int] = None,
    status:    Optional[str] = None,
    expiring_days: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import timedelta
    q = db.query(GovernmentPaper)
    if client_id: q = q.filter(GovernmentPaper.client_id == client_id)
    if status:    q = q.filter(GovernmentPaper.status == status)
    if expiring_days:
        cutoff = date.today() + timedelta(days=expiring_days)
        q = q.filter(GovernmentPaper.expiry_date <= cutoff,
                     GovernmentPaper.expiry_date >= date.today())
    papers = q.order_by(GovernmentPaper.expiry_date).all()
    # auto-update status
    today = date.today()
    for p in papers:
        if p.expiry_date:
            days_left = (p.expiry_date - today).days
            if days_left < 0:
                p.status = "expired"
            elif days_left <= 30:
                p.status = "expiring_soon"
    db.commit()
    return [_p_dict(p) for p in papers]


@papers_router.get("/alerts")
def paper_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تنبيهات الأوراق المنتهية أو قريبة الانتهاء."""
    from datetime import timedelta
    today = date.today()
    soon  = today + timedelta(days=60)
    papers = db.query(GovernmentPaper).filter(
        GovernmentPaper.expiry_date != None,
        GovernmentPaper.expiry_date <= soon,
        GovernmentPaper.status != "cancelled",
    ).order_by(GovernmentPaper.expiry_date).all()
    expired    = [_p_dict(p) for p in papers if p.expiry_date < today]
    expiring   = [_p_dict(p) for p in papers if today <= p.expiry_date <= soon]
    return {"expired": expired, "expiring_soon": expiring}


@papers_router.post("")
def create_paper(
    payload: GovernmentPaperIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    def _parse_date(s):
        if not s: return None
        try: return datetime.strptime(s, "%Y-%m-%d").date()
        except: return None

    p = GovernmentPaper(
        client_id    = payload.client_id,
        client_name  = payload.client_name,
        paper_type   = payload.paper_type,
        paper_number = payload.paper_number,
        issue_date   = _parse_date(payload.issue_date),
        expiry_date  = _parse_date(payload.expiry_date),
        status       = payload.status or "active",
        has_copy     = payload.has_copy,
        notes        = payload.notes,
        created_by   = current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"message": "✅ تمت الإضافة", "id": p.id}


@papers_router.put("/{paper_id}")
def update_paper(
    paper_id: int,
    payload: GovernmentPaperIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    def _parse_date(s):
        if not s: return None
        try: return datetime.strptime(s, "%Y-%m-%d").date()
        except: return None
    p = db.query(GovernmentPaper).filter(GovernmentPaper.id == paper_id).first()
    if not p: raise HTTPException(404, "الورقة غير موجودة")
    p.paper_type   = payload.paper_type
    p.paper_number = payload.paper_number
    p.issue_date   = _parse_date(payload.issue_date)
    p.expiry_date  = _parse_date(payload.expiry_date)
    p.status       = payload.status or p.status
    p.has_copy     = payload.has_copy
    p.notes        = payload.notes
    p.updated_at   = datetime.utcnow()
    db.commit()
    return {"message": "✅ تم التحديث"}


@papers_router.delete("/{paper_id}")
def delete_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(GovernmentPaper).filter(GovernmentPaper.id == paper_id).first()
    if not p: raise HTTPException(404, "الورقة غير موجودة")
    db.delete(p)
    db.commit()
    return {"message": "✅ تم الحذف"}


def _p_dict(p: GovernmentPaper) -> dict:
    from datetime import timedelta
    today = date.today()
    days_left = (p.expiry_date - today).days if p.expiry_date else None
    return {
        "id": p.id, "client_id": p.client_id, "client_name": p.client_name,
        "paper_type": p.paper_type, "paper_number": p.paper_number,
        "issue_date": str(p.issue_date) if p.issue_date else None,
        "expiry_date": str(p.expiry_date) if p.expiry_date else None,
        "days_left": days_left, "status": p.status,
        "has_copy": p.has_copy, "notes": p.notes,
    }
