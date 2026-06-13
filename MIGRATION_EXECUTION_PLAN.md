# Migration Execution Plan — Vanilla JS → React
**تاريخ البدء:** 2026-06-14  
**النظام:** MS Accounting  
**الاستراتيجية:** Zero-Downtime — التشغيل المتوازي حتى اكتمال كل module

---

## مبدأ Zero-Downtime

```
القاعدة الذهبية:
لا يُحذف من index.html أي شيء حتى يكون الـ React equivalent:
  ✅ مُختبَر بالكامل على production
  ✅ معتمَد من المستخدم
  ✅ مر 3 أيام بدون bug reports
```

**كيف يعمل:**
- الـ `index.html` يبقى كاملاً (الـ vanilla version) طوال المرحلة
- الـ React app تُبنى على نفس الـ backend API
- عند اكتمال كل module في React → يُختبر → ينتقل المستخدمون إليه
- فقط بعد 3 أيام استقرار → يُحذف من index.html

---

## المرحلة 0: إعداد البنية (أسبوع 1)
**الهدف:** بنية تحتية جاهزة قبل أول سطر migration

### المهام
| # | المهمة | الوقت | الحالة |
|---|--------|-------|--------|
| 0.1 | GitHub Actions PAT + RAILWAY_TOKEN | 30 دقيقة | ❌ |
| 0.2 | Vite config: `base: '/ms-accounting/'` | 1 ساعة | ❌ |
| 0.3 | GitHub Actions: Vite Build → gh-pages | 2 ساعة | ❌ |
| 0.4 | WebSocket Zustand store | 3 ساعة | ❌ |
| 0.5 | React Query setup + `useApi()` hook | 2 ساعة | ❌ |
| 0.6 | RTL + Arabic font (Noto Kufi) globally | 1 ساعة | ❌ |
| 0.7 | التحقق أن `npm run build` → gh-pages يعمل | 1 ساعة | ❌ |

**متطلب الخروج:** الـ React app تظهر على gh-pages (حتى لو فارغة)

---

## المرحلة 1: Auth + Shell (أسبوع 1-2)
**الأولوية:** عالية جداً — كل شيء يعتمد عليها

### الـ Modules
| Module | الملف | اكتمال حالي | الهدف |
|--------|-------|------------|-------|
| Login | `Login.tsx` | 80% | 100% |
| Sidebar/Nav | `Layout.tsx` | 70% | 100% |
| Toast notifications | `useToast.ts` | 90% | 100% |

### المخاطر
- RBAC يعتمد على `currentUser.role === 'admin'` — يجب نقله بنفس المنطق
- Token storage في localStorage — يجب الحفاظ على نفس المفتاح (`token`)

### الاختبارات المطلوبة
- [ ] Login بـ credentials صحيحة → redirect للـ dashboard
- [ ] Login بـ credentials خاطئة → رسالة خطأ
- [ ] Refresh الصفحة → المستخدم يبقى logged in
- [ ] Logout → redirect للـ login
- [ ] Admin يرى كل الـ nav items
- [ ] Employee لا يرى items الـ admin only
- [ ] Mobile: sidebar يفتح/يغلق

---

## المرحلة 2: Dashboard (أسبوع 2)
**الأولوية:** عالية — أول ما يراه المستخدم

### الـ API Endpoints
```
GET /api/dashboard/stats
GET /api/dashboard/deadlines  
GET /api/finance/summary
WebSocket: ws://.../ (real-time updates)
```

### الاختبارات المطلوبة
- [ ] Stats cards تظهر بأرقام صحيحة
- [ ] WebSocket يحدّث الأرقام تلقائياً عند تغيير البيانات
- [ ] Deadlines list تظهر بترتيب صحيح
- [ ] Finance summary (weekly/monthly/yearly)
- [ ] Mobile: كل الـ cards تظهر بشكل صحيح

---

## المرحلة 3: Clients (أسبوع 2-3)
**الأولوية:** عالية — أكثر module يُستخدم

### الـ API Endpoints
```
GET    /api/clients         (list + search + filter)
GET    /api/clients/{id}    (detail)
POST   /api/clients         (create)
PUT    /api/clients/{id}    (update)
DELETE /api/clients/{id}    (delete)
POST   /api/clients/{id}/files   (upload)
```

### الاختبارات المطلوبة
- [ ] قائمة العملاء تُحمَّل
- [ ] Search بالاسم/الرقم يعمل
- [ ] Filter بالحالة (نشط/متوقف) يعمل
- [ ] إضافة عميل جديد
- [ ] تعديل عميل موجود
- [ ] حذف عميل (admin only)
- [ ] رفع ملف للعميل + تحميله
- [ ] WebSocket: عميل جديد يظهر تلقائياً عند المستخدمين الآخرين
- [ ] Permissions: employee لا يرى زر الحذف

---

## المرحلة 4: Leads (أسبوع 3)
**الأولوية:** عالية

### الاختبارات المطلوبة
- [ ] قائمة الـ leads
- [ ] Pipeline view (stages)
- [ ] إضافة/تعديل lead
- [ ] تحويل lead → client
- [ ] WebSocket real-time

---

## المرحلة 5: Tasks (أسبوع 3-4)
**الأولوية:** عالية — يُستخدم يومياً

### الاختبارات المطلوبة
- [ ] Kanban board (بالمراحل)
- [ ] Daily view
- [ ] إضافة/تعديل task
- [ ] تعيين task لموظف
- [ ] Filter بالموظف/التاريخ
- [ ] WebSocket real-time

---

## المرحلة 6: Obligations + Establishment (أسبوع 4)
**الأولوية:** متوسطة-عالية

### الاختبارات المطلوبة
- [ ] Formation obligations list
- [ ] Establishment pipeline
- [ ] الـ deadlines تظهر في الـ dashboard

---

## المرحلة 7: Collections + Monthly Fees (أسبوع 5)
**الأولوية:** عالية — مالي مباشر

### الـ API Endpoints
```
GET  /api/finance/collections
POST /api/finance/collections
GET  /api/finance/fees-grid
POST /api/finance/fees
```

### الاختبارات المطلوبة
- [ ] سجل الإيرادات اليومية
- [ ] إضافة إيراد جديد
- [ ] Grid المدفوعات الشهرية
- [ ] تسجيل دفعة
- [ ] Finance summary محدَّث
- [ ] Permissions: موظف يسجّل — مدير يعتمد

---

## المرحلة 8: Finance Center (أسبوع 5-6)
**الأولوية:** عالية — ملخص مالي كامل

### الاختبارات المطلوبة
- [ ] Summary (أسبوعي/شهري/سنوي)
- [ ] Top clients بالإيرادات
- [ ] Charts تظهر بشكل صحيح
- [ ] Export تقرير

---

## المرحلة 9: Tax + Invoices (أسبوع 6-7)
**الأولوية:** متوسطة

### الاختبارات المطلوبة
- [ ] Tax center (quarterly/annual)
- [ ] Invoice list + create
- [ ] PDF generation
- [ ] Email invoice للعميل

---

## المرحلة 10: Employees + Payroll + Settlements (أسبوع 7-8)
**الأولوية:** متوسطة

### الاختبارات المطلوبة
- [ ] قائمة الموظفين
- [ ] Payroll calculation
- [ ] Settlements
- [ ] Permissions: admin only

---

## المرحلة 11: Documents + Archive (أسبوع 8-9)
**الأولوية:** متوسطة

### الاختبارات المطلوبة
- [ ] رفع مستندات
- [ ] تحميل مستندات
- [ ] Google Drive integration (إن وجد)
- [ ] Archive owner dashboard

---

## المرحلة 12: Permissions + Portal + Settings (أسبوع 9-10)
**الأولوية:** عالية

### الاختبارات المطلوبة
- [ ] RBAC: admin/manager/employee
- [ ] Client portal (تجربة العميل)
- [ ] Settings: company info, email config
- [ ] Quotations

---

## المرحلة 13: System Modules (أسبوع 10-11)
**الأولوية:** منخفضة

- Backup Management UI
- System Logs viewer
- Mail/Email center
- Fixed Assets
- Statements

---

## المرحلة 14: Final Testing + Cutover (أسبوع 11-12)
**الهدف:** الانتقال الكامل من index.html إلى React

### الخطوات
1. تشغيل [REGRESSION_TESTING.md](REGRESSION_TESTING.md) كاملاً على الـ React version
2. مراجعة مستخدم واحد لكل module
3. 3 أيام production trial
4. حذف index.html القديم
5. تحديث Desktop App للتحميل من الـ React build

---

## ملخص الجدول الزمني

| الأسبوع | المرحلة | الـ Modules |
|---------|---------|------------|
| 1 | 0 + 1 | Setup + Login + Shell |
| 2 | 1 + 2 | Login (100%) + Dashboard |
| 3 | 3 + 4 | Clients + Leads |
| 4 | 5 + 6 | Tasks + Obligations |
| 5 | 7 + 8 | Collections + Finance Center |
| 6 | 8 + 9 | Finance Center + Tax + Invoices |
| 7 | 9 + 10 | Invoices + Employees |
| 8 | 10 + 11 | Payroll + Settlements + Documents |
| 9 | 11 + 12 | Archive + Permissions + Portal |
| 10 | 12 + 13 | Settings + System modules |
| 11 | 13 | Backup + Mail + Assets |
| 12 | 14 | Final Testing + Cutover |

**التقدير الإجمالي:** 12 أسبوع  
**الخطر:** قد يمتد إلى 14-16 أسبوع إذا ظهرت مشاكل في الـ Accounting module

---

## المخاطر الرئيسية

| المخاطرة | الأثر | الحل |
|---------|-------|------|
| Desktop App تعتمد على index.html | كسر فوري عند حذفه | تحديث Electron في المرحلة 14 |
| الـ Accounting module معقد جداً | 3+ أسابيع وحده | تأجيل لما بعد MVP |
| Google Drive integration | مزود خارجي | نقله بعد كل الـ modules الأساسية |
| Mobile PWA | Service Worker جديد مطلوب | تجهيز في المرحلة 0 |
| RTL/Arabic rendering | قد يختلف عن vanilla | اختبار مبكر في المرحلة 0 |
