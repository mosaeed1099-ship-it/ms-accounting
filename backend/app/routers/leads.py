"""
Lead Management CRM Router
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

from app.database import get_db
from app.core.deps import get_current_user
from app.models.lead import Lead, LeadActivity, Meeting, FollowUp, LeadStatus
from app.models.user import User

router = APIRouter(prefix="/api/leads", tags=["leads"])


# ── Schemas ────────────────────────────────────────
class LeadCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company_name: Optional[str] = None
    governorate: Optional[str] = None
    status: Optional[str] = LeadStatus.NEW
    source: Optional[str] = "other"
    service_requested: Optional[str] = "establishment"
    company_type: Optional[str] = None
    estimated_capital: Optional[float] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None
    has_office: Optional[bool] = False
    meeting_date: Optional[str] = None
    company_activities: Optional[str] = None
    suggested_name: Optional[str] = None

class LeadUpdate(LeadCreate):
    name: Optional[str] = None
    lost_reason: Optional[str] = None

class ActivityCreate(BaseModel):
    action: str
    description: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None

class MeetingCreate(BaseModel):
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    title: str
    scheduled_at: str
    duration_minutes: Optional[int] = 60
    location: Optional[str] = "office"
    meeting_link: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None

class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    notes: Optional[str] = None

class FollowUpCreate(BaseModel):
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    due_date: str
    follow_up_type: Optional[str] = "call"
    notes: Optional[str] = None
    assigned_to: Optional[int] = None


# ── Helper ────────────────────────────────────────
def lead_to_dict(lead: Lead) -> dict:
    assigned_name = lead.assigned_user.name if lead.assigned_user else None
    return {
        "id": lead.id,
        "code": lead.code,
        "name": lead.name,
        "phone": lead.phone,
        "email": lead.email,
        "company_name": lead.company_name,
        "governorate": lead.governorate,
        "status": lead.status,
        "source": lead.source,
        "service_requested": lead.service_requested,
        "company_type": lead.company_type,
        "estimated_capital": lead.estimated_capital,
        "assigned_to": lead.assigned_to,
        "assigned_name": assigned_name,
        "notes": lead.notes,
        "lost_reason": lead.lost_reason,
        "has_office": bool(lead.has_office) if lead.has_office is not None else False,
        "meeting_date": lead.meeting_date.isoformat() if lead.meeting_date else None,
        "company_activities": lead.company_activities,
        "suggested_name": lead.suggested_name,
        "converted_client_id": lead.converted_client_id,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
    }


# ── Leads CRUD ────────────────────────────────────
@router.get("")
def list_leads(
    q: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    source: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Lead)
    if q:
        query = query.filter(or_(
            Lead.name.ilike(f"%{q}%"),
            Lead.phone.ilike(f"%{q}%"),
            Lead.company_name.ilike(f"%{q}%"),
        ))
    if status:
        query = query.filter(Lead.status == status)
    if assigned_to:
        query = query.filter(Lead.assigned_to == assigned_to)
    if source:
        query = query.filter(Lead.source == source)

    total = query.count()
    leads = query.order_by(Lead.created_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [lead_to_dict(l) for l in leads]}


@router.get("/pipeline")
def get_pipeline(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """إرجاع البيانات مجمّعة حسب الحالة للـ Kanban"""
    statuses = [
        LeadStatus.NEW, LeadStatus.INTERESTED, LeadStatus.MEETING,
        LeadStatus.QUOTATION_SENT, LeadStatus.PAID,
        LeadStatus.UNDER_ESTABLISHMENT, LeadStatus.TAX_REGISTERED,
        LeadStatus.ACCOUNTING_CLIENT, LeadStatus.INACTIVE, LeadStatus.LOST,
    ]
    result = {}
    for s in statuses:
        leads = db.query(Lead).filter(Lead.status == s).order_by(Lead.updated_at.desc()).all()
        result[s] = [lead_to_dict(l) for l in leads]
    return result


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total = db.query(func.count(Lead.id)).scalar()
    new = db.query(func.count(Lead.id)).filter(Lead.status == LeadStatus.NEW).scalar()
    in_progress = db.query(func.count(Lead.id)).filter(
        Lead.status.in_([LeadStatus.INTERESTED, LeadStatus.MEETING, LeadStatus.QUOTATION_SENT])
    ).scalar()
    converted = db.query(func.count(Lead.id)).filter(
        Lead.status.in_([LeadStatus.PAID, LeadStatus.UNDER_ESTABLISHMENT,
                          LeadStatus.TAX_REGISTERED, LeadStatus.ACCOUNTING_CLIENT])
    ).scalar()
    lost = db.query(func.count(Lead.id)).filter(Lead.status == LeadStatus.LOST).scalar()
    return {
        "total": total, "new": new, "in_progress": in_progress,
        "converted": converted, "lost": lost,
        "conversion_rate": round(converted / total * 100, 1) if total else 0
    }


@router.post("")
def create_lead(body: LeadCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = db.query(func.count(Lead.id)).scalar()
    data = body.dict()
    if data.get("meeting_date"):
        try:
            data["meeting_date"] = datetime.fromisoformat(data["meeting_date"])
        except Exception:
            data["meeting_date"] = None
    lead = Lead(**data, code=f"LDR-{str(count+1).zfill(4)}", created_by=current_user.id)
    db.add(lead)
    db.flush()
    # Log activity
    db.add(LeadActivity(lead_id=lead.id, user_id=current_user.id,
                         action="created", description=f"تم إضافة Lead جديد: {lead.name}",
                         new_value=lead.status))
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@router.get("/{lead_id}")
def get_lead(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead غير موجود")
    data = lead_to_dict(lead)
    # Activities
    data["activities"] = [{
        "id": a.id, "action": a.action, "description": a.description,
        "old_value": a.old_value, "new_value": a.new_value,
        "user_name": a.user.name if a.user else None,
        "created_at": a.created_at.isoformat()
    } for a in lead.activities]
    # Meetings
    data["meetings"] = [{
        "id": m.id, "title": m.title,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "status": m.status, "location": m.location,
        "assigned_name": m.assigned_user.name if m.assigned_user else None
    } for m in lead.meetings]
    # Follow-ups
    data["follow_ups"] = [{
        "id": f.id, "due_date": f.due_date.isoformat() if f.due_date else None,
        "follow_up_type": f.follow_up_type, "status": f.status, "notes": f.notes,
        "assigned_name": f.assigned_user.name if f.assigned_user else None
    } for f in lead.follow_ups]
    # Quotations
    data["quotations"] = [{
        "id": q.id, "number": q.number, "total": q.total, "status": q.status,
        "created_at": q.created_at.isoformat() if q.created_at else None
    } for q in lead.quotations]
    return data


@router.put("/{lead_id}")
def update_lead(
    lead_id: int, body: LeadUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead غير موجود")

    old_status = lead.status
    for k, v in body.dict(exclude_none=True).items():
        if k == "meeting_date" and v:
            try:
                setattr(lead, k, datetime.fromisoformat(v))
            except Exception:
                pass
        else:
            setattr(lead, k, v)
    lead.updated_at = datetime.utcnow()

    # Log status change
    if body.status and body.status != old_status:
        status_labels = {
            "new": "جديد", "interested": "مهتم", "meeting": "اجتماع",
            "quotation_sent": "عرض مرسل", "paid": "دفع",
            "under_establishment": "قيد التأسيس", "tax_registered": "مسجل ضريبياً",
            "accounting_client": "عميل محاسبة", "inactive": "غير نشط", "lost": "خسارة"
        }
        db.add(LeadActivity(
            lead_id=lead_id, user_id=current_user.id,
            action="status_change",
            description=f"تغيير الحالة من '{status_labels.get(old_status, old_status)}' إلى '{status_labels.get(body.status, body.status)}'",
            old_value=old_status, new_value=body.status
        ))

    db.commit()
    db.refresh(lead)

    # Auto-create client archive folder when lead converts
    CONVERT_STATUSES = {"paid", "under_establishment", "tax_registered", "accounting_client"}
    if body.status and body.status in CONVERT_STATUSES and old_status not in CONVERT_STATUSES:
        _ensure_client_archive(lead, db, current_user.id)

    return lead_to_dict(lead)


def _ensure_client_archive(lead: Lead, db, user_id: int):
    """Create archive folder structure for a newly converted client"""
    try:
        from app.models.client import Client
        import os, json as _json
        # Find or create the client record linked to this lead
        client = None
        if lead.converted_client_id:
            client = db.query(Client).filter(Client.id == lead.converted_client_id).first()
        if not client:
            # Try to find by name
            client = db.query(Client).filter(Client.name == lead.name).first()
        if not client:
            return  # No linked client yet, skip

        # Create upload directory for this client
        upload_dir = os.path.join("uploads", str(client.id))
        os.makedirs(upload_dir, exist_ok=True)

        # Log activity
        db.add(LeadActivity(
            lead_id=lead.id, user_id=user_id,
            action="archive_created",
            description=f"تم إنشاء ملف الأرشيف التلقائي للعميل: {client.name}"
        ))
        db.commit()
    except Exception as e:
        pass  # Don't break the main flow


@router.delete("/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead غير موجود")
    db.delete(lead)
    db.commit()
    return {"message": "تم حذف Lead بنجاح"}


@router.post("/{lead_id}/activities")
def add_activity(
    lead_id: int, body: ActivityCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead غير موجود")
    act = LeadActivity(lead_id=lead_id, user_id=current_user.id, **body.dict())
    db.add(act)
    db.commit()
    return {"message": "تم إضافة النشاط"}


# ── Meetings ──────────────────────────────────────
@router.get("/meetings/all")
def list_meetings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    meetings = db.query(Meeting).order_by(Meeting.scheduled_at.desc()).limit(50).all()
    return [{"id": m.id, "title": m.title, "lead_id": m.lead_id,
             "lead_name": m.lead.name if m.lead else None,
             "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
             "status": m.status, "location": m.location,
             "assigned_name": m.assigned_user.name if m.assigned_user else None} for m in meetings]


@router.post("/meetings")
def create_meeting(
    body: MeetingCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    dt = datetime.fromisoformat(body.scheduled_at) if body.scheduled_at else None
    m = Meeting(
        lead_id=body.lead_id, client_id=body.client_id,
        title=body.title, scheduled_at=dt,
        duration_minutes=body.duration_minutes or 60,
        location=body.location or "office",
        meeting_link=body.meeting_link, notes=body.notes,
        assigned_to=body.assigned_to or current_user.id,
        created_by=current_user.id
    )
    db.add(m)
    if body.lead_id:
        db.add(LeadActivity(lead_id=body.lead_id, user_id=current_user.id,
                             action="meeting", description=f"تم جدولة اجتماع: {body.title}"))
    db.commit()
    return {"id": m.id, "message": "تم إنشاء الاجتماع"}


@router.put("/meetings/{meeting_id}")
def update_meeting(
    meeting_id: int, body: MeetingUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(404, "الاجتماع غير موجود")
    for k, v in body.dict(exclude_none=True).items():
        if k == "scheduled_at" and v:
            setattr(m, k, datetime.fromisoformat(v))
        else:
            setattr(m, k, v)
    db.commit()
    return {"message": "تم تحديث الاجتماع"}


# ── Follow-ups ────────────────────────────────────
@router.post("/followups")
def create_followup(
    body: FollowUpCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    dt = datetime.fromisoformat(body.due_date) if body.due_date else None
    f = FollowUp(
        lead_id=body.lead_id, client_id=body.client_id,
        due_date=dt, follow_up_type=body.follow_up_type or "call",
        notes=body.notes, assigned_to=body.assigned_to or current_user.id,
        created_by=current_user.id
    )
    db.add(f)
    if body.lead_id:
        db.add(LeadActivity(lead_id=body.lead_id, user_id=current_user.id,
                             action="follow_up", description=f"تم جدولة متابعة: {body.follow_up_type}"))
    db.commit()
    return {"id": f.id, "message": "تم إضافة المتابعة"}


@router.get("/followups/today")
def today_followups(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    from datetime import date, timedelta
    today = datetime.combine(date.today(), datetime.min.time())
    tomorrow = today + timedelta(days=1)
    items = db.query(FollowUp).filter(
        FollowUp.due_date >= today,
        FollowUp.due_date < tomorrow,
        FollowUp.status == "pending"
    ).all()
    return [{"id": f.id, "lead_name": f.lead.name if f.lead else None,
             "follow_up_type": f.follow_up_type, "notes": f.notes,
             "due_date": f.due_date.isoformat()} for f in items]
