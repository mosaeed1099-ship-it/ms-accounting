"""
Service Templates — Full CRUD + seeding
قوالب الخدمات مع بذر القوالب الافتراضية
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from app.core.deps import get_db, get_current_user
from app.models.service_template import ServiceTemplate, ServiceTemplateStep
from app.models.user import User

router = APIRouter(tags=["service_templates"])


# ── Default templates data ─────────────────────────────

DEFAULT_TEMPLATES = [
    {
        "name": "تأسيس شركة ذ.م.م",
        "service_type": "company_formation",
        "description": "خطوات تأسيس شركة ذات مسؤولية محدودة",
        "is_default": True,
        "steps": [
            {"name": "حجز الاسم التجاري",       "order_index": 1,  "default_days": 7},
            {"name": "قبول الاسم التجاري",       "order_index": 2,  "default_days": 3},
            {"name": "استلام المستندات",          "order_index": 3,  "default_days": 5},
            {"name": "إعداد عقد التأسيس",        "order_index": 4,  "default_days": 7},
            {"name": "توقيع المستندات",           "order_index": 5,  "default_days": 3},
            {"name": "تقديم الملف",              "order_index": 6,  "default_days": 2},
            {"name": "مراجعة الجهات المختصة",   "order_index": 7,  "default_days": 14},
            {"name": "إصدار السجل التجاري",     "order_index": 8,  "default_days": 7},
            {"name": "إصدار البطاقة الضريبية",  "order_index": 9,  "default_days": 5},
            {"name": "التسجيل في التأمينات",     "order_index": 10, "default_days": 5},
            {"name": "الغرفة التجارية",          "order_index": 11, "default_days": 3},
            {"name": "فتح حساب بنكي",           "order_index": 12, "default_days": 7},
        ],
    },
    {
        "name": "جمعية أهلية",
        "service_type": "ngo",
        "description": "خطوات تأسيس جمعية أهلية",
        "is_default": True,
        "steps": [
            {"name": "موافقة الجهة المختصة",     "order_index": 1, "default_days": 30},
            {"name": "إعداد النظام الأساسي",     "order_index": 2, "default_days": 14},
            {"name": "توقيع المستندات",           "order_index": 3, "default_days": 5},
            {"name": "تقديم الملف للوزارة",      "order_index": 4, "default_days": 7},
            {"name": "القيد النهائي",             "order_index": 5, "default_days": 21},
            {"name": "فتح الملف الضريبي",        "order_index": 6, "default_days": 7},
            {"name": "التسجيل في التأمينات",     "order_index": 7, "default_days": 5},
        ],
    },
    {
        "name": "تسجيل تأمينات",
        "service_type": "insurance",
        "description": "خطوات تسجيل التأمينات الاجتماعية",
        "is_default": True,
        "steps": [
            {"name": "فتح ملف التأمينات",        "order_index": 1, "default_days": 5},
            {"name": "تسجيل الموظفين",           "order_index": 2, "default_days": 3},
            {"name": "استلام الرقم التأميني",    "order_index": 3, "default_days": 7},
            {"name": "ربط المنظومة",             "order_index": 4, "default_days": 5},
        ],
    },
    {
        "name": "تجديد سجل تجاري",
        "service_type": "custom",
        "description": "خطوات تجديد السجل التجاري",
        "is_default": True,
        "steps": [
            {"name": "مراجعة ملف العميل",        "order_index": 1, "default_days": 1},
            {"name": "سداد الرسوم",              "order_index": 2, "default_days": 2},
            {"name": "تقديم طلب التجديد",        "order_index": 3, "default_days": 1},
            {"name": "استلام السجل المجدد",      "order_index": 4, "default_days": 7},
        ],
    },
    {
        "name": "فرع شركة أجنبية",
        "service_type": "company_formation",
        "description": "خطوات تأسيس فرع شركة أجنبية",
        "is_default": True,
        "steps": [
            {"name": "موافقة GAFI",             "order_index": 1, "default_days": 30},
            {"name": "حجز الاسم",              "order_index": 2, "default_days": 7},
            {"name": "إعداد عقد الإنشاء",       "order_index": 3, "default_days": 14},
            {"name": "توقيع المستندات",          "order_index": 4, "default_days": 5},
            {"name": "تقديم الملف",             "order_index": 5, "default_days": 3},
            {"name": "إصدار السجل",            "order_index": 6, "default_days": 10},
            {"name": "البطاقة الضريبية",        "order_index": 7, "default_days": 5},
            {"name": "التأمينات",               "order_index": 8, "default_days": 5},
        ],
    },
]


def seed_default_templates(db: Session):
    """Seed default templates if table is empty (idempotent)."""
    existing = db.query(ServiceTemplate).count()
    if existing > 0:
        return
    for tpl_data in DEFAULT_TEMPLATES:
        steps_data = tpl_data.pop("steps")
        tpl = ServiceTemplate(**tpl_data)
        db.add(tpl)
        db.flush()
        for s in steps_data:
            db.add(ServiceTemplateStep(template_id=tpl.id, **s))
        tpl_data["steps"] = steps_data  # restore for next call
    db.commit()


# ── Schemas ────────────────────────────────────────────

class StepIn(BaseModel):
    name: str
    description: Optional[str] = None
    order_index: int = 0
    required_docs: Optional[str] = None
    default_days: int = 7

class TemplateCreate(BaseModel):
    name: str
    service_type: str
    description: Optional[str] = None
    is_default: bool = False
    steps: Optional[List[StepIn]] = []

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None


def _step_dict(s: ServiceTemplateStep) -> dict:
    return {
        "id": s.id,
        "template_id": s.template_id,
        "name": s.name,
        "description": s.description,
        "order_index": s.order_index,
        "required_docs": s.required_docs,
        "default_days": s.default_days,
    }

def _template_dict(t: ServiceTemplate, include_steps=True) -> dict:
    d = {
        "id": t.id,
        "name": t.name,
        "service_type": t.service_type,
        "description": t.description,
        "is_default": t.is_default,
        "created_by": t.created_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "step_count": len(t.steps),
    }
    if include_steps:
        d["steps"] = [_step_dict(s) for s in t.steps]
    return d


# ── Endpoints ──────────────────────────────────────────

@router.get("")
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seed_default_templates(db)
    items = db.query(ServiceTemplate).order_by(ServiceTemplate.id).all()
    return [_template_dict(t) for t in items]


@router.get("/{template_id}")
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(ServiceTemplate).get(template_id)
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    return _template_dict(t)


@router.get("/{template_id}/steps")
def get_template_steps(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(ServiceTemplate).get(template_id)
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    return [_step_dict(s) for s in t.steps]


@router.post("")
def create_template(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tpl = ServiceTemplate(
        name=body.name,
        service_type=body.service_type,
        description=body.description,
        is_default=body.is_default,
        created_by=current_user.id,
    )
    db.add(tpl)
    db.flush()
    for s in (body.steps or []):
        db.add(ServiceTemplateStep(
            template_id=tpl.id,
            name=s.name,
            description=s.description,
            order_index=s.order_index,
            required_docs=s.required_docs,
            default_days=s.default_days,
        ))
    db.commit()
    db.refresh(tpl)
    return _template_dict(tpl)


@router.put("/{template_id}")
def update_template(
    template_id: int,
    body: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(ServiceTemplate).get(template_id)
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    for field, val in body.dict(exclude_none=True).items():
        setattr(t, field, val)
    db.commit()
    db.refresh(t)
    return _template_dict(t)


@router.delete("/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(ServiceTemplate).get(template_id)
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    db.delete(t)
    db.commit()
    return {"ok": True}


# ── Step CRUD ──────────────────────────────────────────

@router.post("/{template_id}/steps")
def add_step(
    template_id: int,
    body: StepIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(ServiceTemplate).get(template_id)
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    step = ServiceTemplateStep(
        template_id=template_id,
        name=body.name,
        description=body.description,
        order_index=body.order_index,
        required_docs=body.required_docs,
        default_days=body.default_days,
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return _step_dict(step)


@router.put("/{template_id}/steps/{step_id}")
def update_step(
    template_id: int,
    step_id: int,
    body: StepIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    step = db.query(ServiceTemplateStep).filter_by(id=step_id, template_id=template_id).first()
    if not step:
        raise HTTPException(404, "الخطوة غير موجودة")
    for field, val in body.dict(exclude_none=True).items():
        setattr(step, field, val)
    db.commit()
    db.refresh(step)
    return _step_dict(step)


@router.delete("/{template_id}/steps/{step_id}")
def delete_step(
    template_id: int,
    step_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    step = db.query(ServiceTemplateStep).filter_by(id=step_id, template_id=template_id).first()
    if not step:
        raise HTTPException(404, "الخطوة غير موجودة")
    db.delete(step)
    db.commit()
    return {"ok": True}
