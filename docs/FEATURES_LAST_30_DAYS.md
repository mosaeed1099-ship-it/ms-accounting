# Features Added — Last 30 Days
> الفترة: 2026-05-22 → 2026-06-22
> آخر تحديث: 2026-06-22
> المصدر: git log + functional audit

---

## ملخص

| الحالة | العدد |
|---|---|
| ✅ موجودة وتعمل | 35 |
| ⚠️ موجودة — لم تُختبر بعد (لا بيانات) | 2 |
| ❌ مفقودة | 0 |

---

## 2026-06-22

| الميزة | الـ Commit | الحالة |
|---|---|---|
| استعادة زر حذف ملف التأسيس في الـ UI | `20749735` | ✅ يعمل — تأكيد API |

---

## 2026-06-21

| الميزة | الـ Commit | الحالة |
|---|---|---|
| ترقيم تسلسلي للعملاء (idx+1 بدل الكود) | `8c1449d8` | ✅ يعمل |
| إصلاح white screen — mfPayModal مكررة | `ad6261ec` | ✅ محلول — syntax سليم |
| Unified merge: Safety Layer + WhatsApp MF + VAT Dashboard | `f41c0058` | ✅ 36/36 checks ✓ |
| إصلاح contains_eager — إخفاء العملاء المؤرشفين | `fa6f37f2` | ✅ تأكيد API: 43 record بدون مؤرشفين |

---

## 2026-06-20

| الميزة | الـ Commit | الحالة |
|---|---|---|
| income_annual دائماً ظاهر بغض النظر عن days_ahead | `fc80108b` | ✅ يعمل |
| رفع حد instances page_size لـ 1000 | `c08d9928` | ✅ يعمل |
| عدد العملاء الفريدين لكل مجموعة التزامات | `239182d3` | ✅ يعمل |
| income_annual يستحق 31 مارس / يظهر شهر مبكر | `892da9df` | ✅ يعمل |
| POST /obligations/reset-to-current-month | `4542e93e` | ✅ يعمل |
| مزامنة الالتزامات عند حفظ تعديل العميل | `fca51ad5` | ✅ يعمل |

---

## 2026-06-19

| الميزة | الـ Commit | الحالة |
|---|---|---|
| ETA Excel Import — بوابة الفواتير الإلكترونية | `36412d04` | ✅ يعمل (endpoint + UI) |
| Health Check Page 🩺 | `d76565a3` | ✅ يعمل — adminOnly في القائمة |
| Backup System — إنشاء / تنزيل / استعادة | `d76565a3` | ✅ endpoint + UI |
| WHT Tab — أسس توحيد المرتبات | `99bde0e4` | ✅ يعمل |
| VAT back-to-draft عند force_rebuild | `fd09416f` | ✅ يعمل |

---

## 2026-06-18

| الميزة | الـ Commit | الحالة |
|---|---|---|
| حذف ملف تأسيس (deleteFormationCase) | `65ae0162` | ✅ يعمل — soft delete |
| phone column في mf_clients | `b26fbf74` | ✅ 33 عميل بهاتف |
| نسخ اسم الشركة 📋 | `fabb03bd` | ✅ يعمل |
| نسخ رقم الهاتف 📋 | `fabb03bd` | ✅ يعمل |

---

## 2026-06-17

| الميزة | الـ Commit | الحالة |
|---|---|---|
| Safety Layer (_SL): Undo / Rollback / confirmDestructive | `v3.7` | ✅ يعمل |
| WhatsApp Reminder System في المدفوعات الشهرية | `v3.6` | ✅ يعمل — mfOpenWA + mfSendWA |
| Obligations Companies Tab + deactivate removed | `v3.5` | ✅ يعمل |
| إصلاح WhatsApp الدولي (+XX) | `v3.4` | ✅ يعمل |

---

## 2026-06-16

| الميزة | الـ Commit | الحالة |
|---|---|---|
| مولّد أسماء الشركات + Approval Predictor | `v3.0` | ✅ يعمل |
| حذف عميل MF + دفعة مقدمة + الشهر الافتراضي | `Monthly fees` | ✅ يعمل |

---

## 2026-06-15

| الميزة | الـ Commit | الحالة |
|---|---|---|
| Daily Revenues لجميع المستخدمين | `v2.x` | ✅ يعمل |
| Service Worker — cache control + force reload | `v2.x` | ✅ يعمل |

---

## 2026-05-25

| الميزة | الـ Commit | الحالة |
|---|---|---|
| Smart Automation Engine — Rules + Notifications + Health Score | `feat` | ✅ يعمل |
| Global Search (Ctrl+K) | `feat` | ✅ يعمل |
| Smart Client Timeline | `feat` | ✅ يعمل |
| Smart Quotation System — عروض أسعار | `feat` | ✅ يعمل |
| Email Composer — SendGrid / Brevo | `feat` | ⚠️ لم يُختبر (يحتاج email credentials) |
| تنزيل المستندات + quick-upload per client | `feat` | ✅ يعمل |

---

## 2026-05-24

| الميزة | الـ Commit | الحالة |
|---|---|---|
| Google Drive Integration — scan + import | `feat` | ⚠️ لم يُختبر (يحتاج GDrive credentials) |
| Client Portal | `feat` | ✅ يعمل |
| Collections System | `feat` | ✅ يعمل |
| Per-client Accounting Module (ERP-level) | `feat` | ✅ يعمل |
| Tasks Kanban | `feat` | ✅ يعمل |

---

## Notes

**⚠️ features لم تُختبر بسبب عدم توفر credentials أو بيانات:**
1. **Email (SendGrid/Brevo)** — يحتاج إرسال email حقيقي للتحقق
2. **Google Drive Integration** — يحتاج GDrive OAuth credentials

كلتاهما موجودة في الكود والـ backend — لم يُبلَّغ عن أي bug فيهما.
