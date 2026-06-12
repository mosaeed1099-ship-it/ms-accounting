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


def send_and_log(db, phone: str, message: str, recipient: str = "",
                 task_id: int = None, sent_by: str = "") -> dict:
    """Send WA message and persist result to wa_logs table."""
    from app.models.wa_log import WALog
    success = False
    error = None
    try:
        success = send_whatsapp(phone, message)
        if not success:
            error = "الإرسال فشل — تحقق من instanceId وتأكد أن الرقم مسجّل"
    except Exception as e:
        error = str(e)
    log = WALog(
        phone=phone, recipient=recipient, message=message,
        success=success, error=error, task_id=task_id, sent_by=sent_by,
    )
    db.add(log)
    db.commit()
    return {"success": success, "error": error, "log_id": log.id}


def get_status(db) -> dict:
    """Return WA connection status and stats."""
    from app.models.wa_log import WALog
    from sqlalchemy import func as sqlfunc
    from datetime import datetime, timedelta
    cfg = _get_config()
    today = datetime.utcnow().date()
    sent_today = db.query(sqlfunc.count(WALog.id)).filter(
        sqlfunc.date(WALog.created_at) == today, WALog.success == True
    ).scalar() or 0
    failed_today = db.query(sqlfunc.count(WALog.id)).filter(
        sqlfunc.date(WALog.created_at) == today, WALog.success == False
    ).scalar() or 0
    last_sent = db.query(WALog).filter(WALog.success == True).order_by(WALog.created_at.desc()).first()
    recent = db.query(WALog).order_by(WALog.created_at.desc()).limit(20).all()
    failed = db.query(WALog).filter(WALog.success == False).order_by(WALog.created_at.desc()).limit(10).all()
    return {
        "configured": cfg["enabled"],
        "instance_id": cfg["instance_id"],
        "sent_today": sent_today,
        "failed_today": failed_today,
        "last_sent_at": last_sent.created_at.isoformat() if last_sent else None,
        "last_sent_to": last_sent.recipient if last_sent else None,
        "recent": [_log_dict(l) for l in recent],
        "failed": [_log_dict(l) for l in failed],
    }


def _log_dict(l) -> dict:
    return {
        "id": l.id,
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "phone": l.phone,
        "recipient": l.recipient,
        "message": l.message[:120] + ("…" if len(l.message) > 120 else ""),
        "success": l.success,
        "error": l.error,
        "task_id": l.task_id,
        "sent_by": l.sent_by,
    }
