from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, date
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.postal import InternalMail

router = APIRouter(prefix="/api/postal", tags=["postal"])


def _to_dict(m: InternalMail) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "document_type": m.document_type,
        "client_id": m.client_id,
        "client_name": m.client.name if m.client else None,
        "from_person": m.from_person,
        "assigned_to": m.assigned_to,
        "assignee_name": m.assignee.name if m.assignee else None,
        "status": m.status,
        "received_date": str(m.received_date) if m.received_date else None,
        "within_date": str(m.within_date) if m.within_date else None,
        "closed_date": str(m.closed_date) if m.closed_date else None,
        "notes": m.notes,
        "created_at": str(m.created_at) if m.created_at else None,
    }


@router.get("")
def list_mail(
    status: Optional[str] = None,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(InternalMail)
    if status:
        q = q.filter(InternalMail.status == status)
    if client_id:
        q = q.filter(InternalMail.client_id == client_id)
    items = q.order_by(InternalMail.created_at.desc()).all()
    counts = {
        "open":   db.query(func.count(InternalMail.id)).filter(InternalMail.status == "open").scalar() or 0,
        "within": db.query(func.count(InternalMail.id)).filter(InternalMail.status == "within").scalar() or 0,
        "closed": db.query(func.count(InternalMail.id)).filter(InternalMail.status == "closed").scalar() or 0,
    }
    return {"items": [_to_dict(m) for m in items], "counts": counts}


@router.post("")
def create_mail(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = InternalMail(
        title=body.get("title", "").strip(),
        document_type=body.get("document_type"),
        client_id=body.get("client_id") or None,
        from_person=body.get("from_person"),
        assigned_to=body.get("assigned_to") or None,
        status="open",
        received_date=date.fromisoformat(body["received_date"]) if body.get("received_date") else date.today(),
        notes=body.get("notes"),
        created_by=current_user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _to_dict(m)


@router.put("/{mail_id}")
def update_mail(
    mail_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = db.query(InternalMail).filter(InternalMail.id == mail_id).first()
    if not m:
        from fastapi import HTTPException
        raise HTTPException(404, "Mail not found")

    for f in ["title", "document_type", "from_person", "notes"]:
        if f in body:
            setattr(m, f, body[f])
    if "client_id" in body:
        m.client_id = body["client_id"] or None
    if "assigned_to" in body:
        m.assigned_to = body["assigned_to"] or None
    if "received_date" in body and body["received_date"]:
        m.received_date = date.fromisoformat(body["received_date"])

    # status transitions
    new_status = body.get("status")
    if new_status and new_status != m.status:
        m.status = new_status
        if new_status == "within" and not m.within_date:
            m.within_date = datetime.utcnow()
        elif new_status == "closed" and not m.closed_date:
            m.closed_date = datetime.utcnow()

    db.commit()
    db.refresh(m)
    return _to_dict(m)


@router.delete("/{mail_id}")
def delete_mail(
    mail_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = db.query(InternalMail).filter(InternalMail.id == mail_id).first()
    if m:
        db.delete(m)
        db.commit()
    return {"ok": True}
