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
    for date_field in ("meeting_date", "follow_up_date"):
        if data.get(date_field):
            try:
                data[date_field] = datetime.fromisoformat(data[date_field])
            except Exception:
                data[date_field] = None
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

    # ── Build HTML sections ───────────────────────────────────────────────────
    def _row(label, val):
        return (
            f"<tr>"
            f"<td style='padding:10px 14px;font-size:13px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;width:40%'>{label}</td>"
            f"<td style='padding:10px 14px;font-size:13px;font-weight:700;color:#1a2472;border-bottom:1px solid #e2e8f0'>{val}</td>"
            f"</tr>"
        )

    info_rows = ""
    if legal_entity:
        info_rows += _row("الكيان القانوني", legal_entity)
    if activity:
        info_rows += _row("النشاط", activity)
    if location:
        info_rows += _row("مقر النشاط", location)
    if capital:
        info_rows += _row("رأس المال", f"{capital:,.0f} جنيه")

    deliver_items = "".join(
        f"<li style='margin:8px 0;font-size:14px;color:#1e293b;line-height:1.7'>{d}</li>"
        for d in deliver_docs
    )
    req_items = "".join(
        f"<li style='margin:8px 0;font-size:14px;color:#1e293b;line-height:1.7'>{d}</li>"
        for d in req_docs
    )

    notes_section = ""
    if lead.notes and lead.notes.strip():
        notes_section = f"""
        <div style="margin:0 0 24px;background:#fffbeb;border-right:4px solid #f59e0b;border-radius:8px;padding:14px 18px;">
          <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">ملاحظات</div>
          <div style="font-size:13px;color:#374151;line-height:1.7">{lead.notes.strip()}</div>
        </div>"""

    total_section = ""
    if total:
        total_section = f"""
        <div style="margin:0 0 28px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #86efac;border-radius:12px;padding:20px 24px;text-align:center;">
          <div style="font-size:13px;color:#15803d;font-weight:600;margin-bottom:8px">السعر شامل التأسيس والأتعاب</div>
          <div style="font-size:32px;font-weight:800;color:#15803d;letter-spacing:-1px">{total:,.0f}</div>
          <div style="font-size:14px;color:#16a34a;font-weight:600;margin-top:2px">جنيه مصري</div>
        </div>"""

    deliver_section = ""
    if deliver_items:
        deliver_section = f"""
        <div style="margin:0 0 24px;border-radius:10px;overflow:hidden;border:1.5px solid #c7d2fe;">
          <div style="background:#1a2472;color:white;padding:12px 20px;font-size:14px;font-weight:700;">
            📄 حضرتك هتستلم مننا
          </div>
          <div style="padding:16px 22px;background:#f8faff;">
            <ul style="margin:0;padding-right:20px;">{deliver_items}</ul>
          </div>
        </div>"""

    req_section = ""
    if req_items:
        req_section = f"""
        <div style="margin:0 0 24px;border-radius:10px;overflow:hidden;border:1.5px solid #fde68a;">
          <div style="background:#d97706;color:white;padding:12px 20px;font-size:14px;font-weight:700;">
            📋 المطلوب من حضرتكم
          </div>
          <div style="padding:16px 22px;background:#fffdf5;">
            <ul style="margin:0;padding-right:20px;">{req_items}</ul>
          </div>
        </div>"""

    from datetime import datetime as _dt
    today_str = _dt.now().strftime("%Y/%m/%d")

    subject = f"عرض سعر تأسيس شركة — {lead.name}"
    html_body = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a2472 0%,#0f1848 100%);padding:30px 32px 24px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:.5px;">MS Accounting</div>
      <div style="font-size:13px;color:#b3c4e8;margin-top:6px;">مكتب المحاسبة والاستشارات الضريبية</div>
      <div style="margin-top:12px;display:inline-block;background:rgba(255,255,255,.12);border-radius:20px;padding:5px 18px;">
        <span style="color:#fbbf24;font-size:12px;font-weight:700;">عرض سعر</span>
        <span style="color:#94a3b8;font-size:11px;margin-right:8px;">{today_str}</span>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <!-- Greeting -->
      <p style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 4px;">مساء الخير،</p>
      <p style="font-size:14px;color:#64748b;margin:0 0 28px;">
        أستاذ / <strong style="color:#1a2472">{lead.name or ''}</strong> —
        مع حضرتك <strong style="color:#1a2472">المستشار عمرو شعبان</strong>
      </p>

      <!-- Info table -->
      {"<div style='margin:0 0 28px;border-radius:10px;overflow:hidden;border:1.5px solid #e2e8f0;'><table style='width:100%;border-collapse:collapse;'>" + info_rows + "</table></div>" if info_rows else ""}

      <!-- Total -->
      {total_section}

      <!-- Deliver docs -->
      {deliver_section}

      <!-- Required docs -->
      {req_section}

      <!-- Notes -->
      {notes_section}

      <!-- Signature -->
      <div style="margin-top:28px;padding-top:20px;border-top:2px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:15px;font-weight:800;color:#1a2472;">المستشار / عمرو شعبان</div>
          <div style="font-size:12px;color:#64748b;margin-top:3px;">مكتب MS Accounting للمحاسبة والاستشارات الضريبية</div>
        </div>
        <div style="background:#eef1fb;border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;font-size:22px;">🏛️</div>
      </div>

    </div><!-- /body -->

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">هذا البريد أُرسل تلقائياً من نظام MS Accounting</p>
    </div>

  </div>
</body>
</html>"""

    try:
        send_email_sync(to_email, subject, html_body)
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
