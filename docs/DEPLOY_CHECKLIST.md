# Deploy Checklist — MS Accounting System

> أي deploy لا يُعتبر ناجحاً إلا بعد اجتياز **Pre-Deploy + Post-Deploy** كاملاً.
> السبب: مشكلة الـ White Screen (يونيو 2026) أثبتت أن الـ Static Checks وحدها لا تكفي.

---

## Pre-Deploy Checklist

### 1. Backup (اختياري لكن مُوصى به)

```bash
# خذ نسخة احتياطية من الملف الحالي قبل أي تعديل كبير
cp frontend/index.html /tmp/backup_$(date +%Y%m%d_%H%M%S).html
```

### 2. Feature Registry Update

> إذا أضفت feature جديدة:

- [ ] أضف سطراً في [`docs/FEATURE_REGISTRY.md`](FEATURE_REGISTRY.md)
- [ ] أضف `check()` مناسب في `.claude/pre_deploy_check.sh`

### 3. Pre-Deploy Automated Check

```bash
bash .claude/pre_deploy_check.sh
```

**يجب أن تنتهي بـ: `🚀 الملف جاهز للـ Deploy`**

يفحص 36 نقطة:
- 26 static: وجود الكود + ربطه بالـ UI + JavaScript Syntax
- 10 functional: API حقيقي — Create/Delete/Query

**إذا فيه ❌ واحدة → لا تكمل.**

### 4. Deploy

```bash
# Commit على main
git add frontend/index.html
git commit -m "feat/fix: وصف التغيير"
git push origin main

# Sync لـ gh-pages
git stash
git checkout gh-pages
git show main:frontend/index.html > index.html
git add index.html
git commit -m "deploy: sync"
git push origin gh-pages
git checkout main
git stash pop
```

---

## Post-Deploy Checklist

### 5. Post-Deploy Automated Check

```bash
# انتظر 1-3 دقائق لـ GitHub Pages يكمّل البناء، ثم:
bash .claude/post_deploy_check.sh
```

**يفحص 24 نقطة تلقائياً:**

| الفحص | ما يتحقق منه |
|---|---|
| HTTP 200 | الموقع يستجيب |
| Page size > 1MB | الـ HTML وصل كاملاً (مش blank) |
| cache-bust match | النسخة المنشورة = آخر commit |
| عدد الأسطر match | لم يُقتطع الملف |
| JS Syntax | `node --check` على الملف المنشور |
| 10 features في production HTML | grep مباشر على الـ production URL |
| API Health | `/health` endpoint |
| 5 API endpoints | clients / obligations / MF / documents / login |

**يجب أن تنتهي بـ: `✅ Automated checks passed.`**

### 6. Manual Browser Check

> هذه الخطوات **لا يمكن** أتمتتها لأنها تحتاج متصفحاً حقيقياً.

افتح: **https://mosaeed1099-ship-it.github.io/ms-accounting**

- [ ] **الصفحة الرئيسية** — تفتح بدون White Screen أو Loading لانهائي
- [ ] **Console (F12)** — لا يوجد JavaScript Error باللون الأحمر
  - أخطاء الـ Network (404 لأيقونات مثلاً) مقبولة
  - أخطاء JavaScript runtime ❌ غير مقبولة
- [ ] **Navigation** — القائمة الجانبية تعمل والتنقل سلس

### 7. Smoke Test سريع للصفحات

| الصفحة | الرابط | ✅ / ❌ |
|---|---|---|
| العملاء | `#clients` | |
| تأسيس الشركات | `#establishment` | |
| المدفوعات الشهرية | `#monthly_fees` | |
| الالتزامات | `#obligations` | |
| ض. القيمة المضافة | `#tax` | |
| المستندات | `#documents` | |
| صحة النظام | `#health_check` | |

### 8. آخر Feature

- [ ] تأكد أن آخر feature طُورت ظاهرة فعلياً للمستخدم
- [ ] لو feature جديدة → جرّبها بالفعل (اضغط الزر / افتح الموديل / تأكد الـ data)

---

## تعريف "Deploy ناجح"

```
Pre-Deploy check  →  🚀 36/36 ✅
    +
Post-Deploy auto  →  24/24 ✅
    +
Manual browser    →  White Screen ❌ / Console errors ❌ / Navigation ❌
    =
✅ Deploy ناجح رسمياً
```

---

## أمثلة على مشاكل اكتُشفت Post-Deploy

| التاريخ | المشكلة | كيف اكتُشفت | السبب |
|---|---|---|---|
| 2026-06-21 | White Screen كامل | فتح الموقع | `mfPayModal` مكررة بدون `}` إغلاق |
| 2026-06-21 | زر حذف التأسيس مفقود | Audit يدوي | function موجودة بدون زر في UI |

هذا هو السبب في وجود الـ Manual Browser Check — Static Checks وحدها ما كانت لتكتشف الـ White Screen.

---

## ملفات مرتبطة

| الملف | الغرض |
|---|---|
| `.claude/pre_deploy_check.sh` | 36 check قبل Deploy |
| `.claude/post_deploy_check.sh` | 24 check بعد Deploy |
| `docs/FEATURE_REGISTRY.md` | سجل الـ 35 feature |
| `docs/FEATURES_LAST_30_DAYS.md` | تقرير الـ 30 يوم |
