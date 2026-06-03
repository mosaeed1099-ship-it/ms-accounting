from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import date
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.timesheet import TimeEntry

router = APIRouter(prefix="/api/timesheet", tags=["timesheet"])


def _to_dict(e: TimeEntry) -> dict:
    return {
        "id": e.id,
        "employee_id": e.employee_id,
        "employee_name": e.employee.name if e.employee else None,
        "task_id": e.task_id,
        "task_title": e.task.title if e.task else None,
        "client_id": e.client_id,
        "client_name": e.client.name if e.client else None,
        "date": str(e.date) if e.date else None,
        "hours": e.hours,
        "description": e.description,
        "created_at": str(e.created_at) if e.created_at else None,
    }


@router.get("")
def list_entries(
    employee_id: Optional[int] = None,
    task_id: Optional[int] = None,
    client_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(TimeEntry)
    if employee_id:
        q = q.filter(TimeEntry.employee_id == employee_id)
    if task_id:
        q = q.filter(TimeEntry.task_id == task_id)
    if client_id:
        q = q.filter(TimeEntry.client_id == client_id)
    if date_from:
        q = q.filter(TimeEntry.date >= date_from)
    if date_to:
        q = q.filter(TimeEntry.date <= date_to)
    entries = q.order_by(TimeEntry.date.desc()).all()
    total_hours = sum(e.hours for e in entries)
    return {"items": [_to_dict(e) for e in entries], "total_hours": round(total_hours, 2)}


@router.get("/stats")
def timesheet_stats(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(
        TimeEntry.employee_id,
        func.sum(TimeEntry.hours).label("total_hours"),
        func.count(TimeEntry.id).label("entries"),
    )
    if date_from:
        q = q.filter(TimeEntry.date >= date_from)
    if date_to:
        q = q.filter(TimeEntry.date <= date_to)
    rows = q.group_by(TimeEntry.employee_id).all()
    result = []
    for r in rows:
        emp = db.query(User).filter(User.id == r.employee_id).first()
        result.append({
            "employee_id": r.employee_id,
            "employee_name": emp.name if emp else "—",
            "total_hours": round(r.total_hours or 0, 2),
            "entries": r.entries,
        })
    result.sort(key=lambda x: x["total_hours"], reverse=True)
    return result


@router.post("")
def create_entry(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    e = TimeEntry(
        employee_id=body.get("employee_id") or current_user.id,
        task_id=body.get("task_id") or None,
        client_id=body.get("client_id") or None,
        date=date.fromisoformat(body["date"]) if body.get("date") else date.today(),
        hours=float(body.get("hours", 0)),
        description=body.get("description"),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _to_dict(e)


@router.put("/{entry_id}")
def update_entry(
    entry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    e = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not e:
        from fastapi import HTTPException
        raise HTTPException(404, "Entry not found")
    if "hours" in body:
        e.hours = float(body["hours"])
    if "description" in body:
        e.description = body["description"]
    if "date" in body and body["date"]:
        e.date = date.fromisoformat(body["date"])
    if "task_id" in body:
        e.task_id = body["task_id"] or None
    if "client_id" in body:
        e.client_id = body["client_id"] or None
    db.commit()
    db.refresh(e)
    return _to_dict(e)


@router.delete("/{entry_id}")
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    e = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if e:
        db.delete(e)
        db.commit()
    return {"ok": True}
