"""
Notifications Router — email settings, test, and manual triggers
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from app.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.user import User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class EmailSettings(BaseModel):
    smtp_user: str       # Gmail address used as sender
    smtp_pass: str       # Gmail App Password (16 chars)
    smtp_host: Optional[str] = "smtp.gmail.com"
    smtp_port: Optional[int] = 587
    from_name: Optional[str] = "MS Accounting"


class TestEmailRequest(BaseModel):
    to_email: str


@router.post("/test-email")
async def test_email(
    req: TestEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a test email to verify SMTP configuration."""
    from app.services.email_service import send_test_email, get_config
    cfg = get_config()
    if not cfg.enabled:
        raise HTTPException(400, detail="البريد الإلكتروني غير مُعيَّن. أضف SMTP_USER و SMTP_PASS في ملف .env")
    try:
        send_test_email(req.to_email)
        return {"success": True, "message": f"تم إرسال رسالة اختبار إلى {req.to_email}"}
    except Exception as e:
        raise HTTPException(500, detail=f"فشل الإرسال: {str(e)}")


@router.post("/save-settings")
async def save_email_settings(
    settings: EmailSettings,
    current_user: User = Depends(require_admin),
):
    """Save SMTP settings to .env file and reload config."""
    import os
    env_path = os.path.join(os.path.dirname(__file__), '../../.env')
    env_path = os.path.abspath(env_path)

    # Read existing .env if any
    existing = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    existing[k.strip()] = v.strip()

    existing['SMTP_HOST'] = settings.smtp_host
    existing['SMTP_PORT'] = str(settings.smtp_port)
    existing['SMTP_USER'] = settings.smtp_user
    existing['SMTP_PASS'] = settings.smtp_pass
    existing['EMAIL_FROM_NAME'] = settings.from_name
    existing['EMAIL_FROM'] = settings.smtp_user

    with open(env_path, 'w') as f:
        for k, v in existing.items():
            f.write(f"{k}={v}\n")

    # Reload config + reconnect
    from app.services.email_service import reload_config
    reload_config()
    # Reload settings
    from app.config import Settings
    import app.config as cfg_mod
    cfg_mod.settings = Settings()

    # Quick test
    try:
        from app.services.email_service import send_test_email
        send_test_email(settings.smtp_user)
        return {"success": True, "message": "تم حفظ الإعدادات وإرسال رسالة تأكيد"}
    except Exception as e:
        return {"success": True, "message": f"تم حفظ الإعدادات. تحذير: {str(e)}"}


@router.get("/settings")
async def get_email_settings(
    current_user: User = Depends(get_current_user),
):
    """Return current email config (masked password)."""
    import os
    from app.services.email_service import get_config
    cfg = get_config()
    resend_key = os.environ.get('RESEND_API_KEY', '')
    return {
        "configured": cfg.enabled,
        "smtp_host": cfg.smtp_host,
        "smtp_port": cfg.smtp_port,
        "smtp_user": cfg.smtp_user,
        "from_name": cfg.from_name,
        "resend_configured": bool(resend_key),
        "method": "resend" if resend_key else ("smtp" if (cfg.smtp_user and cfg.smtp_pass) else "none"),
    }


# ── Client Reminder ─────────────────────────────────────────────────────────

class ComposeEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    client_id: Optional[int] = None         # optional — used to pull obligations/invoices
    include_obligations: bool = False
    include_invoices: bool = False


@router.post("/compose")
async def compose_email(
    req: ComposeEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a free-form composed email to any address."""
    from app.services.email_service import get_config, compose_email_template, send_email_sync
    from app.models.client import Client
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.obligation import TaxObligation, ObligationInstance
    from datetime import date as _date

    cfg = get_config()
    if not cfg.enabled:
        raise HTTPException(400, detail="البريد الإلكتروني غير مُفعَّل. أضف بيانات SMTP في الإعدادات.")

    client_name = None
    obligations = []
    invoices = []

    if req.client_id:
        client = db.query(Client).filter(Client.id == req.client_id).first()
        if client:
            client_name = client.name

        if req.include_obligations and req.client_id:
            today = _date.today()
            instances = (
                db.query(ObligationInstance)
                .join(TaxObligation)
                .filter(
                    TaxObligation.client_id == req.client_id,
                    ObligationInstance.status.in_(['pending', 'overdue', 'upcoming']),
                )
                .order_by(ObligationInstance.due_date)
                .limit(20)
                .all()
            )
            for inst in instances:
                days_left = (inst.due_date - today).days if inst.due_date else 0
                obligations.append({
                    'obligation_type': inst.obligation.obligation_type if inst.obligation else '',
                    'due_date': inst.due_date.strftime('%Y/%m/%d') if inst.due_date else '',
                    'days_left': days_left,
                })

        if req.include_invoices and req.client_id:
            unpaid = (
                db.query(Invoice)
                .filter(
                    Invoice.client_id == req.client_id,
                    Invoice.status.in_(['sent', 'partial', 'overdue']),
                )
                .order_by(Invoice.issue_date.desc())
                .limit(10)
                .all()
            )
            for inv in unpaid:
                invoices.append({
                    'invoice_number': inv.invoice_number,
                    'issue_date': inv.issue_date.strftime('%Y/%m/%d') if inv.issue_date else '',
                    'total': inv.total or 0,
                    'remaining': inv.remaining or 0,
                    'status': inv.status.value if hasattr(inv.status, 'value') else str(inv.status),
                })

    try:
        subject, html = compose_email_template(
            subject=req.subject,
            body=req.body,
            sender_name=current_user.name,
            client_name=client_name,
            obligations=obligations if obligations else None,
            invoices=invoices if invoices else None,
        )
        send_email_sync(req.to_email, subject, html)
        return {
            "success": True,
            "message": f"✅ تم إرسال الرسالة إلى {req.to_email}",
            "to_email": req.to_email,
        }
    except Exception as e:
        raise HTTPException(500, detail=f"فشل الإرسال: {str(e)}")


class ClientReminderRequest(BaseModel):
    client_id: int
    to_email: Optional[str] = None          # override if different from client.email
    include_obligations: bool = True
    include_invoices: bool = True
    custom_message: Optional[str] = None
    days_ahead: int = 60                     # show obligations due within X days


@router.post("/send-client-reminder")
async def send_client_reminder_email(
    req: ClientReminderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a reminder email to a client with their obligations and unpaid invoices."""
    from app.services.email_service import get_config, send_client_reminder
    from app.models.client import Client
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.obligation import TaxObligation, ObligationInstance, ObligationStatus
    from sqlalchemy import and_

    cfg = get_config()
    if not cfg.enabled:
        raise HTTPException(400, detail="البريد الإلكتروني غير مُفعَّل. أضف بيانات SMTP في الإعدادات.")

    # Load client
    client = db.query(Client).filter(Client.id == req.client_id).first()
    if not client:
        raise HTTPException(404, detail="العميل غير موجود")

    to_email = req.to_email or client.email
    if not to_email:
        raise HTTPException(400, detail="لا يوجد بريد إلكتروني لهذا العميل. أضف الإيميل في بيانات العميل أولاً.")

    # Build obligations list
    obligations = []
    if req.include_obligations:
        today = date.today()
        instances = (
            db.query(ObligationInstance)
            .join(TaxObligation)
            .filter(
                TaxObligation.client_id == req.client_id,
                ObligationInstance.status.in_(['pending', 'overdue', 'upcoming']),
            )
            .order_by(ObligationInstance.due_date)
            .limit(20)
            .all()
        )
        for inst in instances:
            days_left = (inst.due_date - today).days if inst.due_date else 0
            obligations.append({
                'obligation_type': inst.obligation.obligation_type if hasattr(inst, 'obligation') and inst.obligation else '',
                'due_date': inst.due_date.strftime('%Y/%m/%d') if inst.due_date else '',
                'days_left': days_left,
            })

    # Build invoices list
    invoices = []
    if req.include_invoices:
        unpaid = (
            db.query(Invoice)
            .filter(
                Invoice.client_id == req.client_id,
                Invoice.status.in_(['sent', 'partial', 'overdue']),
            )
            .order_by(Invoice.issue_date.desc())
            .limit(10)
            .all()
        )
        for inv in unpaid:
            invoices.append({
                'invoice_number': inv.invoice_number,
                'issue_date': inv.issue_date.strftime('%Y/%m/%d') if inv.issue_date else '',
                'total': inv.total or 0,
                'remaining': inv.remaining or 0,
                'status': inv.status.value if hasattr(inv.status, 'value') else str(inv.status),
            })

    if not obligations and not invoices and not req.custom_message:
        return {"success": True, "message": "لا توجد التزامات أو فواتير معلقة لإرسالها"}

    try:
        send_client_reminder(
            to_email=to_email,
            client_name=client.name,
            obligations=obligations,
            invoices=invoices,
            custom_msg=req.custom_message or "",
        )
        summary_parts = []
        if obligations: summary_parts.append(f"{len(obligations)} التزام")
        if invoices: summary_parts.append(f"{len(invoices)} فاتورة معلقة")
        return {
            "success": True,
            "message": f"✅ تم إرسال التذكير إلى {to_email}" + (f" ({', '.join(summary_parts)})" if summary_parts else ""),
            "to_email": to_email,
            "obligations_count": len(obligations),
            "invoices_count": len(invoices),
        }
    except Exception as e:
        raise HTTPException(500, detail=f"فشل الإرسال: {str(e)}")


# ── WhatsApp Settings ────────────────────────────────────────────────────────

class WhatsAppSettings(BaseModel):
    instance_id: str
    token: str


class WhatsAppTestRequest(BaseModel):
    phone: str
    message: Optional[str] = "✅ اختبار WhatsApp من نظام MS Accounting"


@router.post("/whatsapp-settings")
async def save_whatsapp_settings(
    settings: WhatsAppSettings,
    current_user: User = Depends(require_admin),
):
    """Save Green API credentials to .env file."""
    import os
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../.env'))
    existing = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    existing[k.strip()] = v.strip()
    existing['GREENAPI_INSTANCE_ID'] = settings.instance_id
    existing['GREENAPI_TOKEN']       = settings.token
    with open(env_path, 'w') as f:
        for k, v in existing.items():
            f.write(f"{k}={v}\n")
    # Reload env
    os.environ['GREENAPI_INSTANCE_ID'] = settings.instance_id
    os.environ['GREENAPI_TOKEN']       = settings.token
    return {"success": True, "message": "✅ تم حفظ إعدادات WhatsApp"}


@router.get("/whatsapp-settings")
async def get_whatsapp_settings(current_user: User = Depends(get_current_user)):
    import os
    instance_id = os.getenv("GREENAPI_INSTANCE_ID", "")
    token = os.getenv("GREENAPI_TOKEN", "")
    from app.services.whatsapp_service import is_enabled
    return {
        "configured": is_enabled(),
        "instance_id": instance_id,
        "token_masked": ("*" * (len(token) - 4) + token[-4:]) if len(token) > 4 else ("*" * len(token)),
    }


@router.post("/whatsapp-test")
async def test_whatsapp(
    req: WhatsAppTestRequest,
    current_user: User = Depends(get_current_user),
):
    """Send a test WhatsApp message to any number."""
    from app.services.whatsapp_service import send_whatsapp, is_enabled
    if not is_enabled():
        raise HTTPException(400, detail="WhatsApp غير مُعيَّن. أضف instanceId و token أولاً.")
    ok = send_whatsapp(req.phone, req.message)
    if ok:
        return {"success": True, "message": f"✅ تم إرسال رسالة اختبار إلى {req.phone}"}
    raise HTTPException(500, detail="فشل الإرسال — تحقق من instanceId و token وتأكد أن الرقم مسجّل في واتساب")
