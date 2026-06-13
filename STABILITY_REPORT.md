# System Stability Report — MS Accounting
**تاريخ التقرير:** 2026-06-14  
**الإصدار الحالي:** v2.7 (Vanilla JS) + Backend v2.3.0

---

## ملخص تنفيذي

| المعيار | الحالة | التفاصيل |
|---------|--------|----------|
| الـ Backend | 🟡 جزئي | يعمل — `/api/finance/summary` لا يزال 500 (deploy جاري) |
| الـ Frontend | ✅ يعمل | deployed على gh-pages |
| قاعدة البيانات | ✅ متصلة | PostgreSQL على Railway |
| الـ WebSocket | ✅ يعمل | Real-time sync فعّال |
| الـ Cache | ✅ محسّن | sessionStorage + SW v4 |
| الـ Service Worker | ✅ مُصلح | path صحيح الآن |
| الـ Deployment | 🟡 جزئي | GitHub Actions جاهز — يحتاج PAT |
| الـ Error Logging | ✅ جديد | Frontend + Admin screen |
| الـ Backup System | ✅ جديد | Daily/Weekly/Monthly + Admin UI |

---

## 1. Frontend Status

**الملف:** `frontend/index.html`  
**الحجم:** 20,469 سطر  
**الـ Functions:** 1,134 function / window assignment  
**الـ Nav Items:** 27 صفحة

### ما يعمل ✅
- Login + Auth (JWT في localStorage)
- Dashboard مع real-time updates
- Clients + Leads + Tasks + Obligations
- Collections + Monthly Fees
- Finance Center (summary يحتاج backend deploy)
- Documents + Archive
- Settlements + Payroll
- Permissions + Portal
- Error Logging (جديد)
- Backup Management UI (جديد)
- Force Refresh ⚡ (جديد)
- WebSocket real-time sync
- Connection monitor + stale banner
- Service Worker v4 (مُصلح)

### مشاكل مفتوحة 🟡
- `index.html` بـ 20,469 سطر — مخاطر regression عالية عند التعديل
- لا يوجد automated testing للـ frontend
- الـ Desktop App تعتمد على `frontend/index.html` مباشرة

---

## 2. Backend Status

**الـ Server:** Railway (FastAPI + Uvicorn)  
**الـ URL:** `https://ms-accounting-api-production.up.railway.app`  
**الإصدار:** v2.3.0-portal  
**الـ Routers:** 44 router | 497+ endpoint

### Endpoint Health Check
| Endpoint | الحالة |
|---------|--------|
| `GET /health` | ✅ 200 |
| `GET /api/dashboard/stats` | ✅ 200 |
| `GET /api/clients` | ✅ 200 |
| `GET /api/tasks` | ✅ 200 |
| `GET /api/finance/collections` | ✅ 200 |
| `GET /api/finance/fees-grid` | ✅ 200 |
| `GET /api/finance/summary` | 🔴 500 (deploy جاري للإصلاح) |
| `GET /api/obligations` | ✅ 200 |

### مشاكل مفتوحة 🟡
- `/api/finance/summary`: الإصلاح في الـ deploy الحالي (User.full_name → User.name)
- `pg_dump` لم يكن متاحاً في الـ Docker image (مُصلح في deploy الحالي)
- Railway filesystem ephemeral — uploads قد تُفقد عند deploy

---

## 3. Database Status

**النوع:** PostgreSQL (Railway Managed)  
**الاتصال:** ✅ متصل  
**الـ Models:** 29+ model

| الجدول | الحالة |
|--------|--------|
| clients | ✅ |
| tasks | ✅ |
| invoices | ✅ |
| finance_collections | ✅ |
| backup_records | ✅ جديد (migration تلقائي) |
| employee_settlements | ✅ |

**الـ Migrations:** تعمل تلقائياً عند startup (`_run_migrations_pg`)

---

## 4. WebSocket Status

**الـ Endpoint:** `wss://ms-accounting-api-production.up.railway.app/ws`  
**الحالة:** ✅ يعمل  
**Keep-alive:** ping كل 25 ثانية من الـ frontend  
**الـ Entities المدعومة:** clients, tasks, invoices, leads, obligations, collections, payroll, settlements, mail, documents, appointments, accounting

**كيف يعمل:**
1. أي POST/PUT/DELETE → backend يـ broadcast لكل الـ clients
2. Frontend يستقبل الـ event ويحدث الصفحة silently
3. نقطة خضراء تظهر عند كل sync

---

## 5. Cache Status

**الـ API Cache (`_AC`):**
- TTL: 60 ثانية للـ fresh data
- 10× TTL للـ stale data (fallback عند offline)
- Invalidation تلقائية عند كل write (POST/PUT/PATCH/DELETE)
- ✅ يعمل بشكل صحيح

**الـ Service Worker:**
- الإصدار: v4
- الـ path: `/ms-accounting/sw.js` ✅ (كان 404 — مُصلح)
- `config.js` مستثنى من الكاش (network-first) ✅
- HTML: network-first ✅
- Assets: cache-first ✅

**`config.js`:**
- يعمل `window.MS_API = 'https://...'` ✅ (كان `MS_API_BASE` — مُصلح)

---

## 6. Deployment Status

| المسار | الطريقة | الحالة |
|-------|---------|--------|
| Frontend → gh-pages | يدوي حالياً | 🟡 يحتاج PAT |
| Backend → Railway | `railway up --detach` | 🟡 يدوي |
| GitHub Actions Frontend | جاهز | 🟡 يحتاج PAT |
| GitHub Actions Backend | جاهز | 🟡 يحتاج PAT + RAILWAY_TOKEN |

**خطوة مطلوبة من المستخدم:**
```
1. GitHub → Settings → Developer settings → Personal access tokens
2. New token → scopes: repo + workflow
3. في Terminal: gh auth refresh -s workflow
4. ثم git push origin main → يرفع ملفات .github/workflows/
5. Repository → Settings → Secrets → RAILWAY_TOKEN (من Railway Dashboard → Account → Tokens)
```

---

## 7. Error Logging Status

**الحالة:** ✅ مُنفَّذ حديثاً  
**التخزين:** localStorage (آخر 500 خطأ)  
**الـ Types المسجّلة:** JS errors, API 4xx/5xx, Network errors, Promise rejections  
**الشاشة:** "🔍 سجل الأخطاء" في الـ sidebar (admin only)  
**الـ Auto-refresh:** عند فتح الشاشة + بعد كل خطأ جديد بـ 300ms

---

## 8. Backup Status

**الحالة:** ✅ مُنفَّذ حديثاً  
**الـ Schedule:**
- يومية: منتصف الليل كل يوم
- أسبوعية: الأحد 2 صباحاً
- شهرية: أول كل شهر 1 صباحاً

**الـ Retention:**
- 7 يومية · 4 أسبوعية · 12 شهرية · 20 يدوية

**ما يُنسخ:** قاعدة البيانات (pg_dump) + ملفات الـ uploads  
**التوصيل:** بريد إلكتروني + تحميل مباشر  
**الـ Metadata:** محفوظة في PostgreSQL (دائمة)  
**الشاشة:** "🗄️ النسخ الاحتياطية" في الـ sidebar

---

## المخاطر الحالية

| المخاطرة | الأثر | الإجراء المطلوب |
|---------|-------|----------------|
| Railway filesystem ephemeral | فقدان uploads عند deploy | إضافة Railway Volume أو S3 |
| `index.html` 20,469 سطر | regression عند أي تعديل | → React Migration (مرحلة 3) |
| GitHub Actions بدون PAT | deployment يدوي فقط | خطوة واحدة من المستخدم |
| لا يوجد automated tests | أخطاء قد تمر دون اكتشاف | Regression checklist + testing |
| Desktop App تعتمد على raw HTML | قد تتأثر بـ React Migration | تحديث Electron في مرحلة 3 |

---

## التوصيات المرتبة بالأولوية

1. **فوري**: إضافة Railway Volume لحماية الملفات
2. **هذا الأسبوع**: إعداد GitHub Actions (PAT + RAILWAY_TOKEN)
3. **هذا الشهر**: React Migration — Dashboard أولاً
4. **مستمر**: تشغيل Regression Checklist قبل كل deploy
