"""
Lead Management CRM Router
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, List
from datetime import datetime, timedelta, date, timezone
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
    # New CRM fields
    follow_up_date: Optional[str] = None
    has_existing_companies: Optional[bool] = False
    proposed_names: Optional[str] = None
    # Embedded quote fields
    quote_legal_entity: Optional[str] = None
    quote_activity: Optional[str] = None
    quote_location: Optional[str] = None
    quote_capital: Optional[float] = None
    quote_total_fees: Optional[float] = None
    quote_government_fees: Optional[float] = None
    quote_expenses_total: Optional[float] = None
    quote_services: Optional[str] = None
    quote_required_docs: Optional[str] = None
    quote_deliver_docs: Optional[str] = None
    quote_notes: Optional[str] = None

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
        # New CRM fields
        "follow_up_date": lead.follow_up_date.isoformat() if lead.follow_up_date else None,
        "has_existing_companies": bool(lead.has_existing_companies) if lead.has_existing_companies is not None else False,
        "proposed_names": lead.proposed_names,
        # Embedded quote fields
        "quote_legal_entity": lead.quote_legal_entity,
        "quote_activity": lead.quote_activity,
        "quote_location": lead.quote_location,
        "quote_capital": lead.quote_capital,
        "quote_total_fees": lead.quote_total_fees,
        "quote_government_fees": lead.quote_government_fees,
        "quote_expenses_total": lead.quote_expenses_total,
        "quote_services": lead.quote_services,
        "quote_required_docs": lead.quote_required_docs,
        "quote_deliver_docs": lead.quote_deliver_docs,
        "quote_notes": lead.quote_notes,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
    }


# ── Date filter helper ─────────────────────────────
def _resolve_date_range(date_filter: Optional[str], date_from: Optional[str], date_to: Optional[str]):
    """Return (dt_from, dt_to) as datetime or None."""
    today = date.today()
    if date_filter == 'today':
        return datetime(today.year, today.month, today.day), datetime(today.year, today.month, today.day, 23, 59, 59)
    elif date_filter == 'yesterday':
        y = today - timedelta(days=1)
        return datetime(y.year, y.month, y.day), datetime(y.year, y.month, y.day, 23, 59, 59)
    elif date_filter == 'this_week':
        start = today - timedelta(days=today.weekday())
        return datetime(start.year, start.month, start.day), None
    elif date_filter == 'last_week':
        start = today - timedelta(days=today.weekday() + 7)
        end = start + timedelta(days=6)
        return datetime(start.year, start.month, start.day), datetime(end.year, end.month, end.day, 23, 59, 59)
    elif date_filter == 'this_month':
        return datetime(today.year, today.month, 1), None
    elif date_filter == 'last_month':
        first_this = date(today.year, today.month, 1)
        last_m_end = first_this - timedelta(days=1)
        last_m_start = date(last_m_end.year, last_m_end.month, 1)
        return datetime(last_m_start.year, last_m_start.month, 1), datetime(last_m_end.year, last_m_end.month, last_m_end.day, 23, 59, 59)
    elif date_filter == 'this_year':
        return datetime(today.year, 1, 1), None
    elif date_filter == 'last_year':
        return datetime(today.year - 1, 1, 1), datetime(today.year - 1, 12, 31, 23, 59, 59)
    elif date_filter == 'all':
        return None, None
    elif date_from or date_to:
        df = datetime.fromisoformat(date_from) if date_from else None
        dt = datetime.fromisoformat(date_to) if date_to else None
        return df, dt
    # Default: no filter (return all)
    return None, None


# ── Leads CRUD ────────────────────────────────────
@router.get("")
def list_leads(
    q: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    source: Optional[str] = None,
    date_filter: Optional[str] = None,   # today/yesterday/this_week/last_week/this_month/last_month/this_year/last_year/all
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 10000,
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

    # Date range filter
    dt_from, dt_to = _resolve_date_range(date_filter, date_from, date_to)
    if dt_from:
        query = query.filter(Lead.created_at >= dt_from)
    if dt_to:
        query = query.filter(Lead.created_at <= dt_to)

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
def get_stats(
    date_filter: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    base = db.query(Lead)
    dt_from, dt_to = _resolve_date_range(date_filter, date_from, date_to)
    if dt_from:
        base = base.filter(Lead.created_at >= dt_from)
    if dt_to:
        base = base.filter(Lead.created_at <= dt_to)

    total = base.count()
    interested          = base.filter(Lead.status == LeadStatus.INTERESTED).count()
    not_answered        = base.filter(Lead.status == LeadStatus.NOT_ANSWERED).count()
    call_later          = base.filter(Lead.status == LeadStatus.CALL_LATER).count()
    quotation_sent      = base.filter(Lead.status == LeadStatus.QUOTATION_SENT).count()
    under_establishment = base.filter(Lead.status == LeadStatus.UNDER_ESTABLISHMENT).count()
    lost                = base.filter(Lead.status == LeadStatus.LOST).count()
    return {
        "total": total,
        "interested": interested,
        "not_answered": not_answered,
        "call_later": call_later,
        "quotation_sent": quotation_sent,
        "under_establishment": under_establishment,
        "lost": lost,
        # legacy aliases kept for compatibility
        "new": 0, "in_progress": interested + quotation_sent,
        "converted": under_establishment,
        "quotation": quotation_sent,
        "conversion_rate": round(under_establishment / total * 100, 1) if total else 0
    }


@router.post("")
def create_lead(body: LeadCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    max_id = db.query(func.max(Lead.id)).scalar() or 0
    data = body.dict()
    for date_field in ("meeting_date", "follow_up_date"):
        if data.get(date_field):
            try:
                data[date_field] = datetime.fromisoformat(data[date_field])
            except Exception:
                data[date_field] = None
    lead = Lead(**data, code=f"LDR-{str(max_id+1).zfill(4)}", created_by=current_user.id)
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


def _check_lead_conflict(record_updated_at, if_unmodified_since: Optional[str]):
    if not if_unmodified_since or not record_updated_at:
        return
    try:
        client_ts = datetime.fromisoformat(if_unmodified_since.replace("Z", "+00:00"))
        if client_ts.tzinfo is None:
            client_ts = client_ts.replace(tzinfo=timezone.utc)
        server_ts = record_updated_at
        if server_ts.tzinfo is None:
            server_ts = server_ts.replace(tzinfo=timezone.utc)
        if server_ts > client_ts + timedelta(milliseconds=100):
            raise HTTPException(status_code=409, detail={
                "conflict": True,
                "message": "تم تعديل هذا السجل من مستخدم آخر. يُرجى تحديث الصفحة للحصول على أحدث البيانات.",
                "server_updated_at": server_ts.isoformat(),
            })
    except HTTPException:
        raise
    except Exception:
        pass


@router.put("/{lead_id}")
def update_lead(
    lead_id: int, body: LeadUpdate,
    x_if_unmodified_since: Optional[str] = Header(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead غير موجود")
    _check_lead_conflict(lead.updated_at, x_if_unmodified_since)

    old_status = lead.status
    for k, v in body.dict(exclude_none=True).items():
        if k in ("meeting_date", "follow_up_date") and v:
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


class QuoteSendEmailRequest(BaseModel):
    to_email: Optional[str] = None

@router.post("/{lead_id}/quote/send-email")
async def send_lead_quote_email(
    lead_id: int,
    req: QuoteSendEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send the embedded lead quote as an HTML email."""
    from app.services.email_service import get_config, send_email_sync

    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead غير موجود")

    cfg = get_config()
    if not cfg.enabled:
        raise HTTPException(400, "البريد الإلكتروني غير مُفعَّل. أضف بيانات SMTP في الإعدادات.")

    to_email = req.to_email or lead.email
    if not to_email:
        raise HTTPException(400, "لا يوجد بريد إلكتروني للعميل.")

    import json as _json

    # ── Map fields: use lead data directly (new design) ──────────────────────
    CT_FULL = {
        'llc': 'شركة ذات مسؤولية محدودة',
        'jsc': 'شركة مساهمة',
        'sole': 'مؤسسة فردية',
        'ngo': 'جمعية',
        'branch': 'فرع',
        'rep': 'مكتب تمثيلي',
        'other': 'أخرى',
    }
    legal_entity  = CT_FULL.get(lead.company_type or '', '') or lead.quote_legal_entity or ''
    activity      = lead.company_activities or lead.quote_activity or ''
    location      = lead.governorate or lead.quote_location or ''
    capital       = lead.estimated_capital or lead.quote_capital or None
    total         = lead.quote_expenses_total or None

    # ── Parse deliver docs [{name, checked}] or legacy [string] ──────────────
    def _parse_docs(raw_json):
        items = []
        try:
            raw = _json.loads(raw_json or '[]')
            for d in raw:
                if isinstance(d, dict):
                    if d.get('checked', True) and d.get('name', '').strip():
                        items.append(d['name'].strip())
                elif isinstance(d, str) and d.strip():
                    items.append(d.strip())
        except Exception:
            pass
        return items

    deliver_docs = _parse_docs(lead.quote_deliver_docs)
    req_docs     = _parse_docs(lead.quote_required_docs)

    # ── Build plain-style personal email (avoids spam filters) ──────────────
    # Marketing/newsletter templates trigger spam. Personal plain style works better.

    info_lines = ""
    if legal_entity:
        info_lines += f"<tr><td style='padding:7px 12px;color:#555;width:38%'>الكيان القانوني</td><td style='padding:7px 12px;color:#111;font-weight:600'>{legal_entity}</td></tr>"
    if activity:
        info_lines += f"<tr><td style='padding:7px 12px;color:#555'>النشاط</td><td style='padding:7px 12px;color:#111;font-weight:600'>{activity}</td></tr>"
    if location:
        info_lines += f"<tr><td style='padding:7px 12px;color:#555'>مقر النشاط</td><td style='padding:7px 12px;color:#111;font-weight:600'>{location}</td></tr>"
    if capital:
        info_lines += f"<tr><td style='padding:7px 12px;color:#555'>رأس المال</td><td style='padding:7px 12px;color:#111;font-weight:600'>{capital:,.0f} جنيه</td></tr>"

    info_table = (
        f"<table style='width:100%;border-collapse:collapse;border:1px solid #ddd;border-radius:6px;margin:12px 0 20px'>"
        f"{info_lines}</table>"
    ) if info_lines else ""

    total_block = ""
    if total:
        total_block = (
            f"<p style='margin:20px 0 8px;font-size:14px;color:#333'>"
            f"<strong>السعر الإجمالي شامل التأسيس والأتعاب:</strong></p>"
            f"<p style='margin:0 0 20px;font-size:22px;font-weight:700;color:#1a5e20'>"
            f"{total:,.0f} جنيه مصري</p>"
        )

    deliver_block = ""
    if deliver_docs:
        items = "".join(f"<li style='margin:5px 0'>{d}</li>" for d in deliver_docs)
        deliver_block = (
            f"<p style='margin:20px 0 6px;font-size:14px;color:#333'><strong>حضرتك هتستلم مننا:</strong></p>"
            f"<ul style='margin:0 0 20px;padding-right:24px;color:#333;font-size:14px;line-height:1.8'>{items}</ul>"
        )

    req_block = ""
    if req_docs:
        items = "".join(f"<li style='margin:5px 0'>{d}</li>" for d in req_docs)
        req_block = (
            f"<p style='margin:20px 0 6px;font-size:14px;color:#333'><strong>المطلوب من حضرتكم:</strong></p>"
            f"<ul style='margin:0 0 20px;padding-right:24px;color:#333;font-size:14px;line-height:1.8'>{items}</ul>"
        )

    notes_block = ""
    if lead.notes and lead.notes.strip():
        notes_block = (
            f"<p style='margin:20px 0 6px;font-size:14px;color:#333'><strong>ملاحظات:</strong></p>"
            f"<p style='margin:0 0 20px;font-size:14px;color:#444;line-height:1.7'>{lead.notes.strip()}</p>"
        )

    subject = f"عرض السعر - {lead.name}"
    html_body = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;direction:rtl;">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px;color:#222;font-size:14px;line-height:1.8">

    <p style="margin:0 0 16px">مساء الخير،</p>
    <p style="margin:0 0 20px">أستاذ / <strong>{lead.name or ''}</strong> — مع حضرتك المستشار عمرو شعبان</p>

    {info_table}
    {total_block}
    {deliver_block}
    {req_block}
    {notes_block}

    <p style="margin:28px 0 4px;color:#444">مع خالص الشكر والتقدير،</p>
    <p style="margin:0 0 4px;font-weight:700;color:#222">المستشار / عمرو شعبان</p>
    <p style="margin:0;font-size:12px;color:#777">مكتب MS Accounting للمحاسبة والاستشارات الضريبية</p>

  </div>
</body>
</html>"""

    try:
        send_email_sync(to_email, subject, html_body, from_name="عمرو شعبان")
        db.add(LeadActivity(lead_id=lead_id, user_id=current_user.id,
                            action="quote_sent", description=f"تم إرسال عرض السعر إلى {to_email}"))
        db.commit()
        return {"success": True, "message": f"تم إرسال عرض السعر بنجاح إلى {to_email}"}
    except Exception as e:
        raise HTTPException(500, f"فشل الإرسال: {str(e)}")


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
