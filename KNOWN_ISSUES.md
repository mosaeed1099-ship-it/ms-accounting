# Known Issues Checklist — MS Accounting
> راجع هذه القائمة قبل كل Deployment أو Feature جديدة

---

## 🔴 أخطاء حرجة (تم إصلاحها — لا تتكرر)

| # | المشكلة | السبب الجذري | الإصلاح | التاريخ |
|---|---------|-------------|---------|---------|
| 1 | `config.js` يعمل `MS_API_BASE` والكود يدور على `MS_API` → كل API تروح لـ `api.github.io` | Rename variable بدون تحديث config.js | غيّر `MS_API_BASE` → `MS_API` في config.js | 2026-06-13 |
| 2 | Service Worker مسجّل على path غلط → SW مش شغال أبداً | `/ms-accounting/frontend/sw.js` (404) | صحّح إلى `/ms-accounting/sw.js` | 2026-06-13 |
| 3 | `/api/finance/summary` يرجع 500 دايماً | `User.full_name` غير موجود، الحقل اسمه `User.name` | غيّر كل `User.full_name` → `User.name` | 2026-06-13 |
| 4 | صفحة بيضاء بعد تعديل Collections | مرجع `renderCollections` بعد حذف الـ function | حذف الـ 3 lines من window assignments | 2026-06-12 |
| 5 | صفحة Collections تعرض UI الفواتير القديمة | Nav item كان `id:'invoices'` بدل `id:'collections'` | تصحيح الـ id | 2026-06-12 |
| 6 | Docker cache يخدم image قديمة على Railway | `ARG CACHEBUST` موجود لكن مش مستخدم في `RUN` | أضاف `RUN echo "cache-bust: $CACHEBUST"` | 2026-06-12 |
| 7 | مودال "إضافة مصروف" يظهر مرتين | `showAddExpenseModal` تُستدعى مرتين بدون إزالة المودال السابق | أضاف `document.getElementById('addExpModal')?.remove()` في البداية | 2026-06-11 |
| 8 | Duplicate script block يسبب SyntaxError → التطبيق كله يوقف | `const _MF_MONTHS` و`loadMonthlyFees` معرّفين مرتين | حذف الـ script block المكرر | 2026-06-11 |

---

## 🟡 أنماط خطر (قواعد لا تخرقها أبداً)

### Frontend
- **لا تعيّن اسم variable بدون تحديث كل المراجع** — خصوصاً `config.js` و `index.html` معاً
- **لا تضيف `<script>` block ثاني** — كل الكود في الـ block الموجود
- **أي `function` تحذفها**: ابحث عن كل `window.xxx = xxx` وكل استدعاء لها واحذفهم
- **لا تستخدم `API_BASE`** — المتغير الصح هو `API`
- **كل `onclick` يحتاج `window.xxx`** — الـ functions لازم تكون على window

### Backend
- **أي column جديد**: لازم يضاف في `_run_migrations_pg()` AND `_run_migrations_sqlite()`
- **لا تستخدم `User.full_name`** — الحقل اسمه `User.name`
- **لا تنسى import الـ router في `main.py`** وتضيفه بـ `include_router`
- **Railway deploy**: لازم من `/backend/` directory: `railway up --detach`

### Deployment
- **gh-pages لا يتحدث وحده** — لازم تنسخ `frontend/index.html` → `index.html` في gh-pages
- **config.js و sw.js لازم يتحدثوا معاً** مع index.html
- **بعد تغيير SW**: ابدأ بـ `hardRefresh()` من داخل التطبيق
- **لا تعمل push لـ `.github/workflows/`** بتوكن GitHub OAuth — استخدم PAT

---

## 🟠 مشاكل مفتوحة (تحت المراقبة)

| # | المشكلة | الأثر | الحالة |
|---|---------|-------|--------|
| 1 | GitHub Actions لا يُدفع بـ OAuth token | Deployment يدوي للـ workflows | مطلوب PAT من المستخدم |
| 2 | Railway GitHub auto-deploy غير موثوق | Backend deploy يدوي بـ `railway up` | يُعالج بـ GitHub Actions بعد PAT |
| 3 | Desktop App تجلب من `frontend/index.html` مباشرة | React Migration ستتطلب تحديث الـ Electron | مرحلة 3 |

---

## ✅ قائمة مراجعة قبل كل Deployment

```
[ ] هل تعديل Frontend يغيّر أي اسم variable أو function؟
    → ابحث عن كل استخدام في index.html وconfig.js
[ ] هل أضفت column جديد في Backend؟
    → أضفه في _run_migrations_pg() و_run_migrations_sqlite()
[ ] هل حذفت function في Frontend؟
    → احذف window.xxx = xxx وكل caller لها
[ ] هل عدّلت sw.js أو config.js؟
    → انشرهم مع index.html معاً
[ ] هل عدّلت router في Backend؟
    → تأكد من import + include_router في main.py
[ ] هل التعديل سيؤثر على Desktop App؟
    → اختبر على Electron بعد النشر
```
