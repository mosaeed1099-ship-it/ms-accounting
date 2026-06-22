# MS Accounting — قواعد التطوير الإلزامية

## مصدر التعديل الوحيد

```
✅ js/src/*.js        ← هنا فقط تحدث التعديلات
❌ frontend/index.html ← ممنوع التعديل المباشر
```

## شرط النشر الإجباري (بالترتيب)

```bash
bash scripts/build.sh             # 1. بناء index.html من js/src
bash .claude/pre_deploy_check.sh  # 2. التحقق من الجودة (36 check)
git add frontend/index.html js/src/
git commit -m "وصف التغيير"
git push origin main
```

أو باختصار:
```bash
bash scripts/deploy.sh "وصف التغيير"
```

**إذا فشلت أي خطوة → ممنوع النشر.**

## قواعد ثابتة

| القاعدة | التفاصيل |
|---------|---------|
| لا تعديل مباشر على `index.html` | استخدم `js/src/` دائماً |
| لا deploy بدون build | `build.sh` أولاً دائماً |
| لا deploy بدون pre_deploy_check | 36 check يجب أن تكون ✅ |
| Drift = 0 | `js/src` و `index.html` دائماً متزامنان |
| Stability First | ممنوع Refactor أو Architecture changes بدون قرار صريح |

## هيكل المشروع

```
js/src/           ← مصدر الكود (13 module)
  01-infrastructure.js
  02-dashboard.js
  02-monthly-fees.js
  03-clients.js
  03-tail.js
  04-invoices.js
  05-tasks.js
  06-documents.js
  07-vat.js
  08-crm.js
  09-formation.js
  10-obligations.js
  11-rest.js

frontend/
  index.html      ← مُنتَج من build.sh (لا تعدّله مباشرة)
  index.template.html ← قالب البناء
  portal.html     ← portal العملاء
  config.js       ← API URL config
  sw.js           ← Service Worker
  assets/         ← ملفات static

scripts/
  build.sh        ← يجمع js/src → index.html
  deploy.sh       ← build + check + push (الأمر الوحيد للنشر)

.claude/
  pre_deploy_check.sh   ← 36 فحص قبل النشر
  post_deploy_check.sh  ← 24 فحص بعد النشر
```

## Source of Truth

| الطبقة | الملف |
|--------|-------|
| Production | `https://mosaeed1099-ship-it.github.io/ms-accounting/` |
| Backend | `https://ms-accounting-api-production.up.railway.app` |
| Source | `js/src/*.js` |
| Built | `frontend/index.html` (مُنتَج — لا تعدّله) |

## ممنوع حالياً

- Migration إلى React
- تقسيم Modules إضافية
- إعادة هيكلة Architecture
- تعديل `index.html` مباشرة

## Token Auth

- `ms_token` في localStorage (ليس `token`)
- Admin: `ms.owner@mshq.io` (للاختبار فقط — لا تضعه في الكود)
