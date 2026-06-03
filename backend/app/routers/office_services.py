"""
خدمات المكتب لكل عميل — مراجعة، حسابات، ضرائب، قانونية، منظومات، تأسيس
"""
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.office_service import OfficeService, OfficeServiceTask, SERVICE_TYPES
from app.models.client import Client
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/office-services", tags=["office_services"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ServiceCreate(BaseModel):
    client_id: int
    service_type: str
    name: Optional[str] = None
    description: Optional[str] = None
    status: str = "active"
    fee: float = 0
    fee_period: str = "monthly"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_users: Optional[str] = None
    notes: Optional[str] = None


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    fee: Optional[float] = None
    fee_period: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_users: Optional[str] = None
    notes: Optional[str] = None


class ServiceTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "pending"
    due_date: Optional[datetime] = None
    assigned_to: Optional[int] = None


class ServiceTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    assigned_to: Optional[int] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def task_to_dict(t: OfficeServiceTask) -> dict:
    return {
        "id": t.id,
        "service_id": t.service_id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "assigned_to": t.assigned_to,
        "assigned_user_name": t.assigned_user.name if t.assigned_user else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def service_to_dict(s: OfficeService, include_tasks: bool = True) -> dict:
    d = {
        "id": s.id,
        "client_id": s.client_id,
        "client_name": s.client.name if s.client else None,
        "service_type": s.service_type,
        "service_type_label": SERVICE_TYPES.get(s.service_type, s.service_type),
        "name": s.name,
        "description": s.description,
        "status": s.status,
        "fee": s.fee,
        "fee_period": s.fee_period,
        "start_date": s.start_date.isoformat() if s.start_date else None,
        "end_date": s.end_date.isoformat() if s.end_date else None,
        "assigned_users": s.assigned_users,
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "task_count": len(s.tasks),
        "pending_tasks": sum(1 for t in s.tasks if t.status == "pending"),
    }
    if include_tasks:
        d["tasks"] = [task_to_dict(t) for t in s.tasks]
    return d


# ─── Service endpoints ────────────────────────────────────────────────────────

@router.get("/types")
def get_service_types():
    return SERVICE_TYPES


@router.get("")
def list_services(
    client_id: Optional[int] = Query(None),
    service_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(OfficeService)
    if client_id:     q = q.filter(OfficeService.client_id == client_id)
    if service_type:  q = q.filter(OfficeService.service_type == service_type)
    if status:        q = q.filter(OfficeService.status == status)
    services = q.order_by(OfficeService.created_at.desc()).all()
    return [service_to_dict(s, include_tasks=False) for s in services]


@router.get("/{service_id}")
def get_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(OfficeService).filter(OfficeService.id == service_id).first()
    if not s:
        raise HTTPException(404, "الخدمة غير موجودة")
    return service_to_dict(s, include_tasks=True)


@router.post("")
def create_service(
    data: ServiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")
    if data.service_type not in SERVICE_TYPES:
        raise HTTPException(400, f"نوع خدمة غير صحيح. الأنواع المتاحة: {list(SERVICE_TYPES.keys())}")

    s = OfficeService(
        client_id      = data.client_id,
        service_type   = data.service_type,
        name           = data.name or SERVICE_TYPES.get(data.service_type),
        description    = data.description,
        status         = data.status,
        fee            = data.fee,
        fee_period     = data.fee_period,
        start_date     = data.start_date,
        end_date       = data.end_date,
        assigned_users = data.assigned_users,
        notes          = data.notes,
        created_by     = current_user.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return service_to_dict(s)


@router.put("/{service_id}")
def update_service(
    service_id: int,
    data: ServiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(OfficeService).filter(OfficeService.id == service_id).first()
    if not s:
        raise HTTPException(404, "الخدمة غير موجودة")

    for field, val in data.dict(exclude_none=True).items():
        setattr(s, field, val)

    db.commit()
    db.refresh(s)
    return service_to_dict(s)


@router.delete("/{service_id}")
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(OfficeService).filter(OfficeService.id == service_id).first()
    if not s:
        raise HTTPException(404, "الخدمة غير موجودة")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ─── Service task endpoints ────────────────────────────────────────────────────

@router.post("/{service_id}/tasks")
def create_service_task(
    service_id: int,
    data: ServiceTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(OfficeService).filter(OfficeService.id == service_id).first()
    if not s:
        raise HTTPException(404, "الخدمة غير موجودة")
    t = OfficeServiceTask(
        service_id  = service_id,
        title       = data.title,
        description = data.description,
        status      = data.status,
        due_date    = data.due_date,
        assigned_to = data.assigned_to,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return task_to_dict(t)


@router.put("/tasks/{task_id}")
def update_service_task(
    task_id: int,
    data: ServiceTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(OfficeServiceTask).filter(OfficeServiceTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "المهمة غير موجودة")
    for field, val in data.dict(exclude_none=True).items():
        setattr(t, field, val)
    db.commit()
    db.refresh(t)
    return task_to_dict(t)


@router.delete("/tasks/{task_id}")
def delete_service_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(OfficeServiceTask).filter(OfficeServiceTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "المهمة غير موجودة")
    db.delete(t)
    db.commit()
    return {"ok": True}
