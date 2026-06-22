# MS Accounting — Stable Maintenance Mode

> **الوضع الحالي: Stable Maintenance — ممنوع أي Refactor أو Migration أو Architecture Change**

---

## 1. Source of Truth

| الطبقة | المصدر |
|--------|--------|
| تعديل الكود | `js/src/*.js` فقط |
| الملف المُنتَج | `frontend/index.html` (لا تلمسه مباشرة) |
| Production | `https://mosaeed1099-ship-it.github.io/ms-accounting/` |
| Backend | `https://ms-accounting-api-production.up.railway.app` |
| Auth token key | `ms_token` في localStorage (وليس `token`) |

---

## 2. طريقة التعديل الإلزامية

**قبل أي تعديل:**
1. افحص الوضع الحالي
2. حدد الملف الصحيح في `js/src/`
3. اشرح التأثير المتوقع
4. انتظر الموافقة إذا كان التعديل غير واضح

**التعديل:**
```
js/src/[الملف المناسب]  ← هنا فقط
```

**بعد التعديل — أمر واحد فقط:**
```bash
bash scripts/deploy.sh "وصف التغيير"
# يشمل: build → 36 check → commit → push
```

**إذا فشلت أي خطوة → ممنوع النشر نهائياً.**

---

## 3. قواعد النشر

```
✅ bash scripts/deploy.sh "وصف"    ← الطريقة الوحيدة المسموحة
❌ git push مباشرة بدون build
❌ تعديل index.html مباشرة
❌ تعديل gh-pages يدوياً
❌ merge أو overwrite ملفات كبيرة يدوياً
❌ تخطي pre_deploy_check
```

---

## 4. ممنوع حالياً (Feature Freeze على Architecture)

```
❌ React Migration
❌ Architecture Refactor
❌ Modular Rewrite جديد
❌ حذف ملفات أساسية
❌ تغيير deploy workflow
❌ تغيير build pipeline
❌ أي تعديل كبير خارج نطاق المطلوب
```

---

## 5. إذا وُجدت مشكلة

**لا تُصلح مباشرة.** أعطِ أولاً:
1. السبب الجذري
2. الملفات المتأثرة
3. مستوى الخطورة (Low / Medium / High)
4. خطة الإصلاح المقترحة

ثم انتظر الموافقة.

---

## 6. تقرير ما بعد كل تعديل

```
الملفات المعدلة:    js/src/XX.js
نتيجة build:        ✅ / ❌
نتيجة pre_check:    36/36 ✅ / X فشل
نتيجة post_check:   24/24 ✅ / X فشل
Drift:              0 سطر ✅ / X سطر ❌
Production:         متأثر / غير متأثر
```

---

## 7. هيكل js/src (الترتيب مهم في build)

```
01-infrastructure.js  (1841) — API, auth, shell, navigate, confirmDlg
02-dashboard.js        (601)  — Dashboard
02-monthly-fees.js     (921)  — المدفوعات الشهرية + WhatsApp
03-clients.js          (634)  — العملاء
03-tail.js            (1246)  — لغة + daily revenues
04-invoices.js         (320)  — الفواتير
05-tasks.js            (816)  — المهام
06-documents.js        (600)  — المستندات
07-vat.js             (2429)  — VAT / ضريبة القيمة المضافة
08-crm.js             (1379)  — CRM / Leads
09-formation.js        (565)  — تأسيس الشركات
10-obligations.js      (985)  — الالتزامات الضريبية + deleteObligation
11-rest.js           (10486)  — باقي الصفحات
```

---

## 8. أخطاء محفوظة (لا تكررها)

| # | الخطأ | الصواب |
|---|-------|--------|
| 1 | `showConfirm()` | `confirmDlg()` — دالة Legacy الصحيحة |
| 2 | `token` في localStorage | `ms_token` |
| 3 | تعديل `index.html` مباشرة | عدّل `js/src/` ثم `deploy.sh` |
| 4 | `i.id` في upcoming obligations | `i.obligation_id` للحذف |
| 5 | تعديل React src ظناً أنه Production | Production = Legacy فقط |
| 6 | push بدون `--compressed` في curl | GitHub Pages يُرسل gzip |

---

## 9. Minimal Change Principle

أي تعديل يجب أن يكون **أصغر تغيير ممكن** يحقق الهدف.
لا cleanup إضافي، لا refactor جانبي، لا تحسينات غير مطلوبة.
