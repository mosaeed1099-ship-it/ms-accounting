"""
Company Establishment Workflow Router
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from app.database import get_db
from app.core.deps import get_current_user
from app.models.establishment import CompanyEstablishment, EstablishmentStatus
from app.models.lead import LeadActivity
from app.models.user import User
from app.models.client import Client

router = APIRouter(prefix="/api/establishment", tags=["establishment"])


class EstablishmentCreate(BaseModel):
    company_name: str
    company_name_en: Optional[str] = None
    company_type: Optional[str] = "llc"
    activity: Optional[str] = None
    governorate: Optional[str] = None
    capital: Optional[float] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None


class StageUpdate(BaseModel):
    stage_key: str          # name_reservation, commercial_register, etc.
    status: str             # pending, in_progress, done, blocked
    date: Optional[str] = None
    deadline: Optional[str] = None
    number: Optional[str] = None
    notes: Optional[str] = None


def est_to_dict(est: CompanyEstablishment) -> dict:
    return {
        "id": est.id,
        "code": est.code,
        "company_name": est.company_name,
        "company_name_en": est.company_name_en,
        "company_type": est.company_type,
        "activity": est.activity,
        "governorate": est.governorate,
        "capital": est.capital,
        "status": est.status,
        "progress": est.progress,
        "lead_id": est.lead_id,
        "client_id": est.client_id,
        "assigned_to": est.assigned_to,
        "assigned_name": est.assigned_user.name if est.assigned_user else None,
        "notes": est.notes,
        "stages": [
            {**s,
             "date": s["date"].isoformat() if s.get("date") else None,
             "deadline": s["deadline"].isoformat() if s.get("deadline") else None,
             } for s in est.stages
        ],
        "created_at": est.created_at.isoformat() if est.created_at else None,
        "completed_at": est.completed_at.isoformat() if est.completed_at else None,
    }


@router.get("")
def list_establishments(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(CompanyEstablishment)
    if status:
        query = query.filter(CompanyEstablishment.status == status)
    items = query.order_by(CompanyEstablishment.created_at.desc()).all()
    return {"total": len(items), "items": [est_to_dict(e) for e in items]}


@router.post("")
def create_establishment(
    body: EstablishmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    count = db.query(func.count(CompanyEstablishment.id)).scalar()
    est = CompanyEstablishment(
        **body.dict(),
        code=f"EST-{str(count+1).zfill(4)}",
        created_by=current_user.id
    )
    db.add(est)
    db.commit()
    db.refresh(est)
    return est_to_dict(est)


@router.get("/{est_id}")
def get_establishment(
    est_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    est = db.query(CompanyEstablishment).filter(CompanyEstablishment.id == est_id).first()
    if not est:
        raise HTTPException(404, "ملف التأسيس غير موجود")
    return est_to_dict(est)


@router.put("/{est_id}/stage")
def update_stage(
    est_id: int, body: StageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    est = db.query(CompanyEstablishment).filter(CompanyEstablishment.id == est_id).first()
    if not est:
        raise HTTPException(404, "ملف التأسيس غير موجود")

    key = body.stage_key
    valid_keys = ["name_reservation", "commercial_register", "tax_card",
                  "vat_registration", "insurance", "bank_account"]
    if key not in valid_keys:
        raise HTTPException(400, f"مرحلة غير صحيحة: {key}")

    # Update stage fields
    setattr(est, f"{key}_status", body.status)
    if body.date:
        setattr(est, f"{key}_date", datetime.fromisoformat(body.date))
    if body.deadline:
        setattr(est, f"{key}_deadline", datetime.fromisoformat(body.deadline))
    if body.notes is not None:
        setattr(est, f"{key}_notes", body.notes)
    if body.number and hasattr(est, f"{key}_number"):
        setattr(est, f"{key}_number", body.number)

    # Check if all stages done
    all_done = all(s["status"] == "done" for s in est.stages)
    if all_done and est.status != EstablishmentStatus.DONE:
        est.status = EstablishmentStatus.DONE
        est.completed_at = datetime.utcnow()

    est.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(est)
    return est_to_dict(est)


@router.post("/{est_id}/convert-to-client")
def convert_to_client(
    est_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """تحويل ملف التأسيس المكتمل إلى عميل في عملاء المكتب"""
    est = db.query(CompanyEstablishment).filter(CompanyEstablishment.id == est_id).first()
    if not est:
        raise HTTPException(404, "ملف التأسيس غير موجود")
    if est.client_id:
        # Already linked — return existing client info
        existing = db.query(Client).filter(Client.id == est.client_id).first()
        return {"message": "الشركة مرتبطة بعميل مسبقاً", "client_id": est.client_id,
                "client_name": existing.name if existing else None, "already_exists": True}

    # Create new client
    client = Client(
        name=est.company_name,
        activity=est.activity,
        governorate=est.governorate,
        status="active",
        created_by=current_user.id,
    )
    db.add(client)
    db.flush()

    # Link back to establishment
    est.client_id = client.id
    est.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(client)

    return {
        "message": f"تم إنشاء العميل '{client.name}' بنجاح وربطه بملف التأسيس",
        "client_id": client.id,
        "client_name": client.name,
        "already_exists": False,
    }


@router.put("/{est_id}")
def update_establishment(
    est_id: int, body: EstablishmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    est = db.query(CompanyEstablishment).filter(CompanyEstablishment.id == est_id).first()
    if not est:
        raise HTTPException(404, "ملف التأسيس غير موجود")
    for k, v in body.dict(exclude_none=True).items():
        setattr(est, k, v)
    est.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(est)
    return est_to_dict(est)
