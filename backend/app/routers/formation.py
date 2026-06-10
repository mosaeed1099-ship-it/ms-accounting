"""
Company Formation Cases — Router
Lead → Client → CompanyFormationCase (مستقل)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

from app.core.deps import get_db, get_current_user
from app.models.establishment import CompanyFormationCase, FormationEvent, FORMATION_STAGES, FORMATION_STAGE_KEYS
from app.models.user import User
from app.models.client import Client

router = APIRouter(prefix="/api/formation", tags=["formation"])


# ── Schemas ────────────────────────────────────────────

class CaseCreate(BaseModel):
    company_name: str
    company_name_en: Optional[str] = None
    company_type: Optional[str] = "llc"
    activity: Optional[str] = None
    governorate: Optional[str] = None
    capital: Optional[float] = None
    proposed_names: Optional[str] = None
    client_id: Optional[int] = None
    lead_id: Optional[int] = None
    assigned_to: Optional[int] = None
    agreed_fees: Optional[float] = 0
    government_fees: Optional[float] = 0
    notes: Optional[str] = None

class CaseUpdate(BaseModel):
    company_name: Optional[str] = None
    company_name_en: Optional[str] = None
    company_type: Optional[str] = None
    activity: Optional[str] = None
    governorate: Optional[str] = None
    capital: Optional[float] = None
    proposed_names: Optional[str] = None
    client_id: Optional[int] = None
    assigned_to: Optional[int] = None
    agreed_fees: Optional[float] = None
    government_fees: Optional[float] = None
    total_cost: Optional[float] = None
    commercial_register_number: Optional[str] = None
    tax_card_number: Optional[str] = None
    vat_number: Optional[str] = None
    notes: Optional[str] = None

class StageMove(BaseModel):
    new_stage: str
    notes: Optional[str] = None

class EventAdd(BaseModel):
    event_type: str
    title: str
    description: Optional[str] = None
    amount: Optional[float] = None


# ── Helpers ────────────────────────────────────────────

def _next_code(db: Session) -> str:
    last = db.query(CompanyFormationCase).order_by(CompanyFormationCase.id.desc()).first()
    n = (last.id + 1) if last else 1
    return f"CFC-{n:04d}"

def _case_to_dict(c: CompanyFormationCase, include_events=False) -> dict:
    stage_info = {k: (l, i) for k, l, i in FORMATION_STAGES}
    label, icon = stage_info.get(c.current_stage, (c.current_stage, "📋"))
    d = {
        "id": c.id,
        "code": c.code,
        "company_name": c.company_name,
        "company_name_en": c.company_name_en,
        "company_type": c.company_type,
        "activity": c.activity,
        "governorate": c.governorate,
        "capital": c.capital,
        "proposed_names": c.proposed_names,
        "client_id": c.client_id,
        "client_name": c.client.name if c.client else None,
        "lead_id": c.lead_id,
        "assigned_to": c.assigned_to,
        "assigned_name": c.assigned_user.name if c.assigned_user else None,
        "current_stage": c.current_stage,
        "stage_label": label,
        "stage_icon": icon,
        "stage_index": c.stage_index,
        "progress": c.progress,
        "agreed_fees": c.agreed_fees,
        "government_fees": c.government_fees,
        "total_cost": c.total_cost,
        "commercial_register_number": c.commercial_register_number,
        "tax_card_number": c.tax_card_number,
        "vat_number": c.vat_number,
        "is_completed": c.is_completed,
        "is_cancelled": c.is_cancelled,
        "notes": c.notes,
        "stage_entered_at": c.stage_entered_at.isoformat() if c.stage_entered_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "completed_at": c.completed_at.isoformat() if c.completed_at else None,
    }
    if include_events:
        d["events"] = [_event_to_dict(e) for e in c.events]
    return d

def _event_to_dict(e: FormationEvent) -> dict:
    return {
        "id": e.id,
        "case_id": e.case_id,
        "event_type": e.event_type,
        "title": e.title,
        "description": e.description,
        "old_stage": e.old_stage,
        "new_stage": e.new_stage,
        "amount": e.amount,
        "created_by": e.created_by,
        "created_by_name": e.created_by_name or (e.user.name if e.user else None),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }

def _add_event(db, case_id, event_type, title, user, description=None,
               old_stage=None, new_stage=None, amount=None):
    ev = FormationEvent(
        case_id=case_id,
        event_type=event_type,
        title=title,
        description=description,
        old_stage=old_stage,
        new_stage=new_stage,
        amount=amount,
        created_by=user.id,
        created_by_name=user.name,
        created_at=datetime.utcnow(),
    )
    db.add(ev)


# ── Endpoints ──────────────────────────────────────────

@router.get("")
def list_cases(
    stage: Optional[str] = None,
    client_id: Optional[int] = None,
    assigned_to: Optional[int] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(CompanyFormationCase).filter(CompanyFormationCase.is_cancelled == False)
    if stage:       query = query.filter(CompanyFormationCase.current_stage == stage)
    if client_id:   query = query.filter(CompanyFormationCase.client_id == client_id)
    if assigned_to: query = query.filter(CompanyFormationCase.assigned_to == assigned_to)
    if q:
        query = query.filter(CompanyFormationCase.company_name.ilike(f"%{q}%"))
    total = query.count()
    items = query.order_by(CompanyFormationCase.created_at.desc()) \
                 .offset((page-1)*page_size).limit(page_size).all()
    return {"total": total, "items": [_case_to_dict(c) for c in items]}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """عدد الملفات في كل مرحلة للـ dashboard"""
    all_active = db.query(CompanyFormationCase).filter(
        CompanyFormationCase.is_cancelled == False
    ).all()
    stage_counts = {}
    for key, label, icon in FORMATION_STAGES:
        count = sum(1 for c in all_active if c.current_stage == key)
        stage_counts[key] = {"label": label, "icon": icon, "count": count}
    return {
        "total": len(all_active),
        "completed": sum(1 for c in all_active if c.is_completed),
        "in_progress": sum(1 for c in all_active if not c.is_completed),
        "stages": stage_counts,
    }


@router.post("")
def create_case(
    body: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = CompanyFormationCase(
        code=_next_code(db),
        company_name=body.company_name,
        company_name_en=body.company_name_en,
        company_type=body.company_type or "llc",
        activity=body.activity,
        governorate=body.governorate,
        capital=body.capital,
        proposed_names=body.proposed_names,
        client_id=body.client_id,
        lead_id=body.lead_id,
        assigned_to=body.assigned_to,
        agreed_fees=body.agreed_fees or 0,
        government_fees=body.government_fees or 0,
        notes=body.notes,
        current_stage="name_reservation",
        stage_entered_at=datetime.utcnow(),
        created_by=current_user.id,
    )
    db.add(case)
    db.flush()
    _add_event(db, case.id, "created", "تم إنشاء ملف التأسيس",
               current_user, new_stage="name_reservation")
    db.commit()
    db.refresh(case)

    # Auto-generate formation obligations from default template
    try:
        from app.models.service_template import ServiceTemplate, FormationObligation
        from datetime import timedelta
        type_map = {
            "llc":    "تأسيس شركة ذ.م.م",
            "ngo":    "جمعية أهلية",
            "branch": "فرع شركة أجنبية",
        }
        tpl_name = type_map.get(case.company_type)
        if tpl_name:
            tpl = db.query(ServiceTemplate).filter_by(name=tpl_name).first()
            if tpl and tpl.steps:
                now = datetime.utcnow()
                cumulative = 0
                for step in tpl.steps:
                    cumulative += step.default_days
                    db.add(FormationObligation(
                        case_id=case.id,
                        template_id=tpl.id,
                        step_id=step.id,
                        name=step.name,
                        description=step.description,
                        status="not_started",
                        order_index=step.order_index,
                        due_date=now + timedelta(days=cumulative),
                        required_docs=step.required_docs,
                    ))
                db.commit()
    except Exception:
        pass  # Do not block case creation if template generation fails

    return _case_to_dict(case)


@router.get("/{case_id}")
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(CompanyFormationCase).get(case_id)
    if not case: raise HTTPException(404, "ملف التأسيس غير موجود")
    return _case_to_dict(case, include_events=True)


@router.put("/{case_id}")
def update_case(
    case_id: int,
    body: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(CompanyFormationCase).get(case_id)
    if not case: raise HTTPException(404)
    for field, val in body.dict(exclude_none=True).items():
        setattr(case, field, val)
    case.updated_at = datetime.utcnow()
    _add_event(db, case.id, "updated", "تم تحديث بيانات الملف", current_user)
    db.commit()
    db.refresh(case)
    return _case_to_dict(case)


@router.post("/{case_id}/move")
def move_stage(
    case_id: int,
    body: StageMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """نقل الملف للمرحلة التالية أو أي مرحلة"""
    case = db.query(CompanyFormationCase).get(case_id)
    if not case: raise HTTPException(404)
    if body.new_stage not in FORMATION_STAGE_KEYS:
        raise HTTPException(400, f"مرحلة غير صحيحة: {body.new_stage}")

    old_stage = case.current_stage
    # Get labels
    stage_map = {k: l for k, l, _ in FORMATION_STAGES}
    old_label = stage_map.get(old_stage, old_stage)
    new_label = stage_map.get(body.new_stage, body.new_stage)

    case.current_stage = body.new_stage
    case.stage_entered_at = datetime.utcnow()
    case.updated_at = datetime.utcnow()

    if body.new_stage == "completed":
        case.is_completed = True
        case.completed_at = datetime.utcnow()

    _add_event(
        db, case.id, "stage_change",
        f"انتقل من «{old_label}» إلى «{new_label}»",
        current_user,
        description=body.notes,
        old_stage=old_stage,
        new_stage=body.new_stage,
    )
    db.commit()
    db.refresh(case)
    return _case_to_dict(case, include_events=True)


@router.post("/{case_id}/events")
def add_event(
    case_id: int,
    body: EventAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(CompanyFormationCase).get(case_id)
    if not case: raise HTTPException(404)
    _add_event(db, case_id, body.event_type, body.title,
               current_user, description=body.description, amount=body.amount)
    # Auto-capture formation payment → Office Revenue
    if body.event_type == "payment_received" and body.amount and body.amount > 0:
        try:
            from app.routers.office_finance import auto_capture_revenue
            from datetime import date as _date
            auto_capture_revenue(
                db, amount=body.amount, category="formation",
                tx_date=_date.today(),
                description=f"دفعة تأسيس — {case.company_name or case_id}",
                client_name=case.company_name,
                source_type="formation", source_id=case_id,
                created_by=current_user.id,
            )
        except Exception:
            pass
    db.commit()
    events = db.query(FormationEvent).filter_by(case_id=case_id) \
               .order_by(FormationEvent.created_at.desc()).all()
    return [_event_to_dict(e) for e in events]


@router.get("/{case_id}/events")
def get_events(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events = db.query(FormationEvent).filter_by(case_id=case_id) \
               .order_by(FormationEvent.created_at.desc()).all()
    return [_event_to_dict(e) for e in events]


@router.delete("/{case_id}")
def cancel_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(CompanyFormationCase).get(case_id)
    if not case: raise HTTPException(404)
    case.is_cancelled = True
    case.updated_at = datetime.utcnow()
    _add_event(db, case.id, "cancelled", "تم إلغاء ملف التأسيس", current_user)
    db.commit()
    return {"ok": True}
