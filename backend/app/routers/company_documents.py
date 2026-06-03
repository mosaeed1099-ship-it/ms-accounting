"""
وثائق الشركة — مستندات العميل مع تنبيهات الانتهاء
"""
import os
import shutil
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.company_document import CompanyDocument, DOC_TYPES
from app.models.client import Client
from app.core.deps import get_current_user
from app.models.user import User
from app.config import settings

router = APIRouter(prefix="/api/company-documents", tags=["company_documents"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _compute_status(expiry_date) -> str:
    if not expiry_date:
        return "active"
    today = date.today()
    delta = (expiry_date - today).days
    if delta < 0:
        return "expired"
    if delta <= 30:
        return "expiring_soon"
    return "active"


def doc_to_dict(d: CompanyDocument) -> dict:
    return {
        "id": d.id,
        "client_id": d.client_id,
        "doc_type": d.doc_type,
        "doc_type_label": DOC_TYPES.get(d.doc_type, d.doc_type),
        "doc_name": d.doc_name,
        "doc_number": d.doc_number,
        "issue_date": d.issue_date.isoformat() if d.issue_date else None,
        "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
        "status": _compute_status(d.expiry_date),
        "alert_days": d.alert_days,
        "file_path": d.file_path,
        "assigned_user_id": d.assigned_user_id,
        "assigned_user_name": d.assigned_user.name if d.assigned_user else None,
        "notes": d.notes,
        "is_active": d.is_active,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "days_until_expiry": (d.expiry_date - date.today()).days if d.expiry_date else None,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/doc-types")
def get_doc_types():
    return DOC_TYPES


@router.get("/client/{client_id}")
def list_client_docs(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")
    docs = db.query(CompanyDocument).filter(
        CompanyDocument.client_id == client_id,
        CompanyDocument.is_active == True,
    ).order_by(CompanyDocument.expiry_date).all()
    return [doc_to_dict(d) for d in docs]


@router.get("/expiring")
def list_expiring_docs(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all documents expiring within `days` days."""
    today = date.today()
    threshold = today + timedelta(days=days)
    docs = db.query(CompanyDocument).filter(
        CompanyDocument.is_active == True,
        CompanyDocument.expiry_date != None,
        CompanyDocument.expiry_date <= threshold,
        CompanyDocument.expiry_date >= today,
    ).order_by(CompanyDocument.expiry_date).all()
    return [doc_to_dict(d) for d in docs]


@router.get("/expired")
def list_expired_docs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    docs = db.query(CompanyDocument).filter(
        CompanyDocument.is_active == True,
        CompanyDocument.expiry_date != None,
        CompanyDocument.expiry_date < today,
    ).order_by(CompanyDocument.expiry_date).all()
    return [doc_to_dict(d) for d in docs]


@router.post("/client/{client_id}")
async def create_doc(
    client_id: int,
    doc_type: str = Form(...),
    doc_name: Optional[str] = Form(None),
    doc_number: Optional[str] = Form(None),
    issue_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    alert_days: Optional[str] = Form("30,15,7"),
    assigned_user_id: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "العميل غير موجود")

    file_path = None
    if file and file.filename:
        dest_dir = os.path.join(settings.UPLOAD_DIR, "company_docs", str(client_id))
        os.makedirs(dest_dir, exist_ok=True)
        safe_name = f"{doc_type}_{file.filename}"
        dest = os.path.join(dest_dir, safe_name)
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        file_path = dest

    doc = CompanyDocument(
        client_id        = client_id,
        doc_type         = doc_type,
        doc_name         = doc_name or DOC_TYPES.get(doc_type, doc_type),
        doc_number       = doc_number,
        issue_date       = date.fromisoformat(issue_date) if issue_date else None,
        expiry_date      = date.fromisoformat(expiry_date) if expiry_date else None,
        alert_days       = alert_days or "30,15,7",
        assigned_user_id = assigned_user_id,
        notes            = notes,
        file_path        = file_path,
        created_by       = current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc_to_dict(doc)


@router.put("/{doc_id}")
def update_doc(
    doc_id: int,
    doc_name: Optional[str] = Form(None),
    doc_number: Optional[str] = Form(None),
    issue_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    alert_days: Optional[str] = Form(None),
    assigned_user_id: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(CompanyDocument).filter(CompanyDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "المستند غير موجود")

    if doc_name is not None:      doc.doc_name = doc_name
    if doc_number is not None:    doc.doc_number = doc_number
    if issue_date is not None:    doc.issue_date = date.fromisoformat(issue_date)
    if expiry_date is not None:   doc.expiry_date = date.fromisoformat(expiry_date)
    if alert_days is not None:    doc.alert_days = alert_days
    if assigned_user_id is not None: doc.assigned_user_id = assigned_user_id
    if notes is not None:         doc.notes = notes

    db.commit()
    db.refresh(doc)
    return doc_to_dict(doc)


@router.delete("/{doc_id}")
def delete_doc(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(CompanyDocument).filter(CompanyDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "المستند غير موجود")
    doc.is_active = False
    db.commit()
    return {"ok": True}
