"""
Portal Credentials Router — admin only, encrypted storage for client portal logins
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.database import get_db
from app.core.deps import require_admin, get_current_user
from app.models.portal_credentials import PortalCredential
from app.models.client import Client
from app.models.user import User

router = APIRouter(prefix="/api/portal-credentials", tags=["portal-credentials"])


class CredentialUpsert(BaseModel):
    contact_person:    Optional[str] = None
    national_id:       Optional[str] = None
    portal_system:     Optional[str] = None
    portal_username:   Optional[str] = None
    portal_password:   Optional[str] = None
    einvoice_email:    Optional[str] = None
    einvoice_password: Optional[str] = None
    email_address:     Optional[str] = None
    email_password:    Optional[str] = None
    payroll_username:  Optional[str] = None
    payroll_password:  Optional[str] = None
    payroll_type:      Optional[str] = None
    declaration_type:  Optional[str] = None
    notes:             Optional[str] = None


def cred_to_dict(c: PortalCredential) -> dict:
    return {
        "id":               c.id,
        "client_id":        c.client_id,
        "contact_person":   c.contact_person,
        "national_id":      c.national_id,
        "portal_system":    c.portal_system,
        "portal_username":  c.portal_username,
        "portal_password":  c.portal_password,
        "einvoice_email":   c.einvoice_email,
        "einvoice_password": c.einvoice_password,
        "email_address":    c.email_address,
        "email_password":   c.email_password,
        "payroll_username": c.payroll_username,
        "payroll_password": c.payroll_password,
        "payroll_type":     c.payroll_type,
        "declaration_type": c.declaration_type,
        "notes":            c.notes,
        "created_at":       c.created_at.isoformat() if c.created_at else None,
        "updated_at":       c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("/{client_id}")
async def get_credentials(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cred = db.query(PortalCredential).filter(PortalCredential.client_id == client_id).first()
    if not cred:
        return {}
    return cred_to_dict(cred)


@router.put("/{client_id}")
async def upsert_credentials(
    client_id: int,
    data: CredentialUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")

    cred = db.query(PortalCredential).filter(PortalCredential.client_id == client_id).first()
    if not cred:
        cred = PortalCredential(client_id=client_id, created_by=current_user.id)
        db.add(cred)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(cred, field, value)

    db.commit()
    db.refresh(cred)
    return cred_to_dict(cred)


@router.delete("/{client_id}")
async def delete_credentials(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cred = db.query(PortalCredential).filter(PortalCredential.client_id == client_id).first()
    if cred:
        db.delete(cred)
        db.commit()
    return {"ok": True}

