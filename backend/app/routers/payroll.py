"""
Payroll Router — إدارة الرواتب والموظفين
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.payroll import Employee, PayrollRun, PayrollItem

router = APIRouter(prefix="/api/payroll", tags=["payroll"])

# ── Schemas ──────────────────────────────────────────────────────────────────

class EmployeeIn(BaseModel):
    client_id: Optional[int] = None
    name: str
    national_id: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    hire_date: Optional[date] = None
    insurance_start_date: Optional[date] = None
    base_salary: float = 0
    variable_pay: Optional[float] = 0      # متغيرات / بونص
    allowances: Optional[float] = 0        # بدلات معفاة
    insurance_number: Optional[str] = None
    insurance_share: float = 11.0
    company_insurance: float = 18.75
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

class PayrollItemIn(BaseModel):
    employee_id: int
    base_salary: float = 0
    allowances: float = 0
    overtime: float = 0
    bonus: float = 0
    deductions_other: float = 0
    advances_deduct: float = 0
    notes: Optional[str] = None

class PayrollRunIn(BaseModel):
    month: int
    year: int
    notes: Optional[str] = None
    items: List[PayrollItemIn] = []

# ── Employees ─────────────────────────────────────────────────────────────────

def _calc_employee_tax(emp) -> dict:
    """حساب ضريبة وتأمينات موظف واحد"""
    base = emp.base_salary or 0
    variable = getattr(emp, 'variable_pay', 0) or 0
    allow = getattr(emp, 'allowances', 0) or 0
    gross = base + variable
    ins_base = min(max(base, 2500), 9400)
    ins_emp  = round(ins_base * (emp.insurance_share or 11) / 100, 2)
    ins_comp = round(ins_base * (emp.company_insurance or 18.75) / 100, 2)
    # Monthly taxable
    taxable_monthly = max(0, gross - allow - ins_emp - 1666.67)
    # Annual progressive tax
    annual_taxable = taxable_monthly * 12
    exempt = 20000
    t = max(0, annual_taxable - exempt)
    brackets = [(40000,0),(15000,10),(20000,15),(20000,20),(100000,22.5),(205000,25)]
    tax = 0.0
    for size, rate in brackets:
        if t <= 0: break
        portion = min(t, size)
        tax += round(portion * rate / 100, 2)
        t -= portion
    if t > 0: tax += round(t * 27.5 / 100, 2)
    monthly_tax = round(tax / 12, 2)
    net = round(gross - ins_emp - monthly_tax, 2)
    return {
        "gross": gross, "variable": variable, "allowances": allow,
        "ins_emp": ins_emp, "ins_comp": ins_comp,
        "monthly_tax": monthly_tax, "net": net,
    }


@router.get("/employees")
def list_employees(
    status: Optional[str] = None,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(Employee)
    if status:
        q = q.filter(Employee.status == status)
    else:
        q = q.filter(Employee.status != "terminated")
    if client_id is not None:
        q = q.filter(Employee.client_id == client_id)
    else:
        q = q.filter(Employee.client_id == None)
    emps = q.order_by(Employee.name).all()
    result = []
    for e in emps:
        d = {c.name: getattr(e, c.name) for c in e.__table__.columns}
        d.update(_calc_employee_tax(e))
        result.append(d)
    return result


@router.post("/employees")
def create_employee(
    body: EmployeeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    emp = Employee(**body.dict(), created_by=current_user.id)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@router.put("/employees/{emp_id}")
def update_employee(
    emp_id: int,
    body: EmployeeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "موظف غير موجود")
    for k, v in body.dict().items():
        setattr(emp, k, v)
    emp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/employees/{emp_id}")
def delete_employee(
    emp_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "موظف غير موجود")
    db.delete(emp)
    db.commit()
    return {"ok": True}

# ── Payroll Runs ──────────────────────────────────────────────────────────────

@router.get("/runs")
def list_runs(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(PayrollRun)
    if year:
        q = q.filter(PayrollRun.year == year)
    return q.order_by(PayrollRun.year.desc(), PayrollRun.month.desc()).all()


@router.get("/runs/{run_id}")
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "مسير غير موجود")
    items = db.query(PayrollItem).filter(PayrollItem.run_id == run_id).all()
    return {"run": run, "items": items}


@router.post("/runs")
def create_run(
    body: PayrollRunIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check duplicate
    existing = db.query(PayrollRun).filter(
        PayrollRun.month == body.month,
        PayrollRun.year == body.year
    ).first()
    if existing:
        raise HTTPException(400, f"يوجد مسير لشهر {body.month}/{body.year} بالفعل")

    run = PayrollRun(month=body.month, year=body.year, notes=body.notes, created_by=current_user.id)
    db.add(run)
    db.flush()

    total_gross = total_deduct = total_net = 0.0

    for it in body.items:
        emp = db.query(Employee).filter(Employee.id == it.employee_id).first()
        if not emp:
            continue

        gross = it.base_salary + it.allowances + it.overtime + it.bonus
        ins_emp = round(it.base_salary * (emp.insurance_share / 100), 2)
        ins_co  = round(it.base_salary * (emp.company_insurance / 100), 2)
        # Simple income tax: 0 if gross <= 4000, 10% if <= 30000, 15% otherwise
        taxable = max(0, gross - ins_emp)
        if taxable <= 4000:
            tax = 0
        elif taxable <= 30000:
            tax = round((taxable - 4000) * 0.10, 2)
        else:
            tax = round(2600 + (taxable - 30000) * 0.15, 2)

        total_deduct_item = ins_emp + tax + it.deductions_other + it.advances_deduct
        net = round(gross - total_deduct_item, 2)

        item = PayrollItem(
            run_id=run.id,
            employee_id=it.employee_id,
            employee_name=emp.name,
            base_salary=it.base_salary,
            allowances=it.allowances,
            overtime=it.overtime,
            bonus=it.bonus,
            gross_salary=round(gross, 2),
            insurance_employee=ins_emp,
            insurance_company=ins_co,
            income_tax=tax,
            deductions_other=it.deductions_other,
            advances_deduct=it.advances_deduct,
            total_deductions=round(total_deduct_item, 2),
            net_salary=net,
        )
        db.add(item)
        total_gross  += gross
        total_deduct += total_deduct_item
        total_net    += net

    run.total_gross  = round(total_gross, 2)
    run.total_deduct = round(total_deduct, 2)
    run.total_net    = round(total_net, 2)
    db.commit()
    db.refresh(run)
    return run


@router.put("/runs/{run_id}/approve")
def approve_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(404)
    run.status = "approved"
    run.approved_by = current_user.id
    run.approved_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.delete("/runs/{run_id}")
def delete_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(404)
    db.query(PayrollItem).filter(PayrollItem.run_id == run_id).delete()
    db.delete(run)
    db.commit()
    return {"ok": True}


# ── Quick Stats ───────────────────────────────────────────────────────────────

@router.get("/stats")
def payroll_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_emp   = db.query(Employee).filter(Employee.status == "active").count()
    total_salary = db.query(func.sum(Employee.base_salary)).filter(Employee.status == "active").scalar() or 0
    last_run    = db.query(PayrollRun).order_by(PayrollRun.year.desc(), PayrollRun.month.desc()).first()
    return {
        "total_employees": total_emp,
        "total_base_salary": total_salary,
        "last_run": last_run,
    }
