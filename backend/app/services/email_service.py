"""
Email Notification Service for MS Accounting
Supports: task assignment, task deadline, invoice reminders, obligation alerts
"""
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)


# ── Email Config (loaded from .env) ────────────────────────────────────────
class EmailConfig:
    def __init__(self):
        from app.config import settings
        self.smtp_host = getattr(settings, 'SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(getattr(settings, 'SMTP_PORT', 587))
        self.smtp_user = getattr(settings, 'SMTP_USER', '')
        self.smtp_pass = getattr(settings, 'SMTP_PASS', '')
        self.from_name = getattr(settings, 'EMAIL_FROM_NAME', 'MS Accounting')
        self.from_email = getattr(settings, 'EMAIL_FROM', self.smtp_user)
        self.enabled = bool(self.smtp_user and self.smtp_pass)


_config = None

def get_config() -> EmailConfig:
    global _config
    if _config is None:
        _config = EmailConfig()
    return _config


def reload_config():
    """Call this after updating .env to reload email config."""
    global _config
    _config = None


# ── HTML Email Templates ────────────────────────────────────────────────────
def _base_template(content: str, title: str) -> str:
    return f"""
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title}</title>
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background:#f1f5f9; margin:0; padding:20px; direction:rtl; }}
    .container {{ max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,.1); }}
    .header {{ background:linear-gradient(135deg,#1a2472,#152060); padding:28px 32px; text-align:center; }}
    .header h1 {{ color:#fff; margin:0; font-size:22px; }}
    .header p {{ color:#b3c4e8; margin:6px 0 0; font-size:13px; }}
    .body {{ padding:32px; }}
    .card {{ background:#f8fafc; border-radius:8px; padding:16px 20px; margin:16px 0; border-right:4px solid #1a2472; }}
    .badge {{ display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }}
    .badge-blue {{ background:#eef1fb; color:#1a2472; }}
    .badge-green {{ background:#f0fdf4; color:#16a34a; }}
    .badge-red {{ background:#fef2f2; color:#dc2626; }}
    .badge-yellow {{ background:#fefce8; color:#d97706; }}
    .btn {{ display:inline-block; background:#1a2472; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:600; margin-top:20px; }}
    .footer {{ background:#f8fafc; padding:20px 32px; text-align:center; border-top:1px solid #e2e8f0; }}
    .footer p {{ color:#94a3b8; font-size:12px; margin:0; }}
    table {{ width:100%; border-collapse:collapse; margin:12px 0; }}
    td {{ padding:10px 12px; border-bottom:1px solid #f1f5f9; font-size:13px; }}
    td:first-child {{ font-weight:600; color:#374151; width:40%; }}
    td:last-child {{ color:#64748b; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏛️ MS Accounting</h1>
      <p>مكتب المحاسبة — نظام الإدارة</p>
    </div>
    <div class="body">
      {content}
    </div>
    <div class="footer">
      <p>هذا البريد تم إرساله تلقائياً من نظام MS Accounting</p>
      <p style="margin-top:4px">{datetime.now().strftime('%Y/%m/%d — %H:%M')}</p>
    </div>
  </div>
</body>
</html>"""


def task_assigned_template(task_title: str, assigned_to: str, assigned_by: str,
                            client_name: Optional[str], due_date: Optional[str],
                            priority: str, description: Optional[str]) -> tuple[str, str]:
    priority_badge = {
        'urgent': '<span class="badge badge-red">🚨 عاجلة</span>',
        'high':   '<span class="badge badge-red">🔴 عالية</span>',
        'medium': '<span class="badge badge-yellow">🟡 متوسطة</span>',
        'low':    '<span class="badge badge-blue">🔵 منخفضة</span>',
    }.get(priority, priority)

    subject = f"📋 مهمة جديدة مُعيَّنة لك: {task_title}"
    content = f"""
      <h2 style="color:#1e293b;margin:0 0 8px">📋 مهمة جديدة مُعيَّنة لك</h2>
      <p style="color:#64748b;margin:0 0 20px">مرحباً <strong>{assigned_to}</strong>، تم تعيين مهمة جديدة لك في نظام MS Accounting</p>
      <div class="card">
        <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:12px">{task_title}</div>
        <table>
          <tr><td>📌 الأولوية</td><td>{priority_badge}</td></tr>
          <tr><td>👤 مُعيَّن بواسطة</td><td>{assigned_by}</td></tr>
          {'<tr><td>🏢 العميل</td><td>'+client_name+'</td></tr>' if client_name else ''}
          {'<tr><td>📅 تاريخ الاستحقاق</td><td>'+due_date+'</td></tr>' if due_date else ''}
        </table>
        {f'<div style="margin-top:12px;padding:12px;background:#fff;border-radius:6px;font-size:13px;color:#374151"><strong>الوصف:</strong><br>{description}</div>' if description else ''}
      </div>
      <p style="font-size:13px;color:#64748b">يرجى الاطلاع على المهمة والبدء في التنفيذ في أقرب وقت.</p>
      <a href="http://localhost:5173" class="btn">🚀 فتح النظام</a>
    """
    return subject, _base_template(content, subject)


def task_reminder_template(task_title: str, assigned_to: str, due_date: str,
                            days_left: int, client_name: Optional[str]) -> tuple[str, str]:
    urgency = "🚨 انتهى الميعاد!" if days_left < 0 else f"⏰ {days_left} يوم متبقي"
    badge_cls = "badge-red" if days_left <= 1 else "badge-yellow"
    subject = f"⏰ تذكير: مهمة '{task_title}' — {urgency}"
    content = f"""
      <h2 style="color:#1e293b;margin:0 0 8px">⏰ تذكير بمهمة قادمة الموعد</h2>
      <p style="color:#64748b;margin:0 0 20px">مرحباً <strong>{assigned_to}</strong></p>
      <div class="card" style="border-color:{'#dc2626' if days_left<=1 else '#d97706'}">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:10px">{task_title}</div>
        <span class="{badge_cls} badge">{urgency}</span>
        <table style="margin-top:12px">
          <tr><td>📅 تاريخ الاستحقاق</td><td>{due_date}</td></tr>
          {'<tr><td>🏢 العميل</td><td>'+client_name+'</td></tr>' if client_name else ''}
        </table>
      </div>
      <a href="http://localhost:5173" class="btn">📋 فتح المهام</a>
    """
    return subject, _base_template(content, subject)


def obligation_reminder_template(client_name: str, obligation_type: str,
                                  due_date: str, days_left: int) -> tuple[str, str]:
    obl_labels = {
        'vat_monthly': 'ضريبة القيمة المضافة الشهرية',
        'vat_quarterly': 'ضريبة القيمة المضافة الربعية',
        'income_annual': 'ضريبة الدخل السنوية',
        'payroll_monthly': 'مرتبات شهري',
        'withholding_monthly': 'خصم وإضافة شهري',
        'stamp_quarterly': 'دمغة ربعي',
    }
    obl_label = obl_labels.get(obligation_type, obligation_type)
    subject = f"🔔 التزام ضريبي قادم: {client_name} — {obl_label}"
    content = f"""
      <h2 style="color:#1e293b;margin:0 0 8px">🔔 تذكير بالتزام ضريبي</h2>
      <div class="card">
        <table>
          <tr><td>🏢 العميل</td><td><strong>{client_name}</strong></td></tr>
          <tr><td>📋 نوع الالتزام</td><td>{obl_label}</td></tr>
          <tr><td>📅 تاريخ الاستحقاق</td><td>{due_date}</td></tr>
          <tr><td>⏳ المتبقي</td><td>{'<span class="badge badge-red">متأخر '+str(abs(days_left))+' يوم</span>' if days_left<0 else str(days_left)+' يوم'}</td></tr>
        </table>
      </div>
      <a href="http://localhost:5173" class="btn">🔔 فتح الالتزامات</a>
    """
    return subject, _base_template(content, subject)


def client_reminder_template(client_name: str, obligations: list, invoices: list,
                              custom_msg: str = "") -> tuple[str, str]:
    """Full reminder email for a client: obligations + unpaid invoices."""
    obl_labels = {
        'vat_monthly': 'ضريبة القيمة المضافة الشهرية',
        'vat_quarterly': 'ضريبة القيمة المضافة الربعية',
        'income_annual': 'ضريبة الدخل السنوية',
        'payroll_monthly': 'مرتبات شهري',
        'withholding_monthly': 'خصم وإضافة شهري',
        'stamp_quarterly': 'دمغة ربعي',
    }
    subject = f"📋 تذكير من مكتب MS Accounting — {client_name}"

    # Obligations section
    obl_rows = ""
    for o in obligations:
        obl_type = obl_labels.get(o.get('obligation_type',''), o.get('obligation_type',''))
        due = o.get('due_date','')
        days = o.get('days_left', 0)
        if days < 0:
            urgency = f'<span class="badge badge-red">متأخر {abs(days)} يوم</span>'
        elif days <= 7:
            urgency = f'<span class="badge badge-red">⚠️ {days} أيام</span>'
        elif days <= 30:
            urgency = f'<span class="badge badge-yellow">⏰ {days} يوم</span>'
        else:
            urgency = f'<span class="badge badge-blue">{days} يوم</span>'
        obl_rows += f"<tr><td>{obl_type}</td><td>{due}</td><td>{urgency}</td></tr>"

    obl_section = ""
    if obligations:
        obl_section = f"""
      <h3 style="color:#1e293b;font-size:15px;margin:20px 0 10px">🔔 الالتزامات الضريبية القادمة</h3>
      <div class="card">
        <table>
          <tr style="background:#f8fafc"><td><strong>نوع الالتزام</strong></td><td><strong>تاريخ الاستحقاق</strong></td><td><strong>المتبقي</strong></td></tr>
          {obl_rows}
        </table>
      </div>"""

    # Invoices section
    inv_rows = ""
    total_remaining = 0
    for inv in invoices:
        remaining = inv.get('remaining', 0) or 0
        total_remaining += remaining
        status_map = {'sent': 'مُرسَلة', 'partial': 'مدفوعة جزئياً', 'draft': 'مسودة', 'overdue': 'متأخرة'}
        status_label = status_map.get(inv.get('status',''), inv.get('status',''))
        inv_rows += f"<tr><td>{inv.get('invoice_number','')}</td><td>{inv.get('issue_date','')}</td><td>{inv.get('total',0):,.0f} ج.م.</td><td>{remaining:,.0f} ج.م.</td><td>{status_label}</td></tr>"

    inv_section = ""
    if invoices:
        inv_section = f"""
      <h3 style="color:#1e293b;font-size:15px;margin:20px 0 10px">💳 الفواتير المعلقة</h3>
      <div class="card">
        <table>
          <tr style="background:#f8fafc"><td><strong>رقم الفاتورة</strong></td><td><strong>التاريخ</strong></td><td><strong>الإجمالي</strong></td><td><strong>المتبقي</strong></td><td><strong>الحالة</strong></td></tr>
          {inv_rows}
        </table>
        <div style="margin-top:10px;padding:10px;background:#fef2f2;border-radius:6px;text-align:left">
          <strong style="color:#dc2626">إجمالي المستحق: {total_remaining:,.0f} ج.م.</strong>
        </div>
      </div>"""

    custom_section = ""
    if custom_msg:
        custom_section = f"""
      <div style="background:#eef1fb;border:1px solid #b3c4e8;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:13px;color:#1e293b;line-height:1.7">
        <strong>رسالة من المكتب:</strong><br>{custom_msg}
      </div>"""

    content = f"""
      <h2 style="color:#1e293b;margin:0 0 4px">📋 تذكير من مكتب MS Accounting</h2>
      <p style="color:#64748b;margin:0 0 4px">مرحباً، هذا تذكير موجَّه إلى <strong>{client_name}</strong></p>
      {custom_section}
      {obl_section}
      {inv_section}
      <p style="font-size:12px;color:#94a3b8;margin-top:20px">للاستفسار، تواصل مع مكتبنا مباشرةً.</p>
    """
    return subject, _base_template(content, subject)


def send_client_reminder(to_email: str, client_name: str, obligations: list,
                          invoices: list, custom_msg: str = "") -> bool:
    subject, html = client_reminder_template(client_name, obligations, invoices, custom_msg)
    return send_email_sync(to_email, subject, html)


def compose_email_template(subject: str, body: str, sender_name: str,
                            client_name: Optional[str] = None,
                            obligations: Optional[list] = None,
                            invoices: Optional[list] = None) -> tuple[str, str]:
    """Free-form email composer — wraps plain text body in branded HTML."""
    # Convert newlines to <br> in body
    body_html = body.replace('\n', '<br>')

    obl_labels = {
        'vat_monthly': 'ضريبة القيمة المضافة الشهرية',
        'vat_quarterly': 'ضريبة القيمة المضافة الربعية',
        'income_annual': 'ضريبة الدخل السنوية',
        'payroll_monthly': 'مرتبات شهري',
        'withholding_monthly': 'خصم وإضافة شهري',
        'insurance_monthly': 'تأمينات اجتماعية',
        'stamp_quarterly': 'دمغة ربعي',
        'form_41': 'نموذج 41 — إقرار المرتبات السنوي',
        'corporate_tax': 'ضريبة الأرباح التجارية السنوية',
        'commercial_register_renewal': 'تجديد السجل التجاري',
    }

    greeting = f"<p style='color:#64748b;margin:0 0 20px'>مرحباً{'، <strong>'+client_name+'</strong>' if client_name else ''},</p>" if client_name else ""

    # Build obligations section
    obl_section = ""
    if obligations:
        obl_rows = ""
        for o in obligations:
            obl_type = obl_labels.get(o.get('obligation_type', ''), o.get('obligation_type', ''))
            due = o.get('due_date', '')
            days = o.get('days_left', 0)
            if days < 0:
                urgency = f'<span class="badge badge-red">متأخر {abs(days)} يوم</span>'
            elif days <= 7:
                urgency = f'<span class="badge badge-red">⚠️ {days} أيام</span>'
            elif days <= 30:
                urgency = f'<span class="badge badge-yellow">⏰ {days} يوم</span>'
            else:
                urgency = f'<span class="badge badge-blue">{days} يوم</span>'
            obl_rows += f"<tr><td>{obl_type}</td><td>{due}</td><td>{urgency}</td></tr>"
        obl_section = f"""
      <h3 style="color:#1e293b;font-size:15px;margin:24px 0 10px">🔔 الالتزامات الضريبية القادمة</h3>
      <div class="card">
        <table>
          <tr style="background:#f8fafc"><td><strong>نوع الالتزام</strong></td><td><strong>تاريخ الاستحقاق</strong></td><td><strong>المتبقي</strong></td></tr>
          {obl_rows}
        </table>
      </div>"""

    # Build invoices section
    inv_section = ""
    if invoices:
        inv_rows = ""
        total_remaining = 0
        for inv in invoices:
            remaining = inv.get('remaining', 0) or 0
            total_remaining += remaining
            status_map = {'sent': 'مُرسَلة', 'partial': 'مدفوعة جزئياً', 'draft': 'مسودة', 'overdue': 'متأخرة'}
            status_label = status_map.get(inv.get('status', ''), inv.get('status', ''))
            inv_rows += f"<tr><td>{inv.get('invoice_number','')}</td><td>{inv.get('issue_date','')}</td><td>{inv.get('total',0):,.0f} ج.م.</td><td>{remaining:,.0f} ج.م.</td><td>{status_label}</td></tr>"
        inv_section = f"""
      <h3 style="color:#1e293b;font-size:15px;margin:24px 0 10px">💳 الفواتير المعلقة</h3>
      <div class="card">
        <table>
          <tr style="background:#f8fafc"><td><strong>رقم الفاتورة</strong></td><td><strong>التاريخ</strong></td><td><strong>الإجمالي</strong></td><td><strong>المتبقي</strong></td><td><strong>الحالة</strong></td></tr>
          {inv_rows}
        </table>
        <div style="margin-top:10px;padding:10px;background:#fef2f2;border-radius:6px;text-align:left">
          <strong style="color:#dc2626">إجمالي المستحق: {total_remaining:,.0f} ج.م.</strong>
        </div>
      </div>"""

    content = f"""
      {greeting}
      <div style="font-size:14px;color:#1e293b;line-height:1.9;white-space:pre-wrap;background:#f8fafc;border-radius:8px;padding:18px 20px;border-right:4px solid #1a2472">
        {body_html}
      </div>
      {obl_section}
      {inv_section}
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:12px">
        تم الإرسال بواسطة: <strong>{sender_name}</strong> — مكتب MS Accounting
      </p>
    """
    return subject, _base_template(content, subject)


def test_email_template(sent_to: str) -> tuple[str, str]:
    subject = "✅ اختبار الإشعارات — MS Accounting"
    content = f"""
      <h2 style="color:#1e293b;margin:0 0 12px">✅ نظام الإشعارات يعمل بنجاح!</h2>
      <p style="color:#64748b">مرحباً، هذه رسالة اختبار من نظام <strong>MS Accounting</strong></p>
      <div class="card" style="border-color:#10b981">
        <table>
          <tr><td>📧 تم الإرسال إلى</td><td>{sent_to}</td></tr>
          <tr><td>🕐 وقت الإرسال</td><td>{datetime.now().strftime('%Y/%m/%d %H:%M')}</td></tr>
          <tr><td>⚙️ النظام</td><td>MS Accounting v2.0</td></tr>
          <tr><td>✅ الحالة</td><td><span class="badge badge-green">يعمل بنجاح</span></td></tr>
        </table>
      </div>
      <p style="font-size:13px;color:#64748b;margin-top:16px">
        ستصلك الإشعارات التالية تلقائياً:<br>
        📋 عند تعيين مهمة جديدة لك<br>
        ⏰ تذكير قبل موعد تسليم المهمة بيوم<br>
        🔔 تنبيه الالتزامات الضريبية القادمة
      </p>
    """
    return subject, _base_template(content, subject)


# ── Core Sender ─────────────────────────────────────────────────────────────
def send_email_sync(to_email: str, subject: str, html_body: str) -> bool:
    """Send email synchronously. Returns True on success."""
    cfg = get_config()
    if not cfg.enabled:
        logger.warning("Email not configured — skipping send")
        return False
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{cfg.from_name} <{cfg.from_email}>"
        msg['To'] = to_email
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))

        try:
            import certifi
            context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            context = ssl.create_default_context()
        with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(cfg.smtp_user, cfg.smtp_pass)
            server.sendmail(cfg.from_email, to_email, msg.as_string())
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Email send failed to {to_email}: {e}")
        raise


async def send_email_async(to_email: str, subject: str, html_body: str) -> bool:
    """Send email asynchronously using aiosmtplib."""
    cfg = get_config()
    if not cfg.enabled:
        return False
    try:
        import aiosmtplib
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{cfg.from_name} <{cfg.from_email}>"
        msg['To'] = to_email
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))

        try:
            import certifi
            tls_context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            tls_context = ssl.create_default_context()
        await aiosmtplib.send(
            msg,
            hostname=cfg.smtp_host,
            port=cfg.smtp_port,
            start_tls=True,
            tls_context=tls_context,
            username=cfg.smtp_user,
            password=cfg.smtp_pass,
            timeout=15,
        )
        logger.info(f"Async email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Async email failed to {to_email}: {e}")
        raise


# ── Notification Helpers ─────────────────────────────────────────────────────
def notify_task_assigned(to_email: str, task_title: str, assigned_to: str,
                         assigned_by: str, client_name=None, due_date=None,
                         priority='medium', description=None):
    subject, html = task_assigned_template(task_title, assigned_to, assigned_by,
                                            client_name, due_date, priority, description)
    return send_email_sync(to_email, subject, html)


def notify_task_reminder(to_email: str, task_title: str, assigned_to: str,
                         due_date: str, days_left: int, client_name=None):
    subject, html = task_reminder_template(task_title, assigned_to, due_date,
                                           days_left, client_name)
    return send_email_sync(to_email, subject, html)


def notify_obligation(to_email: str, client_name: str, obligation_type: str,
                      due_date: str, days_left: int):
    subject, html = obligation_reminder_template(client_name, obligation_type,
                                                  due_date, days_left)
    return send_email_sync(to_email, subject, html)


def send_test_email(to_email: str) -> bool:
    subject, html = test_email_template(to_email)
    return send_email_sync(to_email, subject, html)
