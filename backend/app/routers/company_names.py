"""
Company Name Generator & Approval Predictor
مولّد أسماء الشركات ومتنبئ القبول في مصر الرقمية
"""
import json
import re
import random
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.company_names import RejectedCompanyName
from app.config import settings

router = APIRouter(prefix="/api/company-names", tags=["Company Names"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    name_part1:    str
    name_part2:    Optional[str] = ""
    activity:      str
    company_type:  str                      # "single" | "llc"
    keywords:      Optional[List[str]] = []
    count:         int = 25

class RejectRequest(BaseModel):
    name:             str
    activity:         Optional[str] = None
    rejection_reason: Optional[str] = None
    notes:            Optional[str] = None


# ── Rule-based generator (free, no API needed) ────────────────────────────────

def _rule_based_names(name_part1: str, name_part2: str, activity: str,
                      company_type: str, keywords: List[str], count: int,
                      rejected_lower: set) -> list:
    p1 = name_part1.strip()
    p2 = name_part2.strip() if name_part2 else ""
    base = (p1 + " " + p2).strip() if p2 else p1
    act  = activity.strip()

    # Suffixes for LLC (general, no activity needed)
    llc_suffixes_en = [
        "Group", "Partners", "Global", "Plus", "Pro",
        "Hub", "Connect", "Solutions", "Ventures", "Capital",
        "Prime", "Elite", "Corp", "Vision", "Edge",
    ]
    llc_suffixes_ar = [
        "للتجارة", "العربية", "للأعمال",
        "للمشاريع", "للتطوير", "للاستثمار", "للخدمات",
        "الشاملة", "للابتكار", "للتميز", "للحلول",
    ]

    # Suffixes for single-person (must include activity)
    single_templates_ar = [
        "لـ{act}", "للـ{act}", "لخدمات {act}", "لمجال {act}",
        "لأعمال {act}", "لتجارة {act}", "لتوريد {act}",
    ]
    single_templates_en = [
        "Trading", "Services", "Enterprise", "Business",
    ]

    candidates = []

    if company_type == "single":
        # Arabic names with activity
        for tmpl in single_templates_ar:
            suffix = tmpl.format(act=act)
            candidates.append((f"{base} {suffix}", 82, "High",
                                f"يتضمن النشاط '{act}' بوضوح — مناسب لشركة شخص واحد"))
        if p2:
            for tmpl in single_templates_ar[:4]:
                suffix = tmpl.format(act=act)
                candidates.append((f"{p1} {suffix}", 78, "High",
                                    f"باستخدام المقطع الأول مع النشاط"))
        # English/mixed
        for suf in single_templates_en:
            candidates.append((f"{base} {suf} for {act}", 70, "Medium",
                                "اسم مختلط — يوضح النشاط بالإنجليزية"))
        for kw in keywords[:3]:
            candidates.append((f"{base} {kw} لـ{act}", 75, "High",
                                f"يجمع الكلمة المفتاحية '{kw}' مع النشاط"))
        # Extra variations
        candidates += [
            (f"{p1} & {p2} لـ{act}".strip(), 72, "Medium", "صيغة مختلطة مع النشاط"),
            (f"{base} — {act}", 60, "Medium", "صيغة توضيحية — قد تُقبل"),
            (f"مجموعة {base} لـ{act}", 65, "Medium", "بادئة 'مجموعة' — شائعة"),
            (f"{base} {act} Egypt", 68, "Medium", "إضافة Egypt تعزز التميز"),
            (f"{p1} للـ{act} والتجارة", 76, "High", "يشمل النشاط والتجارة"),
        ]
    else:
        # LLC — general names allowed
        for suf in llc_suffixes_en:
            candidates.append((f"{base} {suf}", 80, "High",
                                f"اسم تجاري قوي ومميز — مناسب لشركة ذات مسئولية محدودة"))
        for suf in llc_suffixes_ar:
            candidates.append((f"{base} {suf}", 78, "High",
                                "اسم عربي واضح ومميز"))
        if p2:
            for suf in llc_suffixes_en[:6]:
                candidates.append((f"{p1} {suf}", 75, "High",
                                    "باستخدام المقطع الأول فقط — أبسط وأقوى"))
        for kw in keywords[:3]:
            candidates.append((f"{base} {kw}", 77, "High",
                                f"يتضمن الكلمة المفتاحية '{kw}'"))
        # Activity-inspired for LLC
        candidates += [
            (f"{base} للـ{act}", 74, "High", "يضيف النشاط — يزيد الوضوح"),
            (f"{base} {act} Group", 72, "Medium", "مختلط عربي-إنجليزي"),
            (f"مجموعة {base}", 70, "Medium", "بادئة 'مجموعة' — شائعة وقوية"),
            (f"{base} Egypt", 73, "High", "إضافة Egypt تعزز التميز المحلي"),
            (f"{base} ME", 65, "Medium", "ME اختصار Middle East"),
            (f"{p1} & Partners", 71, "Medium", "صيغة Partners — احترافية"),
        ]

    # كلمات محظورة نهائياً من كل الاقتراحات
    BANNED_WORDS = {"العالمية", "المتحدة", "هولدنج", "holding", "المتكاملة"}

    # Score adjustment and dedup (remove names with repeated words)
    seen = set()
    results = []
    for name, score, level, reason in candidates:
        words = name.lower().split()
        if len(words) != len(set(words)):  # skip if any word repeats
            continue
        name = name.strip()
        if not name or name.lower() in seen:
            continue
        # skip if contains any banned word
        name_words_lower = set(name.lower().split())
        if name_words_lower & BANNED_WORDS:
            continue
        seen.add(name.lower())
        is_rejected = name.lower() in rejected_lower
        if is_rejected:
            score, level, reason = 0, "Low", "مرفوض مسبقاً في مصر الرقمية"
        results.append({
            "name": name,
            "score": score,
            "level": level,
            "reason": reason,
            "is_rejected": is_rejected,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:count]


# ── AI generator (paid, requires ANTHROPIC_API_KEY with credits) ──────────────

def _ai_names(payload: GenerateRequest, rejected_lower: set, rejected_list: list) -> list:
    keywords_str = "، ".join(payload.keywords) if payload.keywords else "لا يوجد"
    base_name    = (payload.name_part1.strip() + (" " + payload.name_part2.strip() if payload.name_part2 and payload.name_part2.strip() else "")).strip()
    is_single    = payload.company_type == "single"

    if is_single:
        company_type_ar = "شركة شخص واحد"
        logic_rule = """قواعد خاصة بشركة شخص واحد:
- يجب أن يحتوي كل اسم مقترح على النشاط التجاري أو ما يدل عليه بوضوح داخل الاسم
- لا تقترح أسماء عامة لا تذكر النشاط
- أمثلة صحيحة: "KAO Group للاستيراد"، "KAO للتوريدات والتجارة"، "KAO Trading"
- أمثلة خاطئة: "KAO Group"، "KAO Plus"، "KAO Partners" (بدون ذكر النشاط)"""
    else:
        company_type_ar = "شركة ذات مسئولية محدودة"
        logic_rule = """قواعد خاصة بشركة ذات مسئولية محدودة:
- يُسمح بأسماء عامة وتجارية بدون ذكر النشاط
- يُفضل الأسماء المميزة والقوية تجارياً
- أمثلة صحيحة: "KAO Group"، "KAO Holding"، "KAO Partners"، "KAO Global"
- نوّع بين العربي والإنجليزي والمختلط"""

    prompt = """أنت خبير في تأسيس الشركات في مصر ومتخصص في اختيار أسماء تجارية تنجح في التسجيل بالسجل التجاري المصري (منظومة مصر الرقمية).

بيانات الشركة:
- المقطع الأول: """ + payload.name_part1.strip() + """
- المقطع الثاني: """ + (payload.name_part2.strip() if payload.name_part2 else "—") + """
- الاسم الكامل: """ + base_name + """
- النشاط التجاري: """ + payload.activity + """
- نوع الشركة: """ + company_type_ar + """
- كلمات مفتاحية: """ + keywords_str + """

""" + logic_rule + """

قواعد عامة:
0. ممنوع منعاً باتاً استخدام الكلمات التالية في أي اسم: العالمية، المتحدة، هولدنج، Holding، المتكاملة (كلمات مستهلكة ومرفوضة)
1. لا تبدأ بـ "شركة" أو "مؤسسة"
2. بين 2 و 5 كلمات، لا أرقام ولا رموز

توزيع الأسماء: نصفها عربي، النصف الآخر إنجليزي أو مختلط.

أسماء مرفوضة مسبقاً (تجنّبها):
""" + (json.dumps(rejected_list, ensure_ascii=False) if rejected_list else "لا يوجد") + """

اقترح """ + str(payload.count) + """ اسماً مع الحفاظ على المقطع الأول """ + '"' + payload.name_part1.strip() + '"' + """ كجزء أساسي.

أعطني JSON array فقط:
[{"name": "...", "score": 85, "level": "High", "reason": "..."}, ...]

score: 0-100، level: High/Medium/Low، reason: بالعربية."""

    import anthropic
    client  = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )
    raw   = message.content[0].text.strip()
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if not match:
        raise ValueError("No JSON array in response")
    names_data = json.loads(match.group())

    results = []
    for item in names_data:
        name = item.get("name", "").strip()
        if not name:
            continue
        is_rejected = name.lower() in rejected_lower
        results.append({
            "name":        name,
            "score":       0 if is_rejected else min(100, max(0, item.get("score", 70))),
            "level":       "Low" if is_rejected else item.get("level", "Medium"),
            "reason":      "مرفوض مسبقاً في مصر الرقمية" if is_rejected else item.get("reason", ""),
            "is_rejected": is_rejected,
        })
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_names(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rejected       = db.query(RejectedCompanyName).all()
    rejected_lower = {r.name_lower for r in rejected}
    rejected_list  = [r.name for r in rejected[:50]]

    # Try AI first if key available, fall back to rule-based
    use_ai = bool(settings.ANTHROPIC_API_KEY)
    source = "ai"

    if use_ai:
        try:
            results = _ai_names(payload, rejected_lower, rejected_list)
        except Exception:
            results = _rule_based_names(
                payload.name_part1, payload.name_part2 or "", payload.activity,
                payload.company_type, payload.keywords or [], payload.count, rejected_lower
            )
            source = "rules"
    else:
        results = _rule_based_names(
            payload.name_part1, payload.name_part2 or "", payload.activity,
            payload.company_type, payload.keywords or [], payload.count, rejected_lower
        )
        source = "rules"

    return {
        "names":          results,
        "total":          len(results),
        "rejected_count": len(rejected),
        "company_type":   payload.company_type,
        "source":         source,
    }


@router.post("/reject")
def reject_name(
    payload: RejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name_lower = payload.name.strip().lower()
    existing = db.query(RejectedCompanyName).filter(
        RejectedCompanyName.name_lower == name_lower
    ).first()
    if existing:
        return {"message": "الاسم مسجّل مسبقاً كمرفوض", "id": existing.id}
    r = RejectedCompanyName(
        name             = payload.name.strip(),
        name_lower       = name_lower,
        activity         = payload.activity,
        rejection_reason = payload.rejection_reason,
        notes            = payload.notes,
        created_by       = current_user.id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"message": "✅ تم تسجيل الاسم المرفوض", "id": r.id}


@router.get("/rejected")
def list_rejected(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = db.query(RejectedCompanyName).order_by(RejectedCompanyName.created_at.desc()).all()
    return [{"id": r.id, "name": r.name, "activity": r.activity,
             "rejection_reason": r.rejection_reason, "rejected_date": str(r.rejected_date)} for r in items]


@router.delete("/rejected/{rejected_id}")
def delete_rejected(
    rejected_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(RejectedCompanyName).filter(RejectedCompanyName.id == rejected_id).first()
    if not r:
        raise HTTPException(404, "السجل غير موجود")
    db.delete(r)
    db.commit()
    return {"message": "✅ تم الحذف"}
