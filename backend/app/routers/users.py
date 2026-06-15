from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
import json
from app.database import get_db
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.core.deps import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    role: UserRole = UserRole.ACCOUNTANT
    specialization: Optional[List[str]] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    specialization: Optional[List[str]] = None
    password: Optional[str] = None


def user_to_dict(user: User, db: Session = None) -> dict:
    specs = []
    try:
        if user.specialization:
            specs = json.loads(user.specialization) if isinstance(user.specialization, str) else user.specialization
    except Exception:
        specs = []

    # Count tasks assigned to this user
    task_count = 0
    lead_count = 0
    if db:
        try:
            from app.models.task import Task
            task_count = db.query(func.count(Task.id)).filter(
                Task.assigned_to == user.id,
                Task.status.notin_(["done", "cancelled"])
            ).scalar() or 0
            from app.models.lead import Lead
            lead_count = db.query(func.count(Lead.id)).filter(
                Lead.assigned_to == user.id,
                Lead.status.notin_(["lost", "accounting_client"])
            ).scalar() or 0
        except Exception:
            pass

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "whatsapp_phone": user.whatsapp_phone,
        "role": user.role,
        "is_active": user.is_active,
        "avatar": user.avatar,
        "notes": user.notes,
        "specialization": specs,
        "task_count": task_count,
        "lead_count": lead_count,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("")
async def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = db.query(User).filter(User.is_active == True).all()
    return [user_to_dict(u, db) for u in users]


@router.post("")
async def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
    specs = json.dumps(data.specialization or [], ensure_ascii=False)
    user = User(
        name=data.name,
        email=data.email,
        phone=data.phone,
        whatsapp_phone=data.whatsapp_phone,
        role=data.role,
        hashed_password=get_password_hash(data.password),
        specialization=specs,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_dict(user, db)


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    for field, value in data.dict(exclude_none=True).items():
        if field == "password":
            user.hashed_password = get_password_hash(value)
        elif field == "specialization":
            setattr(user, field, json.dumps(value, ensure_ascii=False))
        else:
            setattr(user, field, value)
    db.commit()
    return user_to_dict(user, db)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الخاص")
    user.is_active = False
    db.commit()
    return {"message": "تم تعطيل المستخدم"}
