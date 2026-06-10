"""
WhatsApp Service — Green API integration (مجاني)
greenapi.com — ربط واتساب بـ QR Code، إرسال للأرقام الشخصية مباشرة
"""
import os
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)


def _get_config() -> dict:
    return {
        "instance_id": os.getenv("GREENAPI_INSTANCE_ID", ""),
        "token":       os.getenv("GREENAPI_TOKEN", ""),
        "enabled":     bool(os.getenv("GREENAPI_INSTANCE_ID") and os.getenv("GREENAPI_TOKEN")),
    }


def is_enabled() -> bool:
    return _get_config()["enabled"]


def _normalize_phone(phone: str) -> Optional[str]:
    """01055024074 → 201055024074@c.us"""
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("0"):
        digits = "20" + digits[1:]
    elif not digits.startswith("20"):
        digits = "20" + digits
    if len(digits) < 11:
        return None
    return f"{digits}@c.us"


def send_whatsapp(phone: str, message: str) -> bool:
    """Send WhatsApp message via Green API. Returns True on success."""
    cfg = _get_config()
    if not cfg["enabled"]:
        logger.warning("[WA] WhatsApp not configured")
        return False

    chat_id = _normalize_phone(phone)
    if not chat_id:
        logger.warning(f"[WA] Invalid phone: {phone}")
        return False

    url = (
        f"https://api.green-api.com"
        f"/waInstance{cfg['instance_id']}"
        f"/sendMessage/{cfg['token']}"
    )
    try:
        r = httpx.post(url, json={"chatId": chat_id, "message": message}, timeout=10)
        r.raise_for_status()
        logger.info(f"[WA] ✅ Sent to {chat_id}")
        return True
    except Exception as e:
        logger.warning(f"[WA] ❌ Failed: {e}")
        return False


PRIORITY_AR = {"urgent": "🔴 عاجل", "high": "🟠 عالي", "medium": "🟡 متوسط", "low": "🟢 منخفض"}
STATUS_AR = {
    "todo":         "⏳ جديدة",
    "in_progress":  "🔄 جاري العمل",
    "waiting_docs": "📄 بانتظار مستندات",
    "done":         "✅ مكتملة",
    "cancelled":    "❌ ملغاة",
}


def _task_base(task) -> str:
    lines = [f"📌 *{task.title}*"]
    if hasattr(task, "client") and task.client:
        lines.append(f"👤 العميل: {task.client.name}")
    if task.priority:
        pr = task.priority.value if hasattr(task.priority, "value") else str(task.priority)
        lines.append(f"الأولوية: {PRIORITY_AR.get(pr, pr)}")
    if task.due_date:
        lines.append(f"📅 الاستحقاق: {task.due_date.strftime('%Y/%m/%d')}")
    if task.department:
        lines.append(f"🏢 القسم: {task.department}")
    if task.description:
        lines.append(f"📝 {task.description[:200]}")
    return "\n".join(lines)


def notify_task_created(task, phone: str, assigned_by: str) -> bool:
    msg = (
        f"🔔 *مهمة جديدة*\n"
        f"{_task_base(task)}\n"
        f"👷 أُسندت إليك بواسطة: {assigned_by}\n"
        f"─────────────────\n"
        f"MS Accounting"
    )
    return send_whatsapp(phone, msg)


def notify_task_status_changed(task, changed_by: str, old_status: str, phone: str) -> bool:
    new_s = task.status.value if hasattr(task.status, "value") else str(task.status)
    msg = (
        f"🔄 *تحديث مهمة*\n"
        f"{_task_base(task)}\n"
        f"الحالة: {STATUS_AR.get(old_status, old_status)} ← {STATUS_AR.get(new_s, new_s)}\n"
        f"👤 بواسطة: {changed_by}\n"
        f"─────────────────\n"
        f"MS Accounting"
    )
    return send_whatsapp(phone, msg)


def notify_task_done(task, closed_by: str, phone: str) -> bool:
    msg = (
        f"✅ *مهمة مكتملة*\n"
        f"{_task_base(task)}\n"
        f"🎉 تم إنجازها بواسطة: {closed_by}\n"
        f"─────────────────\n"
        f"MS Accounting"
    )
    return send_whatsapp(phone, msg)
