# Migration Checklist — Per Module
**القاعدة:** Module غير مكتمل حتى تكون كل ✅ في هذا الملف

---

## كيفية الاستخدام
1. قبل بدء migration أي module → انسخ الـ template أدناه
2. بعد كل خطوة → علّم ✅
3. لا تنتقل للـ module التالي حتى تكتمل كل الخطوات
4. بعد 3 أيام بدون bug reports → احذف من index.html

---

## Template (انسخ لكل module جديد)

```markdown
## Module: [اسم الـ Module]
**تاريخ البدء:** ___  
**تاريخ الاكتمال المتوقع:** ___

### الـ API Endpoints المطلوبة
- [ ] `GET  /api/...` — وصف
- [ ] `POST /api/...` — وصف

### Core Functionality
- [ ] البيانات تُحمَّل من الـ API بشكل صحيح
- [ ] Loading state يظهر أثناء التحميل
- [ ] Error state يظهر عند فشل الـ API

### Permissions (RBAC)
- [ ] Admin يرى كل الأزرار والـ actions
- [ ] Manager يرى ما هو مسموح له
- [ ] Employee لا يرى الأزرار المحظورة عليه
- [ ] API يرفض الطلبات غير المصرح بها (403)

### Search & Filters
- [ ] Search بالنص يعمل
- [ ] كل الـ filters المتاحة تعمل
- [ ] Clear filters يعود للحالة الأصلية
- [ ] Pagination (إن وجدت)

### Real-time (WebSocket)
- [ ] تغيير من مستخدم آخر يظهر بدون refresh
- [ ] الـ WebSocket يعيد الاتصال عند الانقطاع
- [ ] لا يوجد duplicate entries عند reconnect

### File Upload (إن وُجد)
- [ ] رفع ملف يعمل
- [ ] تحميل ملف يعمل
- [ ] حذف ملف يعمل
- [ ] حجم الملف الأقصى محترم
- [ ] أنواع الملفات المسموحة محترمة

### Mobile
- [ ] الـ layout يعمل على شاشة 375px
- [ ] لا يوجد overflow أو truncation غير مقصود
- [ ] الـ touch targets كبيرة كافية (44px minimum)

### RTL / Arabic
- [ ] النص العربي يتجه يميناً
- [ ] الـ icons في الاتجاه الصحيح
- [ ] الأرقام بالعربية أو اللاتينية حسب التصميم

### Performance
- [ ] أول تحميل أقل من 2 ثانية
- [ ] لا يوجد unnecessary re-renders
- [ ] الـ cache يعمل (لا يعيد الـ fetch إذا البيانات حديثة)

### Cross-browser
- [ ] Chrome ✓
- [ ] Safari (iPhone) ✓

### Zero-downtime Verification
- [ ] نفس الـ API endpoints يستخدمها الـ vanilla والـ React
- [ ] لا تعديل في الـ backend schema
- [ ] الـ vanilla version لا تزال تعمل بشكل طبيعي

### Sign-off
- [ ] اختُبر على production (ليس localhost فقط)
- [ ] مستخدم واحد حقيقي جرّبه وأعطى موافقته
- [ ] 3 أيام بدون bug reports
- [ ] **جاهز للحذف من index.html**
```

---

## Module: Login
**الملف:** `Login.tsx`  
**اكتمال حالي:** 80%

### الـ API Endpoints المطلوبة
- [ ] `POST /api/auth/login` — يرجع JWT token
- [ ] `GET  /api/auth/me` — معلومات المستخدم الحالي

### Core Functionality
- [ ] Form بـ email + password
- [ ] Token يُحفظ في `localStorage` بمفتاح `token`
- [ ] User info يُحفظ في `localStorage` بمفتاح `user`
- [ ] Redirect للـ dashboard بعد login
- [ ] رسالة خطأ واضحة عند فشل الـ login
- [ ] Loading state أثناء الطلب

### Permissions
- [ ] لا يوجد nav أو sidebar في صفحة الـ login
- [ ] إذا المستخدم logged in وفتح `/login` → redirect للـ dashboard

### Mobile
- [ ] الـ form يظهر بشكل صحيح على 375px
- [ ] Keyboard لا يغطي الـ submit button

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## Module: Dashboard
**الملف:** `Dashboard.tsx`  
**اكتمال حالي:** 40%

### الـ API Endpoints المطلوبة
- [ ] `GET /api/dashboard/stats`
- [ ] `GET /api/dashboard/deadlines`
- [ ] `GET /api/finance/summary`
- [ ] `WebSocket /ws` — real-time updates

### Core Functionality
- [ ] Stats cards (clients, tasks, invoices, collections)
- [ ] Finance summary (weekly/monthly/yearly)
- [ ] Deadlines list مرتبة بالتاريخ
- [ ] Charts (إن وُجدت)

### Real-time
- [ ] Stats تتحدث عند broadcast من الـ server
- [ ] لا يوجد flash عند التحديث

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## Module: Clients
**الملف:** `Clients.tsx`  
**اكتمال حالي:** 35%

### الـ API Endpoints المطلوبة
- [ ] `GET    /api/clients`
- [ ] `GET    /api/clients/{id}`
- [ ] `POST   /api/clients`
- [ ] `PUT    /api/clients/{id}`
- [ ] `DELETE /api/clients/{id}`
- [ ] `POST   /api/clients/{id}/files`
- [ ] `GET    /api/clients/{id}/files`
- [ ] `DELETE /api/clients/{id}/files/{file_id}`

### Core Functionality
- [ ] قائمة العملاء مع pagination
- [ ] Detail view لكل عميل
- [ ] إضافة عميل (form كامل)
- [ ] تعديل عميل
- [ ] حذف عميل مع confirmation

### Permissions
- [ ] Admin: كل الـ actions
- [ ] Manager: كل الـ actions ما عدا الحذف
- [ ] Employee: قراءة فقط

### Search & Filters
- [ ] Search بالاسم
- [ ] Search برقم الهاتف
- [ ] Filter بالحالة (نشط/متوقف)
- [ ] Filter بالفترة الزمنية

### File Upload
- [ ] رفع مستندات للعميل
- [ ] تحميل مستند
- [ ] حذف مستند (admin)
- [ ] أنواع مسموحة: PDF, JPEG, PNG

### Real-time
- [ ] عميل جديد يظهر فوراً لكل المستخدمين

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## Module: Leads
**الملف:** `Leads.tsx`  
**اكتمال حالي:** 30%

### الـ API Endpoints المطلوبة
- [ ] `GET    /api/leads`
- [ ] `POST   /api/leads`
- [ ] `PUT    /api/leads/{id}`
- [ ] `DELETE /api/leads/{id}`
- [ ] `POST   /api/leads/{id}/convert` — تحويل لعميل

### Core Functionality
- [ ] قائمة الـ leads
- [ ] Pipeline view (stages)
- [ ] إضافة/تعديل lead
- [ ] تحويل lead → client

### Real-time
- [ ] lead جديد يظهر لكل المستخدمين

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## Module: Tasks
**الملف:** `Tasks.tsx`  
**اكتمال حالي:** 25%

### الـ API Endpoints المطلوبة
- [ ] `GET    /api/tasks`
- [ ] `POST   /api/tasks`
- [ ] `PUT    /api/tasks/{id}`
- [ ] `PATCH  /api/tasks/{id}/status`
- [ ] `DELETE /api/tasks/{id}`

### Core Functionality
- [ ] Kanban board بالمراحل
- [ ] Daily view
- [ ] إضافة task مع تعيين لموظف
- [ ] تغيير status بالـ drag-and-drop أو buttons

### Permissions
- [ ] Admin: يرى كل tasks
- [ ] Employee: يرى tasks المعيّنة له فقط

### Filters
- [ ] Filter بالموظف
- [ ] Filter بالتاريخ (اليوم/الأسبوع/الشهر)
- [ ] Filter بالـ status

### Real-time
- [ ] تحديث task يظهر فوراً

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## Module: Collections (الإيرادات اليومية)
**اكتمال حالي:** 0% — بناء من الصفر

### الـ API Endpoints المطلوبة
- [ ] `GET  /api/finance/collections`
- [ ] `POST /api/finance/collections`
- [ ] `PUT  /api/finance/collections/{id}`

### Core Functionality
- [ ] سجل الإيرادات اليومية
- [ ] إضافة إيراد مع: العميل، المبلغ، النوع، الملاحظة
- [ ] المجموع اليومي/الأسبوعي/الشهري
- [ ] Export

### Permissions
- [ ] Admin + Manager: إضافة + تعديل + حذف
- [ ] Employee: إضافة فقط

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## Module: Monthly Fees (المدفوعات الشهرية)
**اكتمال حالي:** 0% — بناء من الصفر

### الـ API Endpoints المطلوبة
- [ ] `GET  /api/finance/fees-grid`
- [ ] `POST /api/finance/fees`
- [ ] `PUT  /api/finance/fees/{id}`

### Core Functionality
- [ ] Grid المدفوعات (clients × months)
- [ ] تسجيل دفعة
- [ ] حالة كل عميل (مدفوع/غير مدفوع/متأخر)
- [ ] إجمالي المدفوعات الشهرية

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## Module: Finance Center
**الملف:** `Finance (new).tsx`  
**اكتمال حالي:** 0% — بناء من الصفر

### الـ API Endpoints المطلوبة
- [ ] `GET /api/finance/summary`
- [ ] `GET /api/finance/top-clients`
- [ ] `GET /api/finance/breakdown`

### Core Functionality
- [ ] ملخص مالي (أسبوعي/شهري/سنوي)
- [ ] Top clients بالإيرادات
- [ ] Breakdown بالنوع
- [ ] Charts

### Sign-off
- [ ] مختبر على production
- [ ] 3 أيام بدون bug reports
- [ ] جاهز للحذف من index.html

---

## الـ Modules المتبقية (templates جاهزة)

للـ modules الآتية، استخدم الـ template أعلاه عند البدء:

| Module | الأولوية | الأسبوع المتوقع |
|--------|---------|----------------|
| Tax | متوسطة | 6-7 |
| Invoices | متوسطة | 6 |
| Obligations | عالية | 4 |
| Establishment | متوسطة | 4 |
| Documents | متوسطة | 8-9 |
| Archive | منخفضة | 9 |
| Employees | متوسطة | 7 |
| Payroll | متوسطة | 8 |
| Settlements | متوسطة | 8 |
| Permissions (RBAC) | عالية | 9-10 |
| Client Portal | متوسطة | 10 |
| Settings | متوسطة | 10 |
| Mail | منخفضة | 11 |
| Backup | منخفضة | 11 |
| System Logs | منخفضة | 11 |
| Fixed Assets | منخفضة | 11 |
| Statements | منخفضة | 11 |
| Quotations | منخفضة | 11 |
| Accounting | عالي جداً | بعد MVP |

---

## مؤشر التقدم الإجمالي

```
المرحلة 0 — Setup:           [ ] [ ] [ ] [ ] [ ] [ ] [ ]  0/7
المرحلة 1 — Login + Shell:   [ ] [ ] [ ]                  0/3
المرحلة 2 — Dashboard:       [ ]                           0/1
المرحلة 3 — Clients:         [ ]                           0/1
المرحلة 4 — Leads:           [ ]                           0/1
المرحلة 5 — Tasks:           [ ]                           0/1
المرحلة 6 — Obligations:     [ ] [ ]                       0/2
المرحلة 7 — Collections+Fees:[ ] [ ]                       0/2
المرحلة 8 — Finance Center:  [ ]                           0/1
...
الإجمالي:                                                  0/27
```

آخر تحديث: 2026-06-14
