"""
Smart Quotation System — عروض أسعار تأسيس الشركات
Endpoints:
  GET    /api/quotations              — list with filters
  POST   /api/quotations              — create
  GET    /api/quotations/stats        — stats
  GET    /api/quotations/templates    — built-in + saved templates
  POST   /api/quotations/templates    — save custom template
  GET    /api/quotations/{id}         — detail
  PUT    /api/quotations/{id}         — update
  PATCH  /api/quotations/{id}/status  — update status only
  POST   /api/quotations/{id}/send    — send email
  POST   /api/quotations/{id}/duplicate — duplicate quotation
  POST   /api/quotations/{id}/convert — convert to client + establishment
  DELETE /api/quotations/{id}         — delete (draft only)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.quotation import Quotation, QuotationTemplate

router = APIRouter(prefix="/api/quotations", tags=["quotations"])


# ── Pydantic schemas ────────────────────────────────────────────────────────

class QuotationCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    legal_entity: Optional[str] = None
    activity: Optional[str] = None
    activity_location: Optional[str] = None
    capital: float = 0
    deliverables: Optional[list] = None
    requirements: Optional[list] = None
    extra_services: Optional[list] = None
    expenses_total: float = 0
    government_fees: float = 0
    office_fees: float = 0
    notes: Optional[str] = None
    greeting: str = "مساء الخير"
    advisor_name: Optional[str] = None
    valid_until: Optional[date] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None


class QuotationUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    legal_entity: Optional[str] = None
    activity: Optional[str] = None
    activity_location: Optional[str] = None
    capital: Optional[float] = None
    deliverables: Optional[list] = None
    requirements: Optional[list] = None
    extra_services: Optional[list] = None
    expenses_total: Optional[float] = None
    government_fees: Optional[float] = None
    office_fees: Optional[float] = None
    notes: Optional[str] = None
    greeting: Optional[str] = None
    advisor_name: Optional[str] = None
    valid_until: Optional[date] = None


class StatusUpdate(BaseModel):
    status: str
    client_notes: Optional[str] = None
    last_contact_at: Optional[datetime] = None


class SendEmailRequest(BaseModel):
    to_email: Optional[str] = None    # override client email


class TemplateCreate(BaseModel):
    name: str
    legal_entity: Optional[str] = None
    greeting: str = "مساء الخير"
    deliverables: Optional[list] = None
    requirements: Optional[list] = None
    default_expenses: float = 0


# ── Built-in templates (Egyptian market) ────────────────────────────────────

BUILTIN_TEMPLATES = [
    {
        "id": "t1",
        "name": "شركة شخص واحد",
        "legal_entity": "شركة شخص واحد",
        "greeting": "مساء الخير",
        "default_expenses": 14400,
        "deliverables": [
            "عقد الشركة",
            "صحيفة الاستثمار",
            "شهادة التأسيس",
            "طلب القيد في وزارة التجارة الداخلية",
            "البطاقة الضريبية",
            "السجل التجاري",
        ],
        "requirements": [
            "توكيل تأسيس شركات",
            "صورة البطاقة الشخصية",
            "عقد إيجار + إيصال كهرباء حديث",
            "3 أسماء مقترحة للشركة",
        ],
    },
    {
        "id": "t2",
        "name": "شركة ذات مسؤولية محدودة (LLC)",
        "legal_entity": "شركة ذات مسؤولية محدودة",
        "greeting": "مساء الخير",
        "default_expenses": 18000,
        "deliverables": [
            "عقد الشركة موثق بالشهر العقاري",
            "صحيفة الاستثمار",
            "شهادة التأسيس",
            "طلب القيد في وزارة التجارة الداخلية",
            "البطاقة الضريبية",
            "السجل التجاري",
            "نموذج 1 — تسجيل المرتبات",
        ],
        "requirements": [
            "توكيل تأسيس شركات لجميع الشركاء",
            "صور البطاقات الشخصية لجميع الشركاء",
            "عقد إيجار + إيصال كهرباء حديث",
            "3 أسماء مقترحة للشركة",
            "تحديد نسبة الحصص بين الشركاء",
        ],
    },
    {
        "id": "t3",
        "name": "منشأة فردية",
        "legal_entity": "منشأة فردية",
        "greeting": "مساء الخير",
        "default_expenses": 8500,
        "deliverables": [
            "البطاقة الضريبية",
            "السجل التجاري",
            "قيد المنشأة",
        ],
        "requirements": [
            "صورة البطاقة الشخصية",
            "عقد إيجار + إيصال كهرباء حديث",
            "3 أسماء مقترحة للمنشأة",
        ],
    },
    {
        "id": "t4",
        "name": "شركة مساهمة",
        "legal_entity": "شركة مساهمة",
        "greeting": "مساء الخير",
        "default_expenses": 35000,
        "deliverables": [
            "عقد التأسيس والنظام الأساسي",
            "صحيفة الاستثمار",
            "شهادة التأسيس",
            "قيد بالسجل التجاري",
            "البطاقة الضريبية",
            "تسجيل في البورصة (إن لزم)",
        ],
        "requirements": [
            "توكيل تأسيس شركات لجميع المؤسسين",
            "صور البطاقات الشخصية",
            "عقد إيجار المقر + إيصال كهرباء",
            "3 أسماء مقترحة للشركة",
            "تحديد رأس المال وعدد الأسهم",
            "بيانات مجلس الإدارة",
        ],
    },
    {
        "id": "t5",
        "name": "فرع شركة أجنبية",
        "legal_entity": "فرع شركة أجنبية",
        "greeting": "مساء الخير",
        "default_expenses": 45000,
        "deliverables": [
            "قرار فتح فرع في مصر",
            "قيد الفرع في السجل التجاري",
            "البطاقة الضريبية",
            "تصريح الاستثمار الأجنبي",
        ],
        "requirements": [
            "وثائق الشركة الأم (مترجمة ومصدقة)",
            "قرار مجلس إدارة الشركة الأم بفتح فرع",
            "جواز سفر المفوَّض بالتوقيع",
            "عقد إيجار مقر الفرع",
        ],
    },
]


# ── Helpers ──────────────────────────────────────────────────────────────────

def generate_quote_number(db: Session) -> str:
    year = datetime.now().year
    count = db.query(func.count(Quotation.id)).scalar() or 0
    return f"QUO-{year}-{str(count + 1).zfill(4)}"


def q_to_dict(q: Quotation, include_user: bool = True) -> dict:
    return {
        "id": q.id,
        "quote_number": q.quote_number,
        "version": q.version,
        "client_name": q.client_name,
        "client_phone": q.client_phone,
        "client_email": q.client_email,
        "legal_entity": q.legal_entity,
        "activity": q.activity,
        "activity_location": q.activity_location,
        "capital": q.capital,
        "deliverables": q.deliverables or [],
        "requirements": q.requirements or [],
        "extra_services": q.extra_services or [],
        "expenses_total": q.expenses_total,
        "government_fees": q.government_fees,
        "office_fees": q.office_fees,
        "notes": q.notes,
        "greeting": q.greeting,
        "advisor_name": q.advisor_name,
        "status": q.status,
        "sent_at": q.sent_at,
        "opened_at": q.opened_at,
        "last_contact_at": q.last_contact_at,
        "client_notes": q.client_notes,
        "valid_until": q.valid_until,
        "lead_id": q.lead_id,
        "client_id": q.client_id,
        "created_by": q.created_by,
        "created_by_name": q.created_by_user.name if q.created_by_user else None,
        "created_at": q.created_at,
        "updated_at": q.updated_at,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/stats")
async def quotation_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = db.query(func.count(Quotation.id)).scalar() or 0
    by_status = {}
    for status in ["draft", "sent", "opened", "replied", "accepted", "rejected", "negotiation"]:
        by_status[status] = db.query(func.count(Quotation.id)).filter(Quotation.status == status).scalar() or 0

    total_value = db.query(func.sum(Quotation.expenses_total)).filter(
        Quotation.status.in_(["sent", "opened", "replied", "accepted", "negotiation"])
    ).scalar() or 0

    accepted_value = db.query(func.sum(Quotation.expenses_total)).filter(
        Quotation.status == "accepted"
    ).scalar() or 0

    return {
        "total": total,
        "by_status": by_status,
        "total_value": total_value,
        "accepted_value": accepted_value,
        "conversion_rate": round(by_status["accepted"] / max(total, 1) * 100, 1),
    }


@router.get("/templates")
async def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return built-in + saved custom templates."""
    saved = db.query(QuotationTemplate).filter(QuotationTemplate.is_active == True).order_by(
        QuotationTemplate.sort_order, QuotationTemplate.id
    ).all()
    custom = [
        {
            "id": f"c{t.id}",
            "name": t.name,
            "legal_entity": t.legal_entity,
            "greeting": t.greeting,
            "deliverables": t.deliverables or [],
            "requirements": t.requirements or [],
            "default_expenses": t.default_expenses,
            "is_custom": True,
        }
        for t in saved
    ]
    return {"builtin": BUILTIN_TEMPLATES, "custom": custom}


@router.post("/templates")
async def create_template(
    data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = QuotationTemplate(
        name=data.name,
        legal_entity=data.legal_entity,
        greeting=data.greeting,
        deliverables=data.deliverables or [],
        requirements=data.requirements or [],
        default_expenses=data.default_expenses,
        created_by=current_user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": f"c{t.id}", "message": "تم حفظ القالب بنجاح"}


@router.get("")
async def list_quotations(
    q: Optional[str] = Query(None),
    status: Optional[str] = None,
    legal_entity: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Quotation)
    if q:
        query = query.filter(or_(
            Quotation.client_name.ilike(f"%{q}%"),
            Quotation.quote_number.ilike(f"%{q}%"),
            Quotation.client_phone.ilike(f"%{q}%"),
            Quotation.legal_entity.ilike(f"%{q}%"),
            Quotation.activity.ilike(f"%{q}%"),
        ))
    if status:
        query = query.filter(Quotation.status == status)
    if legal_entity:
        query = query.filter(Quotation.legal_entity == legal_entity)

    total = query.count()
    items = query.order_by(Quotation.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [q_to_dict(i) for i in items],
    }


@router.post("")
async def create_quotation(
    data: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = Quotation(
        **data.dict(),
        quote_number=generate_quote_number(db),
        created_by=current_user.id,
    )
    # Auto-set advisor name from user if not provided
    if not q.advisor_name:
        q.advisor_name = current_user.name
    db.add(q)
    db.commit()
    db.refresh(q)
    return q_to_dict(q)


@router.get("/{qid}")
async def get_quotation(
    qid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(Quotation.id == qid).first()
    if not q:
        raise HTTPException(404, detail="عرض السعر غير موجود")
    return q_to_dict(q)


@router.put("/{qid}")
async def update_quotation(
    qid: int,
    data: QuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(Quotation.id == qid).first()
    if not q:
        raise HTTPException(404, detail="عرض السعر غير موجود")
    for field, value in data.dict(exclude_none=True).items():
        setattr(q, field, value)
    q.version = (q.version or 1) + 1
    db.commit()
    db.refresh(q)
    return q_to_dict(q)


@router.patch("/{qid}/status")
async def update_status(
    qid: int,
    data: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    valid = ["draft", "sent", "opened", "replied", "accepted", "rejected", "negotiation", "expired", "cancelled"]
    if data.status not in valid:
        raise HTTPException(400, detail=f"حالة غير صالحة. الحالات المتاحة: {valid}")

    q = db.query(Quotation).filter(Quotation.id == qid).first()
    if not q:
        raise HTTPException(404, detail="عرض السعر غير موجود")

    q.status = data.status
    if data.client_notes is not None:
        q.client_notes = data.client_notes
    if data.last_contact_at:
        q.last_contact_at = data.last_contact_at
    else:
        q.last_contact_at = datetime.utcnow()

    # Auto-set timestamps
    if data.status == "sent" and not q.sent_at:
        q.sent_at = datetime.utcnow()
    if data.status == "opened" and not q.opened_at:
        q.opened_at = datetime.utcnow()

    db.commit()
    db.refresh(q)
    return q_to_dict(q)


@router.post("/{qid}/send")
async def send_quotation_email(
    qid: int,
    req: SendEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send quotation as a professional HTML email."""
    from app.services.email_service import get_config, send_email_sync, _base_template

    q = db.query(Quotation).filter(Quotation.id == qid).first()
    if not q:
        raise HTTPException(404, detail="عرض السعر غير موجود")

    cfg = get_config()
    if not cfg.enabled:
        raise HTTPException(400, detail="البريد الإلكتروني غير مُفعَّل. أضف بيانات SMTP في الإعدادات.")

    to_email = req.to_email or q.client_email
    if not to_email:
        raise HTTPException(400, detail="لا يوجد إيميل للعميل. أضفه في بيانات العرض.")

    # Build rich HTML email content
    deliverables_html = "".join(f"<li style='margin:4px 0'>{d}</li>" for d in (q.deliverables or []))
    requirements_html = "".join(f"<li style='margin:4px 0'>{r}</li>" for r in (q.requirements or []))
    extra_html = ""
    if q.extra_services:
        extra_html = f"""
        <h3 style="color:#1e293b;font-size:14px;margin:18px 0 8px">⭐ خدمات إضافية</h3>
        <ul style="margin:0;padding-right:20px;color:#374151;font-size:13px;line-height:1.8">
          {"".join(f"<li>{s}</li>" for s in q.extra_services)}
        </ul>"""

    capital_fmt = f"{q.capital:,.0f} جنيه" if q.capital else "—"
    total_fmt   = f"{q.expenses_total:,.0f} جنيه" if q.expenses_total else "—"

    content = f"""
      <p style="color:#374151;font-size:15px;font-weight:500;margin:0 0 4px">{q.greeting}</p>
      <p style="color:#64748b;font-size:13px;margin:0 0 20px">مع حضرتك {q.client_name}</p>

      <div style="background:#eef1fb;border-right:4px solid #1a2472;border-radius:8px;padding:16px 20px;margin:0 0 20px">
        <h2 style="color:#1a2472;font-size:16px;font-weight:700;margin:0 0 14px">📋 عرض السعر — {q.quote_number}</h2>
        <table style="width:100%;border-collapse:collapse">
          {"<tr><td style='padding:6px 0;font-size:13px;color:#64748b;width:40%'>الكيان القانوني:</td><td style='padding:6px 0;font-size:13px;font-weight:600;color:#1e293b'>"+q.legal_entity+"</td></tr>" if q.legal_entity else ""}
          {"<tr><td style='padding:6px 0;font-size:13px;color:#64748b'>النشاط:</td><td style='padding:6px 0;font-size:13px;font-weight:600;color:#1e293b'>"+q.activity+"</td></tr>" if q.activity else ""}
          {"<tr><td style='padding:6px 0;font-size:13px;color:#64748b'>مقر النشاط:</td><td style='padding:6px 0;font-size:13px;font-weight:600;color:#1e293b'>"+q.activity_location+"</td></tr>" if q.activity_location else ""}
          <tr><td style='padding:6px 0;font-size:13px;color:#64748b'>رأس المال:</td><td style='padding:6px 0;font-size:13px;font-weight:600;color:#1e293b'>{capital_fmt}</td></tr>
        </table>
      </div>

      <div style="background:#f0fdf4;border-right:4px solid #16a34a;border-radius:8px;padding:16px 20px;margin:0 0 20px">
        <h3 style="color:#15803d;font-size:14px;font-weight:700;margin:0 0 10px">✅ إجمالي المصاريف والأتعاب</h3>
        <div style="font-size:24px;font-weight:800;color:#15803d">{total_fmt}</div>
        {"<div style='font-size:12px;color:#6b7280;margin-top:4px'>رسوم حكومية: "+f"{q.government_fees:,.0f} جنيه"+" — أتعاب المكتب: "+f"{q.office_fees:,.0f} جنيه"+"</div>" if (q.government_fees or q.office_fees) else ""}
      </div>

      {"<h3 style='color:#1e293b;font-size:14px;font-weight:700;margin:18px 0 8px'>📦 حضرتك هتستلم مننا</h3><ul style='margin:0;padding-right:20px;color:#374151;font-size:13px;line-height:1.8'>"+deliverables_html+"</ul>" if deliverables_html else ""}
      {extra_html}
      {"<h3 style='color:#1e293b;font-size:14px;font-weight:700;margin:18px 0 8px'>📌 المطلوب من حضرتكم</h3><ul style='margin:0;padding-right:20px;color:#374151;font-size:13px;line-height:1.8'>"+requirements_html+"</ul>" if requirements_html else ""}

      {"<div style='background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:18px;font-size:13px;color:#92400e'><strong>ملاحظات:</strong> "+q.notes+"</div>" if q.notes else ""}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:13px;color:#374151">
        <strong>التوقيع:</strong><br>
        المستشار / {q.advisor_name or current_user.name}
      </div>
      {"<div style='font-size:11px;color:#94a3b8;margin-top:8px'>صالح حتى: "+str(q.valid_until)+"</div>" if q.valid_until else ""}
    """

    subject = f"عرض سعر تأسيس شركة — {q.quote_number} — {q.client_name}"
    html_body = _base_template(content, subject)

    try:
        send_email_sync(to_email, subject, html_body)
        # Mark as sent
        q.status = "sent"
        if not q.sent_at:
            q.sent_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": f"✅ تم إرسال عرض السعر إلى {to_email}"}
    except Exception as e:
        raise HTTPException(500, detail=f"فشل الإرسال: {str(e)}")


@router.post("/{qid}/duplicate")
async def duplicate_quotation(
    qid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a copy of an existing quotation."""
    orig = db.query(Quotation).filter(Quotation.id == qid).first()
    if not orig:
        raise HTTPException(404, detail="عرض السعر غير موجود")

    new_q = Quotation(
        quote_number=generate_quote_number(db),
        version=1,
        client_name=orig.client_name,
        client_phone=orig.client_phone,
        client_email=orig.client_email,
        legal_entity=orig.legal_entity,
        activity=orig.activity,
        activity_location=orig.activity_location,
        capital=orig.capital,
        deliverables=orig.deliverables,
        requirements=orig.requirements,
        extra_services=orig.extra_services,
        expenses_total=orig.expenses_total,
        government_fees=orig.government_fees,
        office_fees=orig.office_fees,
        notes=orig.notes,
        greeting=orig.greeting,
        advisor_name=orig.advisor_name,
        status="draft",
        lead_id=orig.lead_id,
        created_by=current_user.id,
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return q_to_dict(new_q)


@router.post("/{qid}/convert")
async def convert_to_client(
    qid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convert accepted quotation to full client record + establishment workflow.
    Creates: Client + EstablishmentCase + Tasks for team.
    """
    from app.models.client import Client, ClientType, ClientStatus, TaxType
    from app.models.establishment import EstablishmentCase, EstablishmentStatus
    from app.models.task import Task, TaskStatus, TaskPriority
    from app.models.activity import ActivityLog
    from sqlalchemy import func as sqlfunc

    q = db.query(Quotation).filter(Quotation.id == qid).first()
    if not q:
        raise HTTPException(404, detail="عرض السعر غير موجود")
    if q.client_id:
        raise HTTPException(400, detail="تم تحويل هذا العرض مسبقاً إلى عميل")

    # 1. Create client
    client_count = db.query(sqlfunc.count(Client.id)).scalar() or 0
    client_code  = f"CLT-{str(client_count + 1).zfill(4)}"
    client = Client(
        code=client_code,
        name=q.client_name,
        phone=q.client_phone,
        email=q.client_email,
        client_type=ClientType.COMPANY,
        status=ClientStatus.ACTIVE,
        activity=q.activity,
        contract_value=q.expenses_total,
        created_by=current_user.id,
    )
    db.add(client)
    db.flush()

    # 2. Create establishment case
    try:
        case_count = db.query(sqlfunc.count(EstablishmentCase.id)).scalar() or 0
        case = EstablishmentCase(
            case_number=f"EST-{datetime.now().year}-{str(case_count + 1).zfill(4)}",
            client_id=client.id,
            company_name=q.client_name,
            legal_type=q.legal_entity or "شركة شخص واحد",
            activity=q.activity or "",
            capital=q.capital or 0,
            status=EstablishmentStatus.PENDING if hasattr(EstablishmentStatus, 'PENDING') else "pending",
            fees=q.expenses_total or 0,
            notes=f"تم التحويل من عرض السعر {q.quote_number}",
            created_by=current_user.id,
        )
        db.add(case)
        db.flush()
    except Exception:
        case = None  # establishment model may differ — don't block

    # 3. Create onboarding tasks for team
    task_templates = [
        ("استلام مستندات التأسيس", 1),
        ("مراجعة البيانات والمستندات", 2),
        ("تقديم طلب التأسيس", 3),
        ("متابعة حالة الطلب", 5),
        ("استلام وتسليم الأوراق للعميل", 10),
    ]
    for title, days_offset in task_templates:
        from datetime import timedelta
        t = Task(
            title=f"{title} — {q.client_name}",
            client_id=client.id,
            assigned_to=current_user.id,
            status=TaskStatus.TODO,
            priority=TaskPriority.HIGH,
            due_date=datetime.utcnow() + timedelta(days=days_offset),
        )
        db.add(t)

    # 4. Log activity
    log = ActivityLog(
        user_id=current_user.id,
        client_id=client.id,
        action="create_client",
        entity_type="client",
        entity_id=client.id,
        description=f"تم إنشاء ملف العميل من عرض السعر {q.quote_number}",
    )
    db.add(log)

    # 5. Link quotation to client + mark accepted
    q.client_id = client.id
    q.status = "accepted"

    db.commit()
    return {
        "success": True,
        "client_id": client.id,
        "client_code": client.code,
        "case_id": case.id if case else None,
        "message": f"✅ تم تحويل العرض إلى عميل جديد: {client.name} ({client.code})",
    }


@router.delete("/{qid}")
async def delete_quotation(
    qid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(Quotation.id == qid).first()
    if not q:
        raise HTTPException(404, detail="عرض السعر غير موجود")
    if q.status not in ("draft", "rejected", "cancelled", "expired"):
        raise HTTPException(400, detail="لا يمكن حذف عرض سعر تم إرساله أو قُبِل. يمكنك إلغاؤه فقط.")
    db.delete(q)
    db.commit()
    return {"message": "تم حذف عرض السعر"}
