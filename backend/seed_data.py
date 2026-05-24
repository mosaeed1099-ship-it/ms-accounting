"""
سكريبت لإضافة بيانات تجريبية لنظام MS Accounting
"""
import sys
sys.path.insert(0, '.')
from datetime import date, timedelta
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.models.client import Client, ClientType, ClientStatus, TaxType
from app.models.client_contact import ClientContact
from app.models.invoice import Invoice, InvoiceItem, Payment, InvoiceStatus
from app.models.task import Task, TaskStatus, TaskPriority, TaskCategory
from app.models.tax import TaxReturn, TaxReturnType, TaxReturnStatus
from app.models.activity import ActivityLog
from app.core.security import get_password_hash

db = SessionLocal()

def seed():
    print("🌱 إضافة بيانات تجريبية...")

    # Users
    users_data = [
        {"name": "أحمد محمود", "email": "ahmed@ms.com", "role": UserRole.ACCOUNTANT, "phone": "01001234567"},
        {"name": "سارة عبدالله", "email": "sara@ms.com", "role": UserRole.ACCOUNTANT, "phone": "01112345678"},
        {"name": "محمد علي", "email": "manager@ms.com", "role": UserRole.MANAGER, "phone": "01223456789"},
    ]
    added_users = []
    for u in users_data:
        if not db.query(User).filter(User.email == u["email"]).first():
            user = User(**u, hashed_password=get_password_hash("Pass@123"), is_active=True)
            db.add(user)
            added_users.append(user)
    db.flush()
    print(f"  ✅ {len(added_users)} مستخدم")

    admin = db.query(User).filter(User.email == "admin@ms-accounting.com").first()

    # Clients
    clients_data = [
        {"name": "شركة النيل للتجارة", "name_en": "Nile Trading Co.", "client_type": ClientType.COMPANY,
         "status": ClientStatus.ACTIVE, "tax_number": "123-456-789", "phone": "0226789012",
         "commercial_register": "CR-2019-45678", "activity": "استيراد وتصدير",
         "governorate": "القاهرة", "tax_type": TaxType.VAT, "contract_value": 24000},
        {"name": "مصطفى رمضان", "client_type": ClientType.INDIVIDUAL,
         "status": ClientStatus.ACTIVE, "national_id": "29012345678901", "phone": "01234567890",
         "activity": "محل بقالة", "governorate": "الجيزة", "tax_type": TaxType.INCOME, "contract_value": 6000},
        {"name": "مجموعة الفتح الهندسية", "name_en": "Al-Fath Engineering Group",
         "client_type": ClientType.COMPANY, "status": ClientStatus.ACTIVE,
         "tax_number": "987-654-321", "phone": "0233456789", "commercial_register": "CR-2015-12345",
         "activity": "مقاولات وتشييد", "governorate": "الإسكندرية",
         "tax_type": TaxType.VAT, "contract_value": 36000},
        {"name": "دار النشر الحديثة", "client_type": ClientType.COMPANY,
         "status": ClientStatus.ACTIVE, "tax_number": "456-789-123", "phone": "0244567890",
         "activity": "نشر وطباعة", "governorate": "القاهرة",
         "tax_type": TaxType.VAT, "contract_value": 18000},
        {"name": "هند يوسف - فريلانسر", "client_type": ClientType.FREELANCER,
         "status": ClientStatus.PROSPECT, "phone": "01098765432",
         "activity": "تصميم جرافيك", "governorate": "القاهرة",
         "tax_type": TaxType.NONE, "contract_value": 3000},
    ]
    added_clients = []
    from sqlalchemy import func
    for i, c in enumerate(clients_data):
        if not db.query(Client).filter(Client.name == c["name"]).first():
            count = db.query(func.count(Client.id)).scalar() + i + 1
            client = Client(**c, code=f"CLT-{str(count).zfill(4)}", created_by=admin.id if admin else None)
            db.add(client)
            added_clients.append(client)
    db.flush()
    print(f"  ✅ {len(added_clients)} عميل")

    clients = db.query(Client).all()

    # Invoices
    if clients and not db.query(Invoice).first():
        invoices_data = [
            {"client": clients[0], "status": InvoiceStatus.PAID, "days_ago": 45, "items": [
                {"description": "خدمات محاسبية شهرية - يناير 2026", "quantity": 1, "unit_price": 2000},
                {"description": "إعداد الإقرار الضريبي", "quantity": 1, "unit_price": 500},
            ]},
            {"client": clients[0], "status": InvoiceStatus.SENT, "days_ago": 10, "items": [
                {"description": "خدمات محاسبية شهرية - أبريل 2026", "quantity": 1, "unit_price": 2000},
            ]},
            {"client": clients[2], "status": InvoiceStatus.PARTIAL, "days_ago": 30, "items": [
                {"description": "مراجعة القوائم المالية 2025", "quantity": 1, "unit_price": 8000},
                {"description": "تقرير المراجع الخارجي", "quantity": 1, "unit_price": 2000},
            ]},
            {"client": clients[1], "status": InvoiceStatus.OVERDUE, "days_ago": 60, "items": [
                {"description": "خدمات محاسبية شهرية", "quantity": 1, "unit_price": 500},
            ]},
            {"client": clients[3], "status": InvoiceStatus.PAID, "days_ago": 20, "items": [
                {"description": "إعداد الميزانية السنوية", "quantity": 1, "unit_price": 3000},
            ]},
        ]

        from datetime import datetime
        year = datetime.now().year
        for i, inv_data in enumerate(invoices_data):
            issue = date.today() - timedelta(days=inv_data["days_ago"])
            subtotal = sum(it["quantity"] * it["unit_price"] for it in inv_data["items"])
            tax = subtotal * 0.14
            total = subtotal + tax
            paid = total if inv_data["status"] == InvoiceStatus.PAID else (total * 0.5 if inv_data["status"] == InvoiceStatus.PARTIAL else 0)

            inv = Invoice(
                invoice_number=f"INV-{year}-{str(i+1).zfill(4)}",
                client_id=inv_data["client"].id,
                status=inv_data["status"],
                issue_date=issue,
                due_date=issue + timedelta(days=30),
                subtotal=subtotal,
                discount_percent=0, discount_amount=0,
                tax_percent=14, tax_amount=tax,
                stamp_tax=0, withholding_tax=0,
                total=total, paid_amount=paid,
                remaining=total - paid,
                created_by=admin.id if admin else None,
            )
            db.add(inv)
            db.flush()
            for item in inv_data["items"]:
                db.add(InvoiceItem(invoice_id=inv.id, description=item["description"],
                                   quantity=item["quantity"], unit_price=item["unit_price"],
                                   total=item["quantity"]*item["unit_price"], tax_percent=0))
        print(f"  ✅ {len(invoices_data)} فاتورة")

    # Tasks
    if clients and not db.query(Task).first():
        tasks_data = [
            {"title": "إعداد إقرار ضريبة القيمة المضافة - أبريل 2026", "priority": TaskPriority.URGENT,
             "category": TaskCategory.TAX, "status": TaskStatus.IN_PROGRESS,
             "due_date": date.today() + timedelta(days=3), "client": clients[0]},
            {"title": "مراجعة قوائم مالية ربع سنوية", "priority": TaskPriority.HIGH,
             "category": TaskCategory.ACCOUNTING, "status": TaskStatus.TODO,
             "due_date": date.today() + timedelta(days=7), "client": clients[2]},
            {"title": "تقديم ضريبة الدخل السنوية 2025", "priority": TaskPriority.HIGH,
             "category": TaskCategory.TAX, "status": TaskStatus.TODO,
             "due_date": date.today() + timedelta(days=14), "client": clients[1]},
            {"title": "إعداد كشف المرتبات - مايو 2026", "priority": TaskPriority.MEDIUM,
             "category": TaskCategory.PAYROLL, "status": TaskStatus.TODO,
             "due_date": date.today() + timedelta(days=5), "client": clients[2]},
            {"title": "متابعة سداد الفاتورة المتأخرة", "priority": TaskPriority.HIGH,
             "category": TaskCategory.OTHER, "status": TaskStatus.TODO,
             "due_date": date.today() + timedelta(days=2), "client": clients[1]},
            {"title": "إعداد عقد خدمات لعميل جديد", "priority": TaskPriority.MEDIUM,
             "category": TaskCategory.LEGAL, "status": TaskStatus.REVIEW,
             "due_date": date.today() + timedelta(days=10), "client": clients[4]},
        ]
        for t in tasks_data:
            client = t.pop("client")
            db.add(Task(**t, client_id=client.id, created_by=admin.id if admin else None))
        print(f"  ✅ {len(tasks_data)} مهمة")

    # Tax Returns
    if clients and not db.query(TaxReturn).first():
        tax_data = [
            {"client": clients[0], "return_type": TaxReturnType.VAT_MONTHLY, "period_year": 2026,
             "period_month": 4, "status": TaxReturnStatus.PENDING,
             "due_date": date.today() + timedelta(days=5), "tax_amount": 2800},
            {"client": clients[2], "return_type": TaxReturnType.VAT_MONTHLY, "period_year": 2026,
             "period_month": 4, "status": TaxReturnStatus.IN_PROGRESS,
             "due_date": date.today() + timedelta(days=8), "tax_amount": 5200},
            {"client": clients[1], "return_type": TaxReturnType.INCOME_ANNUAL, "period_year": 2025,
             "status": TaxReturnStatus.PENDING,
             "due_date": date.today() + timedelta(days=30), "tax_amount": 1500},
            {"client": clients[3], "return_type": TaxReturnType.VAT_MONTHLY, "period_year": 2026,
             "period_month": 3, "status": TaxReturnStatus.SUBMITTED,
             "due_date": date.today() - timedelta(days=10),
             "submission_date": date.today() - timedelta(days=12), "tax_amount": 3100},
        ]
        for t in tax_data:
            client = t.pop("client")
            db.add(TaxReturn(**t, client_id=client.id, created_by=admin.id if admin else None))
        print(f"  ✅ {len(tax_data)} إقرار ضريبي")

    # Activity logs
    if clients and not db.query(ActivityLog).first():
        logs = [
            {"action": "create_client", "description": f"تم إضافة عميل جديد: {clients[0].name}", "client": clients[0]},
            {"action": "create_invoice", "description": "تم إنشاء فاتورة جديدة INV-2026-0001", "client": clients[0]},
            {"action": "record_payment", "description": "تم تسجيل دفعة 2890 جنيه", "client": clients[0]},
            {"action": "create_task", "description": "تم إضافة مهمة جديدة: إعداد إقرار ضريبي", "client": clients[0]},
        ]
        for log in logs:
            client = log.pop("client")
            db.add(ActivityLog(user_id=admin.id if admin else None, client_id=client.id, **log))

    db.commit()
    print("✅ تم إضافة جميع البيانات التجريبية بنجاح!")

if __name__ == "__main__":
    seed()
    db.close()
