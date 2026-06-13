# Feature Freeze — MS Accounting
**تاريخ البدء:** 2026-06-14  
**الهدف:** استقرار النظام + React Migration

---

## ما هو مجمَّد (Feature Freeze)

من هذا التاريخ وحتى اكتمال React Migration:

### ❌ ممنوع تماماً
- إضافة أي صفحة أو module جديد للـ `index.html`
- إضافة أي API endpoint جديد لا يتعلق بالـ Migration
- تغيير الـ UI/UX للصفحات القائمة
- إضافة integrations جديدة (WhatsApp, Drive, ETA...)
- أي تغيير في Schema الـ database يُعقّد الـ Migration

### ✅ مسموح (Stability Only)
- إصلاح Bug حرج يمنع عمل النظام
- تحسين Performance دون تغيير الـ API
- تحديث Security (dependencies, tokens)
- إعداد بنية الـ React Migration (CI/CD, testing)
- نقل modules موجودة إلى React (المرحلة 3)

### 📋 قرار الاستثناء
إذا ظهرت حاجة ملحّة لـ Feature جديدة:
1. تُضاف لقائمة انتظار `FEATURE_BACKLOG.md`
2. تُنفَّذ بعد اكتمال Migration الـ Module المرتبط بها

---

## سبب الـ Feature Freeze

- `index.html` وصل 20,469 سطر — كل إضافة تزيد خطر الـ regression
- الـ React Migration تحتاج استقراراً كاملاً في الـ API
- أي تغيير في الـ vanilla JS خلال الـ Migration يُعقّد نقل الكود

---

## مدة الـ Feature Freeze المتوقعة

**8-12 أسبوع** (مدة React Migration)

بعدها: نفتح الباب لـ Features جديدة على الـ React architecture.
