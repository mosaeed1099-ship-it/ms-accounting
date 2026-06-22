# Feature Registry — MS Accounting System

> آخر تحديث: 2026-06-22
> آخر اختبار functional: 2026-06-22 (36/36 ✅)
>
> **قاعدة:** أي feature جديدة تُضاف هنا فور إضافتها. أي merge أو deploy يبدأ بـ `bash .claude/pre_deploy_check.sh`.

---

## كيفية استخدام هذا الملف

| العمود | المعنى |
|---|---|
| الحالة | ✅ يعمل / ⚠️ جزئي / ❌ مفقود / 🔬 لم يُختبر |
| آخر اختبار | تاريخ آخر functional test ناجح |
| الـ check | اسم الـ grep/test في pre_deploy_check.sh |

---

## العملاء (Clients)

| # | الميزة | الوصف | أُضيفت | آخر اختبار | الحالة | الـ check |
|---|---|---|---|---|---|---|
| C-01 | ترقيم تسلسلي | خانة # بدل الكود — idx+1 يتغير مع الفلتر | 2026-06-21 | 2026-06-22 | ✅ | `idx+1` |
| C-02 | نسخ اسم الشركة 📋 | زر clipboard بجانب الاسم | 2026-06-18 | 2026-06-22 | ✅ | `navigator.clipboard` |
| C-03 | نسخ رقم الهاتف 📋 | زر clipboard للهاتف | 2026-06-18 | 2026-06-22 | ✅ | `navigator.clipboard` |
| C-04 | Health Score Banner | شريط صحة العميل داخل المودال | 2026-05-25 | 2026-06-22 | ✅ | `healthScoreBanner` |
| C-05 | Smart Automation | Rules Engine + Notifications Bell | 2026-05-25 | 2026-06-22 | ✅ | `loadNotifCount` |

---

## تأسيس الشركات (Establishment)

| # | الميزة | الوصف | أُضيفت | آخر اختبار | الحالة | الـ check |
|---|---|---|---|---|---|---|
| E-01 | حذف ملف التأسيس 🗑️ | زر حذف في موديل التفاصيل — soft delete | 2026-06-18 | 2026-06-22 | ✅ | `deleteFormationCase.*escH` |
| E-02 | نقل المراحل | زر "التالية" ينقل الملف للمرحلة التالية | 2026-05-24 | 2026-06-22 | ✅ | `showMoveStageModal` |
| E-03 | رفع مرفق للمرحلة | رفع ملف مربوط بمرحلة محددة | 2026-05-24 | 2026-06-22 | ✅ | `_fmShowAttachModal` |
| E-04 | تحويل لعميل مكتب | بعد الاكتمال — تحويل لعميل | 2026-05-24 | 2026-06-22 | ✅ | `_fmConvertToClient` |
| E-05 | مولّد أسماء الشركات | اقتراح + فحص الكلمات المحظورة | 2026-06-16 | 2026-06-22 | ✅ | `loadCompanyNames` |

---

## المدفوعات الشهرية (Monthly Fees)

| # | الميزة | الوصف | أُضيفت | آخر اختبار | الحالة | الـ check |
|---|---|---|---|---|---|---|
| MF-01 | WhatsApp Reminder 📱 | زر في كل صف — يفتح WA بالرسالة | 2026-06-17 | 2026-06-22 | ✅ | `mfOpenWA.*r\.id` |
| MF-02 | _mfClientsMap | map من client_id → {phone, name} | 2026-06-18 | 2026-06-22 | ✅ | `_mfClientsMap` |
| MF-03 | WA Preview | معاينة الرسالة قبل الإرسال | 2026-06-17 | 2026-06-22 | ✅ | `mfWAPreview` |
| MF-04 | Dashboard | إجمالي مستحق / مدفوع / متبقي | 2026-06-16 | 2026-06-22 | ✅ | API 56,800 ✓ |
| MF-05 | تسجيل دفعة | mfPayModal + mfSavePay | 2026-06-16 | 2026-06-22 | ✅ | `mfPayModal(` |
| MF-06 | دفع سريع ⚡ | mfQuickPay بدون موديل | 2026-06-16 | 2026-06-22 | ✅ | `mfQuickPay` |
| MF-07 | دفعة مقدمة | mfPrepayModal — دفع مسبق | 2026-06-16 | 2026-06-22 | ✅ | `mfPrepayModal` |
| MF-08 | إلغاء دفعة | mfResetPay — إرجاع لـ "لم يدفع" | 2026-06-16 | 2026-06-22 | ✅ | `mfResetPay` |
| MF-09 | أرشفة عميل | mfConfirmDeleteClient — soft archive | 2026-06-16 | 2026-06-22 | ✅ | `mfConfirmDeleteClient` |
| MF-10 | تاريخ العميل | mfShowClientHistory — سجل المدفوعات | 2026-06-16 | 2026-06-22 | ✅ | `mfShowClientHistory` |
| MF-11 | Export CSV | تصدير المدفوعات | 2026-06-16 | 2026-06-22 | ✅ | `mfExportCSV()` |
| MF-12 | فلتر سنة/شهر | mfFilterChange | 2026-06-16 | 2026-06-22 | ✅ | `mfFilterChange` |
| MF-13 | فلتر الحالة | مدفوع/غير مدفوع/جزئي | 2026-06-16 | 2026-06-22 | ✅ | `mfSetFilter` |
| MF-14 | لا عملاء مؤرشفون في records | contains_eager fix | 2026-06-21 | 2026-06-22 | ✅ | API test |

---

## الالتزامات (Obligations)

| # | الميزة | الوصف | أُضيفت | آخر اختبار | الحالة | الـ check |
|---|---|---|---|---|---|---|
| OB-01 | 3 أنواع فقط في المودال | VAT / payroll / income | 2026-06-21 | 2026-06-22 | ✅ | `payroll_monthly.*income_annual` |
| OB-02 | توحيد payroll+withholding | withholding_monthly = payroll_monthly | 2026-06-21 | 2026-06-22 | ✅ | `withholding_monthly.*payroll_monthly` |
| OB-03 | منع التكرار (dedup) | لا يُنشئ التزام موجود | 2026-06-17 | 2026-06-22 | ✅ | frontend logic |
| OB-04 | تحديث فوري بعد الحفظ | loadObligations(true) | 2026-06-21 | 2026-06-22 | ✅ | `loadObligations\(true\)` |
| OB-05 | مزامنة عند تعديل العميل | auto-sync obligations on client update | 2026-06-20 | 2026-06-22 | ✅ | `fca51ad5` |
| OB-06 | income_annual دائماً ظاهر | بغض النظر عن days_ahead | 2026-06-20 | 2026-06-22 | ✅ | `fc80108b` |
| OB-07 | reset-to-current-month | مسح قديم + إعادة توليد من يونيو 2026 | 2026-06-20 | 2026-06-22 | ✅ | `4542e93e` |

---

## ضريبة القيمة المضافة (VAT / Tax Center)

| # | الميزة | الوصف | أُضيفت | آخر اختبار | الحالة | الـ check |
|---|---|---|---|---|---|---|
| V-01 | VAT Dashboard (_vatRender) | عرض الإقرار مع الأرقام | 2026-06-17 | 2026-06-22 | ✅ | `_vatRender` |
| V-02 | Drill-down | _vatDrillOpen — تفصيل بند | 2026-06-17 | 2026-06-22 | ✅ | `_vatDrillOpen` |
| V-03 | History | _vatOpenHistory — سجل الإقرارات | 2026-06-17 | 2026-06-22 | ✅ | `_vatOpenHistory` |
| V-04 | رفع Excel | tcVatExcelUpload | 2026-06-17 | 2026-06-22 | ✅ | `tcVatExcelUpload` |
| V-05 | تنزيل الإقرار | _vatDownloadDeclaration | 2026-06-17 | 2026-06-22 | ✅ | `_vatDownloadDeclaration` |
| V-06 | WHT Tab | أسس توحيد المرتبات | 2026-06-19 | 2026-06-22 | ✅ | `id.*wht` |
| V-07 | ETA Excel Import | استيراد بوابة الفواتير الإلكترونية | 2026-06-19 | 2026-06-22 | ✅ | `etaLoadVatReturn` |
| V-08 | VAT Workflow | مراجعة → إقرار → تسليم | 2026-06-19 | 2026-06-22 | ✅ | `tcVatWorkflow` |

---

## المستندات (Documents)

| # | الميزة | الوصف | أُضيفت | آخر اختبار | الحالة | الـ check |
|---|---|---|---|---|---|---|
| D-01 | tax_return category | تصنيف المستندات الضريبية | 2026-06-21 | 2026-06-22 | ✅ | API: 19 docs |
| D-02 | رفع ملفات | upload بـ FormData + category | 2026-05-24 | 2026-06-22 | ✅ | `tax_return` |
| D-03 | تنزيل المستندات | زر download على كل card | 2026-05-25 | 2026-06-22 | ✅ | `download.*doc` |

---

## النظام (System)

| # | الميزة | الوصف | أُضيفت | آخر اختبار | الحالة | الـ check |
|---|---|---|---|---|---|---|
| S-01 | Safety Layer (_SL) | Undo / Rollback / confirmDestructive | 2026-06-17 | 2026-06-22 | ✅ | `const _SL\|_SL =` |
| S-02 | Health Check 🩺 | صفحة صحة النظام — adminOnly | 2026-06-19 | 2026-06-22 | ✅ | `id:'health_check'` |
| S-03 | ms_token fix | localStorage.getItem('ms_token') | 2026-06-21 | 2026-06-22 | ✅ | `ms_token` |
| S-04 | Service Worker | cache control + force reload | 2026-06-15 | 2026-06-22 | ✅ | `serviceWorker` |
| S-05 | Global Search (Ctrl+K) | بحث عالمي | 2026-05-25 | 2026-06-22 | ✅ | `Ctrl+K\|ctrlK` |
| S-06 | Client Portal | بوابة العميل مع credentials | 2026-05-24 | 2026-06-22 | ✅ | `loadClientPortal` |
| S-07 | Backup System | إنشاء + تنزيل + استعادة | 2026-06-19 | 2026-06-22 | ✅ | `_bkCreate` |

---

## التكامل مع pre_deploy_check.sh

كل feature لها `الـ check` — وهو الـ grep pattern أو اسم الـ API test داخل `.claude/pre_deploy_check.sh`.

```bash
# قبل أي deploy:
bash .claude/pre_deploy_check.sh
# 36 check = 26 static + 10 functional
# إذا فيه ❌ → لا deploy
```

---

## كيفية إضافة feature جديدة

1. أضف سطراً في الجدول المناسب أعلاه
2. أضف `check()` في `.claude/pre_deploy_check.sh` تحت section المناسب
3. شغّل `bash .claude/pre_deploy_check.sh` وتأكد النتيجة ✅
