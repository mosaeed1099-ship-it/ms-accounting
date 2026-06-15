from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, case
from datetime import datetime, timedelta, date
from app.database import get_db
from app.models.client import Client, ClientStatus
from app.models.invoice import Invoice, InvoiceStatus, Payment
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.tax import TaxReturn, TaxReturnStatus
from app.models.activity import ActivityLog
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    import traceback as _tb
    now = datetime.now()
    month_start = date(now.year, now.month, 1)
    today = date.today()
    errors = []

    # Clients
    try:
        active_clients = db.query(func.count(Client.id)).filter(Client.status == ClientStatus.ACTIVE).scalar() or 0
        total_clients = active_clients
        new_clients_month = db.query(func.count(Client.id)).filter(
            Client.status == ClientStatus.ACTIVE,
            func.date(Client.created_at) >= month_start
        ).scalar() or 0
        from sqlalchemy import text as _text
        obl_counts = db.execute(_text("""
            SELECT
                COUNT(*) FILTER (WHERE tax_obligations::text LIKE '%income_annual%')   AS income,
                COUNT(*) FILTER (WHERE tax_obligations::text LIKE '%vat_monthly%')     AS vat,
                COUNT(*) FILTER (WHERE tax_obligations::text LIKE '%payroll_monthly%') AS payroll
            FROM clients WHERE status = 'active'
        """)).fetchone()
        income_clients  = obl_counts[0] if obl_counts else 0
        vat_clients     = obl_counts[1] if obl_counts else 0
        payroll_clients = obl_counts[2] if obl_counts else 0
    except Exception as e:
        db.rollback(); errors.append(f"clients: {e}"); active_clients=total_clients=new_clients_month=income_clients=vat_clients=payroll_clients=0

    # Invoices
    try:
        total_invoiced = db.query(func.sum(Invoice.total)).filter(Invoice.status != InvoiceStatus.CANCELLED).scalar() or 0
        total_collected = db.query(func.sum(Invoice.paid_amount)).scalar() or 0
        total_overdue = db.query(func.sum(Invoice.remaining)).filter(Invoice.status == InvoiceStatus.OVERDUE).scalar() or 0
        monthly_revenue = db.query(func.sum(Payment.amount)).filter(func.date(Payment.created_at) >= month_start).scalar() or 0
    except Exception as e:
        db.rollback(); errors.append(f"invoices: {e}"); total_invoiced=total_collected=total_overdue=monthly_revenue=0

    # Tasks
    try:
        pending_tasks = db.query(func.count(Task.id)).filter(Task.status.in_([TaskStatus.TODO, TaskStatus.IN_PROGRESS])).scalar() or 0
        overdue_tasks = db.query(func.count(Task.id)).filter(Task.status != TaskStatus.DONE, Task.due_date < today).scalar() or 0
        urgent_tasks  = db.query(func.count(Task.id)).filter(Task.priority == TaskPriority.URGENT, Task.status != TaskStatus.DONE).scalar() or 0
    except Exception as e:
        db.rollback(); errors.append(f"tasks: {e}"); pending_tasks=overdue_tasks=urgent_tasks=0

    # Tax Returns
    try:
        pending_tax = db.query(func.count(TaxReturn.id)).filter(TaxReturn.status.in_([TaxReturnStatus.PENDING, TaxReturnStatus.IN_PROGRESS])).scalar() or 0
        late_tax    = db.query(func.count(TaxReturn.id)).filter(TaxReturn.status == TaxReturnStatus.LATE).scalar() or 0
    except Exception as e:
        db.rollback(); errors.append(f"tax: {e}"); pending_tax=late_tax=0

    return {
        "_debug_errors": errors,
        "clients": {
            "total": total_clients,
            "active": active_clients,
            "new_this_month": new_clients_month,
            "income_declaration": income_clients,
            "vat_declaration": vat_clients,
            "payroll_declaration": payroll_clients,
        },
        "financial": {
            "total_invoiced": total_invoiced,
            "total_collected": total_collected,
            "total_outstanding": total_invoiced - total_collected,
            "total_overdue": total_overdue,
            "monthly_revenue": monthly_revenue,
        },
        "tasks": {
            "pending": pending_tasks,
            "overdue": overdue_tasks,
            "urgent": urgent_tasks,
        },
        "tax": {
            "pending": pending_tax,
            "late": late_tax,
        },
    }


@router.get("/revenue-chart")
async def revenue_chart(
    months: int = 6,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = []
    now = datetime.now()
    for i in range(months - 1, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        month_start = date(y, m, 1)
        if m == 12:
            month_end = date(y + 1, 1, 1)
        else:
            month_end = date(y, m + 1, 1)

        revenue = db.query(func.sum(Payment.amount)).filter(
            func.date(Payment.created_at) >= month_start,
            func.date(Payment.created_at) < month_end,
        ).scalar() or 0

        invoiced = db.query(func.sum(Invoice.total)).filter(
            Invoice.issue_date >= month_start,
            Invoice.issue_date < month_end,
            Invoice.status != InvoiceStatus.CANCELLED,
        ).scalar() or 0

        month_names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                       "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
        data.append({
            "month": month_names[m - 1],
            "year": y,
            "revenue": revenue,
            "invoiced": invoiced,
        })
    return data


@router.get("/recent-activity")
async def recent_activity(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = (
        db.query(ActivityLog)
        .options(joinedload(ActivityLog.user), joinedload(ActivityLog.client))
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": l.id,
            "action": l.action,
            "description": l.description,
            "user": l.user.name if l.user else None,
            "client": l.client.name if l.client else None,
            "created_at": l.created_at,
        }
        for l in logs
    ]


@router.get("/upcoming-deadlines")
async def upcoming_deadlines(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    future = today + timedelta(days=days)

    tasks = (
        db.query(Task)
        .options(joinedload(Task.client), joinedload(Task.assigned_to_user))
        .filter(Task.due_date >= today, Task.due_date <= future, Task.status != TaskStatus.DONE)
        .order_by(Task.due_date)
        .all()
    )

    tax_returns = (
        db.query(TaxReturn)
        .options(joinedload(TaxReturn.client))
        .filter(TaxReturn.due_date >= today, TaxReturn.due_date <= future, TaxReturn.status != TaxReturnStatus.SUBMITTED)
        .order_by(TaxReturn.due_date)
        .all()
    )

    return {
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "due_date": t.due_date,
                "priority": t.priority,
                "client_name": t.client.name if t.client else None,
                "assigned_to_name": t.assigned_to_user.name if t.assigned_to_user else None,
            }
            for t in tasks
        ],
        "tax_returns": [
            {
                "id": r.id,
                "return_type": r.return_type,
                "due_date": r.due_date,
                "client_name": r.client.name if r.client else None,
                "period_year": r.period_year,
                "period_month": r.period_month,
            }
            for r in tax_returns
        ],
    }
