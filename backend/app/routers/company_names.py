"""
Company Name Generator & Approval Predictor
مولّد أسماء الشركات ومتنبئ القبول في مصر الرقمية
"""
import json
import re
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
    client_name:  str
    activity:     str
    keywords:     Optional[List[str]] = []
    count:        int = 25

class RejectRequest(BaseModel):
    name:             str
    activity:         Optional[str] = None
    rejection_reason: Optional[str] = None
    notes:            Optional[str] = None

class NameResult(BaseModel):
    name:        str
    score:       int
    level:       str   # High / Medium / Low
    reason:      str
    is_rejected: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

ACTIVITY_WORDS = {
    "تجارة":      ["للتجارة", "التجارية", "للاستيراد والتصدير", "التجارية العامة"],
    "توريدات":    ["للتوريدات", "للتوريد", "توريدات عامة", "للمشتريات والتوريدات"],
    "مقاولات":    ["للمقاولات", "للإنشاءات", "للمقاولات العامة", "للبناء والتشييد"],
    "خدمات":      ["للخدمات", "للخدمات المتكاملة", "للخدمات العامة", "للخدمات والحلول"],
    "محاسبة":     ["للمحاسبة والمراجعة", "للاستشارات المالية", "المالية والمحاسبية"],
    "استشارات":   ["للاستشارات", "للاستشارات والتطوير", "استشارات متكاملة"],
    "صناعة":      ["للصناعة", "الصناعية", "للصناعات", "للإنتاج والصناعة"],
    "تقنية":      ["للتقنية", "لتقنية المعلومات", "للحلول التقنية", "الرقمية"],
    "عقارات":     ["للعقارات", "للتطوير العقاري", "العقارية"],
    "سياحة":      ["للسياحة والسفر", "السياحية", "للسياحة"],
}

PROFESSIONAL_SUFFIXES = [
    "جروب", "هولدنج", "كونسلتنج", "سيستمز", "سوليوشنز",
    "إنترناشيونال", "ناشيونال", "إيجيبت", "مصر",
]

def _get_activity_words(activity: str) -> list:
    for key, words in ACTIVITY_WORDS.items():
        if key in activity:
            return words
    return ["للخدمات العامة", "التجارية", "للاستثمار"]

def _score_name(name: str, rejected_lower: set) -> dict:
    """Local scoring before sending to AI — fast pre-filter."""
    n = name.strip()
    score = 70
    reasons = []

    if n.lower() in rejected_lower:
        return {"score": 0, "level": "Low", "reason": "مرفوض مسبقاً في مصر الرقمية", "is_rejected": True}

    # Length check (8-40 chars ideal)
    if len(n) < 8:
        score -= 15; reasons.append("قصير جداً")
    elif len(n) > 50:
        score -= 10; reasons.append("طويل نسبياً")

    # Has generic/common words penalty
    generic = ["شركة", "مؤسسة", "مصر", "العربية", "الدولية"]
    common_count = sum(1 for g in generic if g in n)
    if common_count >= 2:
        score -= 10; reasons.append("يحتوي كلمات شائعة")

    # Unique/distinctive bonus
    if any(c.isdigit() for c in n):
        score -= 5; reasons.append("يحتوي أرقام")

    if score >= 80:
        level = "High"
        if not reasons: reasons = ["اسم مميز ومناسب للنشاط"]
    elif score >= 60:
        level = "Medium"
        if not reasons: reasons = ["اسم مقبول بشكل عام"]
    else:
        level = "Low"

    return {"score": min(100, max(0, score)), "level": level,
            "reason": " — ".join(reasons) if reasons else "مناسب", "is_rejected": False}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_names(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """توليد أسماء شركات مقترحة مع تقييم احتمال القبول."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(503, "خدمة توليد الأسماء غير مفعّلة — يرجى إضافة ANTHROPIC_API_KEY في إعدادات النظام")

    # Get rejected names for context
    rejected = db.query(RejectedCompanyName).all()
    rejected_lower = {r.name_lower for r in rejected}
    rejected_list  = [r.name for r in rejected[:50]]  # send top 50 to AI

    activity_words = _get_activity_words(payload.activity)
    keywords_str   = "، ".join(payload.keywords) if payload.keywords else "لا يوجد"

    prompt = f"""أنت خبير في تأسيس الشركات في مصر ومتخصص في اختيار أسماء تجارية تنجح في التسجيل بالسجل التجاري المصري (منظومة مصر الرقمية).

المطلوب: توليد {payload.count} اسم شركة للعميل التالي:
- الاسم الأساسي: {payload.client_name}
- النشاط: {payload.activity}
- كلمات مفضلة: {keywords_str}
- كلمات مناسبة للنشاط: {', '.join(activity_words)}

قواعد الأسماء المقبولة في مصر الرقمية:
1. لا تبدأ بـ "شركة" أو "مؤسسة" — يُكتب في شكل السجل التجاري فقط
2. الاسم يجب أن يكون مميزاً وغير مشابه لأسماء موجودة
3. يُفضل الأسماء العربية أو المختلطة (عربي + إنجليزي)
4. بين 2 و 5 كلمات
5. لا أرقام، لا رموز خاصة

أسماء مرفوضة مسبقاً (تجنّبها تماماً وما يشبهها):
{json.dumps(rejected_list, ensure_ascii=False) if rejected_list else "لا يوجد حتى الآن"}

أعطني الرد كـ JSON array فقط بدون أي نص خارجه:
[
  {{"name": "اسم الشركة", "score": 85, "level": "High", "reason": "سبب التقييم"}},
  ...
]

حيث:
- score: من 0 إلى 100 (احتمال القبول في مصر الرقمية)
- level: "High" (75+) أو "Medium" (50-74) أو "Low" (أقل من 50)
- reason: سبب واضح بالعربية (مثال: "اسم مميز ومرتبط بالنشاط — غير شائع")

نوّع بين: عربي بحت، إنجليزي بحت، مختلط. احرص على إبقاء اسم العميل "{payload.client_name}" كجزء أساسي في معظم الأسماء."""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()

        # Extract JSON from response
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if not match:
            raise ValueError("No JSON array in response")
        names_data = json.loads(match.group())

    except ImportError:
        raise HTTPException(503, "مكتبة anthropic غير مثبتة — يرجى إضافتها لـ requirements.txt")
    except Exception as e:
        raise HTTPException(500, f"خطأ في توليد الأسماء: {str(e)}")

    # Enrich with rejected check
    results = []
    for item in names_data:
        name = item.get("name", "").strip()
        if not name:
            continue
        is_rejected = name.lower() in rejected_lower
        results.append({
            "name":        name,
            "score":       0 if is_rejected else item.get("score", 70),
            "level":       "Low" if is_rejected else item.get("level", "Medium"),
            "reason":      "مرفوض مسبقاً في مصر الرقمية" if is_rejected else item.get("reason", ""),
            "is_rejected": is_rejected,
        })

    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"names": results, "total": len(results), "rejected_count": len(rejected)}


@router.post("/reject")
def reject_name(
    payload: RejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تسجيل اسم تم رفضه في مصر الرقمية."""
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
    """قائمة الأسماء المرفوضة."""
    items = db.query(RejectedCompanyName).order_by(RejectedCompanyName.created_at.desc()).all()
    return [{"id": r.id, "name": r.name, "activity": r.activity,
             "rejection_reason": r.rejection_reason, "rejected_date": str(r.rejected_date)} for r in items]


@router.delete("/rejected/{rejected_id}")
def delete_rejected(
    rejected_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """حذف اسم من قائمة المرفوضات."""
    r = db.query(RejectedCompanyName).filter(RejectedCompanyName.id == rejected_id).first()
    if not r:
        raise HTTPException(404, "السجل غير موجود")
    db.delete(r)
    db.commit()
    return {"message": "✅ تم الحذف"}
