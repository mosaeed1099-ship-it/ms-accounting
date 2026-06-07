"""
Formation Obligations — Full CRUD + auto-generate + stats
التزامات التأسيس مع التوليد التلقائي والإحصاءات
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.core.deps import get_db, get_current_user
from app.models.service_template import FormationObligation, ServiceTemplate, ServiceTemplateStep
from app.models.establishment import CompanyFormationCase, FormationEvent
from app.models.user import User

router = APIRouter(tags=["formation_obligations"])


# ── Schemas ────────────────────────────────────────────

class OblCreate(BaseModel):
    case_id: int
    name: str
    description: Optional[str] = None
    status: Optional[str] = "not_started"
    order_index: Optional[int] = 0
    due_date: Optional[datetime] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None
    required_docs: Optional[str] = None
    template_id: Optional[int] = None
    step_id: Optional[int] = None

class OblUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    order_index: Optional[int] = None
    due_date: Optional[datetime] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None
    required_docs: Optional[str] = None


# ── Helpers ────────────────────────────────────────────

def _obl_dict(o: FormationObligation) -> dict:
    return {
        "id": o.id,
        "case_id": o.case_id,
        "template_id": o.template_id,
        "step_id": o.step_id,
        "name": o.name,
        "description": o.description,
        "status": o.status,
        "order_index": o.order_index,
        "due_date": o.due_date.isoformat() if o.due_date else None,
        "completed_at": o.completed_at.isoformat() if o.completed_at else None,
        "assigned_to": o.assigned_to,
        "assigned_name": o.assigned_user.name if o.assigned_user else None,
        "notes": o.notes,
        "required_docs": o.required_docs,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }

def _recalc_case_progress(db: Session, case_id: int):
    """Recalculate case progress based on formation obligations."""
    obls = db.query(FormationObligation).filter_by(case_id=case_id).all()
    if not obls:
        return
    total = len(obls)
    done = sum(1 for o in obls if o.status == "completed")
    pct = int(done / total * 100)
    case = db.query(CompanyFormationCase).get(case_id)
    if case:
        # Update case progress metadata via notes if needed
        # The progress is computed dynamically in the stats endpoint
        pass


# ── List ──────────────────────────────────────────────

@router.get("")
def list_obligations(
    case_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(FormationObligation)
    if case_id:  q = q.filter(FormationObligation.case_id == case_id)
    if status:   q = q.filter(FormationObligation.status == status)
    items = q.order_by(FormationObligation.case_id, FormationObligation.order_index).all()
    return [_obl_dict(o) for o in items]


# ── Stats ─────────────────────────────────────────────

@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    all_obls = db.query(FormationObligation).all()
    now = datetime.utcnow()

    # Auto-mark overdue
    for o in all_obls:
        if o.status in ("not_started", "in_progress") and o.due_date and o.due_date < now:
            o.status = "late"
    db.commit()

    total_open = sum(1 for o in all_obls if o.status in ("not_started", "in_progress", "late"))
    completed  = sum(1 for o in all_obls if o.status == "completed")
    late       = sum(1 for o in all_obls if o.status == "late")

    # Avg completion days
    completed_obls = [o for o in all_obls if o.status == "completed" and o.completed_at and o.created_at]
    avg_days = 0
    if completed_obls:
        deltas = [(o.completed_at - o.created_at).days for o in completed_obls]
        avg_days = round(sum(deltas) / len(deltas), 1)

    # Per-case progress
    case_ids = list({o.case_id for o in all_obls})
    cases_with_progress = []
    for cid in case_ids:
        case = db.query(CompanyFormationCase).get(cid)
        if not case:
            continue
        case_obls = [o for o in all_obls if o.case_id == cid]
        total_steps = len(case_obls)
        completed_steps = sum(1 for o in case_obls if o.status == "completed")
        pct = int(completed_steps / total_steps * 100) if total_steps else 0
        remaining = [o.name for o in case_obls if o.status != "completed"]
        cases_with_progress.append({
            "case_id": cid,
            "company_name": case.company_name,
            "total_steps": total_steps,
            "completed_steps": completed_steps,
            "progress_pct": pct,
            "remaining": remaining,
        })

    cases_with_progress.sort(key=lambda x: x["progress_pct"])

    return {
        "total_open": total_open,
        "completed": completed,
        "late": late,
        "avg_completion_days": avg_days,
        "cases_with_progress": cases_with_progress,
    }


# ── Create ────────────────────────────────────────────

@router.post("")
def create_obligation(
    body: OblCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(CompanyFormationCase).get(body.case_id)
    if not case:
        raise HTTPException(404, "ملف التأسيس غير موجود")
    obl = FormationObligation(**body.dict())
    db.add(obl)
    db.commit()
    db.refresh(obl)
    return _obl_dict(obl)


# ── Auto-generate from template ───────────────────────

@router.post("/generate/{case_id}")
def generate_from_template(
    case_id: int,
    template_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(CompanyFormationCase).get(case_id)
    if not case:
        raise HTTPException(404, "ملف التأسيس غير موجود")

    # Check if obligations already exist (idempotent)
    existing = db.query(FormationObligation).filter_by(case_id=case_id).count()
    if existing > 0:
        return {"message": "الالتزامات موجودة مسبقاً", "generated": 0, "existing": existing}

    # Resolve template
    tpl = None
    if template_id:
        tpl = db.query(ServiceTemplate).get(template_id)
    if not tpl:
        # Auto-pick by company type
        type_map = {
            "llc":    "تأسيس شركة ذ.م.م",
            "ngo":    "جمعية أهلية",
            "branch": "فرع شركة أجنبية",
        }
        name = type_map.get(case.company_type)
        if name:
            tpl = db.query(ServiceTemplate).filter_by(name=name).first()

    if not tpl:
        return {"message": "لم يتم العثور على قالب مناسب", "generated": 0}

    # Generate obligations from steps
    now = datetime.utcnow()
    cumulative_days = 0
    generated = 0
    for step in tpl.steps:
        cumulative_days += step.default_days
        obl = FormationObligation(
            case_id=case_id,
            template_id=tpl.id,
            step_id=step.id,
            name=step.name,
            description=step.description,
            status="not_started",
            order_index=step.order_index,
            due_date=now + timedelta(days=cumulative_days),
            required_docs=step.required_docs,
        )
        db.add(obl)
        generated += 1

    # Log event on case
    ev = FormationEvent(
        case_id=case_id,
        event_type="note_added",
        title=f"تم توليد {generated} التزام من قالب: {tpl.name}",
        created_by=current_user.id,
        created_by_name=current_user.name,
        created_at=datetime.utcnow(),
    )
    db.add(ev)
    db.commit()

    return {"message": "تم التوليد بنجاح", "generated": generated, "template": tpl.name}


# ── Get one ───────────────────────────────────────────

@router.get("/{obl_id}")
def get_obligation(
    obl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    o = db.query(FormationObligation).get(obl_id)
    if not o:
        raise HTTPException(404, "الالتزام غير موجود")
    return _obl_dict(o)


# ── Update ────────────────────────────────────────────

@router.put("/{obl_id}")
def update_obligation(
    obl_id: int,
    body: OblUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    o = db.query(FormationObligation).get(obl_id)
    if not o:
        raise HTTPException(404, "الالتزام غير موجود")

    old_status = o.status
    for field, val in body.dict(exclude_none=True).items():
        setattr(o, field, val)
    o.updated_at = datetime.utcnow()

    # Auto-set completed_at
    if o.status == "completed" and old_status != "completed":
        o.completed_at = datetime.utcnow()
        # Add formation event
        ev = FormationEvent(
            case_id=o.case_id,
            event_type="note_added",
            title=f"تم إكمال: {o.name}",
            created_by=current_user.id,
            created_by_name=current_user.name,
            created_at=datetime.utcnow(),
        )
        db.add(ev)
    elif o.status != "completed":
        o.completed_at = None

    db.commit()
    db.refresh(o)
    _recalc_case_progress(db, o.case_id)
    return _obl_dict(o)


# ── Delete ────────────────────────────────────────────

@router.delete("/{obl_id}")
def delete_obligation(
    obl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    o = db.query(FormationObligation).get(obl_id)
    if not o:
        raise HTTPException(404, "الالتزام غير موجود")
    db.delete(o)
    db.commit()
    return {"ok": True}
