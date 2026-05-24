from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import date
from app.database import get_db
from app.models.client import Client, ClientType, ClientStatus, TaxType
from app.models.client_contact import ClientContact
from app.models.activity import ActivityLog
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/clients", tags=["clients"])


class ClientCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    client_type: ClientType = ClientType.COMPANY
    status: ClientStatus = ClientStatus.ACTIVE
    email: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    address: Optional[str] = None
    governorate: Optional[str] = None
    city: Optional[str] = None
    commercial_register: Optional[str] = None
    tax_number: Optional[str] = None
    national_id: Optional[str] = None
    activity: Optional[str] = None
    activity_code: Optional[str] = None
    tax_type: TaxType = TaxType.VAT
    contract_value: float = 0
    payment_terms: int = 30
    credit_limit: float = 0
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    contract_renewal_date: Optional[date] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    assigned_accountant_id: Optional[int] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    client_type: Optional[ClientType] = None
    status: Optional[ClientStatus] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    address: Optional[str] = None
    governorate: Optional[str] = None
    city: Optional[str] = None
    commercial_register: Optional[str] = None
    tax_number: Optional[str] = None
    national_id: Optional[str] = None
    activity: Optional[str] = None
    tax_type: Optional[TaxType] = None
    contract_value: Optional[float] = None
    payment_terms: Optional[int] = None
    credit_limit: Optional[float] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    contract_renewal_date: Optional[date] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    assigned_accountant_id: Optional[int] = None


def generate_client_code(db: Session) -> str:
    count = db.query(func.count(Client.id)).scalar()
    return f"CLT-{str(count + 1).zfill(4)}"


def client_to_dict(client: Client) -> dict:
    return {
        "id": client.id,
        "code": client.code,
        "name": client.name,
        "name_en": client.name_en,
        "client_type": client.client_type,
        "status": client.status,
        "email": client.email,
        "phone": client.phone,
        "phone2": client.phone2,
        "address": client.address,
        "governorate": client.governorate,
        "city": client.city,
        "commercial_register": client.commercial_register,
        "tax_number": client.tax_number,
        "national_id": client.national_id,
        "activity": client.activity,
        "activity_code": client.activity_code,
        "tax_type": client.tax_type,
        "contract_value": client.contract_value,
        "payment_terms": client.payment_terms,
        "credit_limit": client.credit_limit,
        "balance": client.balance,
        "contract_start": client.contract_start,
        "contract_end": client.contract_end,
        "contract_renewal_date": client.contract_renewal_date,
        "notes": client.notes,
        "tags": client.tags,
        "assigned_accountant_id": client.assigned_accountant_id,
        "assigned_accountant": client.assigned_accountant.name if client.assigned_accountant else None,
        "created_at": client.created_at,
        "updated_at": client.updated_at,
    }


@router.get("/")
async def list_clients(
    q: Optional[str] = Query(None),
    status: Optional[ClientStatus] = None,
    client_type: Optional[ClientType] = None,
    assigned_to: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Client)

    if q:
        query = query.filter(
            or_(
                Client.name.ilike(f"%{q}%"),
                Client.tax_number.ilike(f"%{q}%"),
                Client.phone.ilike(f"%{q}%"),
                Client.code.ilike(f"%{q}%"),
                Client.commercial_register.ilike(f"%{q}%"),
            )
        )
    if status:
        query = query.filter(Client.status == status)
    if client_type:
        query = query.filter(Client.client_type == client_type)
    if assigned_to:
        query = query.filter(Client.assigned_accountant_id == assigned_to)

    total = query.count()
    clients = query.order_by(Client.name).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [client_to_dict(c) for c in clients],
    }


@router.get("/stats")
async def client_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total = db.query(func.count(Client.id)).scalar()
    active = db.query(func.count(Client.id)).filter(Client.status == ClientStatus.ACTIVE).scalar()
    inactive = db.query(func.count(Client.id)).filter(Client.status == ClientStatus.INACTIVE).scalar()
    companies = db.query(func.count(Client.id)).filter(Client.client_type == ClientType.COMPANY).scalar()
    return {"total": total, "active": active, "inactive": inactive, "companies": companies}


@router.get("/{client_id}")
async def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    data = client_to_dict(client)
    data["contacts"] = [
        {"id": c.id, "name": c.name, "position": c.position, "email": c.email, "phone": c.phone, "is_primary": c.is_primary}
        for c in client.contacts
    ]
    return data


@router.post("/")
async def create_client(
    data: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = Client(**data.dict(), code=generate_client_code(db), created_by=current_user.id)
    db.add(client)
    db.commit()
    db.refresh(client)

    log = ActivityLog(user_id=current_user.id, client_id=client.id, action="create_client",
                      entity_type="client", entity_id=client.id, description=f"تم إضافة عميل جديد: {client.name}")
    db.add(log)
    db.commit()

    return client_to_dict(client)


@router.put("/{client_id}")
async def update_client(
    client_id: int,
    data: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")

    for field, value in data.dict(exclude_none=True).items():
        setattr(client, field, value)
    db.commit()
    db.refresh(client)

    log = ActivityLog(user_id=current_user.id, client_id=client_id, action="update_client",
                      entity_type="client", entity_id=client_id, description=f"تم تعديل بيانات العميل: {client.name}")
    db.add(log)
    db.commit()

    return client_to_dict(client)


@router.delete("/{client_id}")
async def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    client.status = ClientStatus.INACTIVE
    db.commit()
    return {"message": "تم تعطيل العميل"}


@router.get("/{client_id}/activity")
async def client_activity(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.client_id == client_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": l.id,
            "action": l.action,
            "description": l.description,
            "user": l.user.name if l.user else None,
            "created_at": l.created_at,
        }
        for l in logs
    ]
