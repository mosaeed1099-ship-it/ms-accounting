"""
Import clients from 3 Excel files into MS Accounting.
Rules: no delete, no truncate, no overwrite of existing data without confirmation.
Safe upsert only.
"""
import json
import time
import sys
import requests
import pandas as pd
from difflib import SequenceMatcher

import os
BASE = os.environ.get("MS_API_BASE", "https://ms-accounting-api-production.up.railway.app")
EMAIL = os.environ.get("MS_EMAIL", "")
PASSWORD = os.environ.get("MS_PASSWORD", "")

EXCEL = {
    "دخل":    "/Users/render/Downloads/الدخل (1).xlsx",
    "ضريبة":  "/Users/render/Downloads/ضريبة القيمة المضافة (1).xlsx",
    "مرتبات": "/Users/render/Downloads/اسس توحيد مرتبات (1).xlsx",
}

# Manual overrides: DB name → Excel name
NAME_MAP = {
    "كووف هوب لتجارة الملابس الجاهزة":          "كوف هوب لتجارة الملابس الجاهزة",
    "ايدوكونكت":                                  "ايدو كونكت",
    "جي ستور اليسر للتوريدات العموميه":          "جيي ستور اليسر للتوريدات العمومية",
    "اوزريس لاب":                                 "اوزيرس لابس",
    "فوج للسيارات":                               "شركه فوج للسيارات",
    "قمراستديو":                                  "قمريستوديو",
    "تيكرونكس":                                   "تيكرونكس تك",
    "احمد فارم":                                  "احمد فارم للتصدير",
    "اغريفيان":                                   "اغريفيان لتنسيق الحدائق",
    "بارتنرز":                                    "بارتنرز اندستريز",
    "بيرليكس":                                    "بيرليكس للخدمات",
    "تيل اند بريك":                               "تيل اند بريك تسويق عقاري",
    "جعفر ستور للحفلات":                          "جعفر ستور",
    "حازم عبد الستار ترانزلير للترجمة":          "ترانزلير للترجمة",
    "زوديك":                                      "زودياك وان",
    "سيموفيل":                                    "سيميوفيل لتطوير البرمجيات",
    "منصات متولي للتدريب":                        "منصات متولي",
    "اوريجين":                                    "اوريجين هيلثي ستور",
    "me time مركز تجميل":                        "مي تايم",
    "اربت للاستيراد":                             "اربت للاستيراد والتصدير",
    "تاجر للسيارات / اوتو كار":                  "اوتو كار",
    "تويلف":                                      "تويلف للتجارة العامة",
    "الريادة":                                    "الريادة للاستيراد والتصدير",
    "اوبتاجايل":                                  "اوبتاجيل لتصميم وتطوير البرامج",
    "ايدوكونكت":                                  "ايدو كونكت",
    "ايمري كرم قمريستوديو":                      "قمريستوديو",
    "موشن لينك":                                  "موشن لينك للدعاية والاعلان",
    "دكتور سوو":                                  "دكتورسوو للتجارة والتوريدات",
    "بي فور":                                     "بي فور بليونيرس",
    "احمد حافظ سيميوفيل":                        "سيميوفيل لتطوير البرمجيات",
    "ام دي للديكور و التشطيبات":                 "ام دي للتشطيبات",
}

# DB clients to SKIP (not in any Excel sheet — don't touch them)
SKIP_DB = {
    "TEST_IMPORT_123", "الترناتيف", "الديب سبلايس (محمد الديب )",
    "السيف للمقاولات", "اليكتروستار تسويق سياحي", "امبسدور ريل ستيت",
    "بريسيشن", "بكير الفلسطيني", "تامر عبد القادر", "جلوبكس", "حواش",
    "دكتور عبد الفتاح", "ديرم اكس", "ذا اسكوير", "عمر ممدوح للتسويق العقاري",
    "مازن سويد", "مفاتيح البيت", "Medicalize Tax Residence",
    "الدلجاوي",  # مكرر مع الدلجاوي (برايمي) — نتركه
    "باورماكس",  # مكرر مع باورماكس للتسويق — نتركه
}


def login():
    r = requests.post(f"{BASE}/api/auth/login",
                      data={"username": EMAIL, "password": PASSWORD},
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    token = r.json().get("access_token")
    if not token:
        print("❌ Login failed:", r.text)
        sys.exit(1)
    return {"Authorization": f"Bearer {token}"}


def get_db_clients(headers):
    r = requests.get(f"{BASE}/api/clients?page_size=500&page=1", headers=headers)
    return r.json()["items"]


def read_excel_data():
    d1 = pd.read_excel(EXCEL["دخل"],    sheet_name=0, header=1)
    d2 = pd.read_excel(EXCEL["ضريبة"], sheet_name=0, header=1)
    d3 = pd.read_excel(EXCEL["مرتبات"], sheet_name=0, header=1)

    records = {}  # company_name → dict of all data

    def add(df, src):
        name_col = "اسم الشركة" if "اسم الشركة" in df.columns else "اسم العميل"
        for _, row in df.iterrows():
            name = str(row.get(name_col, "") or "").strip()
            if not name or len(name) < 3 or name in [name_col, "م"]:
                continue
            r = records.setdefault(name, {"_sources": []})
            r["_sources"].append(src)

            def s(col):
                v = row.get(col)
                if pd.isna(v) if hasattr(v, '__class__') else False:
                    return None
                return str(v).strip() if v else None

            if s("اسم العميل") and name_col != "اسم العميل":
                r.setdefault("contact_person", s("اسم العميل"))
            if s("رقم القومي للعميل"):
                r.setdefault("national_id", s("رقم القومي للعميل"))
            if s("الاميل "):
                r.setdefault("email", s("الاميل "))
            if s("اسم المستخدم"):
                r.setdefault("portal_username", s("اسم المستخدم"))
            if s("الباسورد"):
                r.setdefault("portal_password", s("الباسورد"))
            if s("الفاتورة الالكترونية"):
                r.setdefault("einvoice_email", s("الفاتورة الالكترونية"))
            if s("الباسورد الفاتورة الالكترونية"):
                r.setdefault("einvoice_password", s("الباسورد الفاتورة الالكترونية"))
            if s("باسورد الاميل ") or s("باسورد الاميل"):
                r.setdefault("email_password", s("باسورد الاميل ") or s("باسورد الاميل"))
            if s("منظومة توحيد المرتبات"):
                r["payroll_username"] = s("منظومة توحيد المرتبات")
            if s("الباسورد توحيد المرتبات"):
                r["payroll_password"] = s("الباسورد توحيد المرتبات")
            if s("Unnamed: 1"):
                r.setdefault("payroll_type", s("Unnamed: 1"))
            if s("منظومة الضربية "):
                r.setdefault("portal_system", s("منظومة الضربية "))
            if s("اقرارات"):
                r.setdefault("declaration_type", s("اقرارات"))

    add(d1, "دخل")
    add(d2, "ضريبة")
    add(d3, "مرتبات")
    return records


def sim(a, b):
    return SequenceMatcher(None, a.strip(), b.strip()).ratio()


def find_db_client(excel_name, db_clients):
    """Find matching DB client for an Excel company name."""
    # Direct match
    for c in db_clients:
        if c["name"].strip() == excel_name.strip():
            return c
    # Via NAME_MAP (reversed: excel→db)
    excel_to_db = {v: k for k, v in NAME_MAP.items()}
    if excel_name in excel_to_db:
        db_name = excel_to_db[excel_name]
        for c in db_clients:
            if c["name"].strip() == db_name.strip():
                return c
    return None


def create_or_update_client(excel_name, data, db_clients, headers):
    db_client = find_db_client(excel_name, db_clients)

    if db_client:
        client_id = db_client["id"]
        # Update email if not set
        updates = {}
        if data.get("email") and not db_client.get("email"):
            updates["email"] = data["email"]
        if updates:
            r = requests.put(f"{BASE}/api/clients/{client_id}", json=updates, headers=headers)
            if r.status_code == 200:
                print(f"  📧 Updated email for [{client_id}] {db_client['name']}")
        print(f"  ✅ Matched [{client_id}] {db_client['name']}")
    else:
        # Create new client
        payload = {
            "name": excel_name,
            "email": data.get("email"),
            "national_id": data.get("national_id"),
            "status": "active",
            "client_type": "company",
        }
        payload = {k: v for k, v in payload.items() if v}
        r = requests.post(f"{BASE}/api/clients", json=payload, headers=headers)
        if r.status_code not in (200, 201):
            print(f"  ❌ Failed to create {excel_name}: {r.text[:100]}")
            return None
        client_id = r.json()["id"]
        print(f"  🆕 Created [{client_id}] {excel_name}")

    # Upsert portal credentials
    cred_payload = {k: v for k, v in {
        "contact_person":   data.get("contact_person"),
        "national_id":      data.get("national_id"),
        "portal_system":    data.get("portal_system"),
        "portal_username":  data.get("portal_username"),
        "portal_password":  data.get("portal_password"),
        "einvoice_email":   data.get("einvoice_email"),
        "einvoice_password": data.get("einvoice_password"),
        "email_address":    data.get("email"),
        "email_password":   data.get("email_password"),
        "payroll_username": data.get("payroll_username"),
        "payroll_password": data.get("payroll_password"),
        "payroll_type":     data.get("payroll_type"),
        "declaration_type": data.get("declaration_type"),
    }.items() if v}

    if cred_payload:
        r = requests.put(f"{BASE}/api/portal-credentials/{client_id}",
                         json=cred_payload, headers=headers)
        if r.status_code == 200:
            print(f"  🔐 Credentials saved for [{client_id}]")
        else:
            print(f"  ⚠️  Credentials failed [{client_id}]: {r.text[:100]}")

    return client_id


def main():
    print("🔐 Logging in...")
    headers = login()

    print("📥 Reading DB clients...")
    db_clients = get_db_clients(headers)
    print(f"   {len(db_clients)} clients in DB")

    print("📊 Reading Excel files...")
    records = read_excel_data()
    print(f"   {len(records)} unique companies in Excel")

    # Skip the known skip set
    skip_excel_names = set()
    for db_name in SKIP_DB:
        excel_equiv = NAME_MAP.get(db_name, db_name)
        skip_excel_names.add(excel_equiv)

    created = updated = skipped = failed = 0

    for excel_name, data in sorted(records.items()):
        if excel_name in skip_excel_names:
            print(f"  ⏭️  Skip: {excel_name}")
            skipped += 1
            continue

        print(f"\n→ {excel_name}")
        result = create_or_update_client(excel_name, data, db_clients, headers)
        if result:
            updated += 1
        else:
            failed += 1
        time.sleep(0.1)  # rate limit

    print(f"\n✅ Done. Updated/created: {updated} | Skipped: {skipped} | Failed: {failed}")


if __name__ == "__main__":
    main()
