# Module 01 — Login + Auth Shell
**Tier:** 3 (ثانوي — لا يمس بيانات)  
**الأولوية:** أول module يُنقل  
**الحالة:** ❌ لم يبدأ بعد

---

## لماذا Login أولاً؟

| السبب | التفاصيل |
|-------|---------|
| **Tier 3** — أقل خطورة | فشله = صفحة بيضاء فقط، لا يمس بيانات |
| **كل شيء يعتمد عليه** | لا يمكن اختبار أي module آخر بدون Login يعمل |
| **80% مكتمل أصلاً** | `Login.tsx` موجود ويحتاج 20% فقط للإكمال |
| **أبسط API** | endpoint واحد: `POST /api/auth/login` |
| **لا WebSocket** | لا يحتاج real-time — أقل تعقيداً |
| **Rollback سهل** | إذا فشل → المستخدمون يستخدمون `/ms-accounting/` بدل `/ms-accounting/app/` |

---

## المخاطر

| المخاطرة | الاحتمال | الأثر | الحل |
|---------|---------|-------|------|
| Token format مختلف | منخفض | كسر كل الـ API calls | استخدام نفس مفتاح `localStorage.token` |
| Redirect loop | متوسط | المستخدم لا يستطيع الدخول | اختبار منفصل لكل حالة |
| Mobile keyboard يغطي الـ form | متوسط | UX سيئ على الجوال | viewport meta + scroll into view |
| CORS على subdomain جديد | منخفض | API calls تُرفض | نفس الـ domain — لا مشكلة |

---

## ما يُبنى في هذا الـ Module

### `Login.tsx` — ما يحتاج إكمال (20% متبقي)

```typescript
// 1. Token يُحفظ بنفس المفتاح كـ vanilla:
localStorage.setItem('token', data.access_token);
localStorage.setItem('user', JSON.stringify(data.user));

// 2. Redirect بعد Login
navigate('/dashboard');

// 3. Guard: إذا logged in → لا تُظهر Login
useEffect(() => {
  if (localStorage.getItem('token')) navigate('/dashboard');
}, []);

// 4. Error message بالعربية
// 5. Loading state أثناء الطلب
```

### `Layout.tsx` — Sidebar + Nav Shell

```typescript
// يجب أن يقرأ currentUser من localStorage
// RBAC: adminOnly items لا تظهر لغير الـ admin
// نفس منطق: currentUser?.role === 'admin' || currentUser?.email === 'ms.owner@mshq.io'
```

### `authStore.ts` (Zustand)

```typescript
// State مشترك بين كل الـ pages
interface AuthState {
  user: User | null;
  token: string | null;
  login: (email, password) => Promise<void>;
  logout: () => void;
}
```

---

## خطة الاختبار

### قبل النقل (Regression على vanilla)
- [ ] Login بـ `ms.owner@mshq.io` / `MS@QVj8ebqSw1iAOdLR#26` → يعمل
- [ ] Login بـ credentials خاطئة → رسالة خطأ
- [ ] Refresh الصفحة وأنت logged in → تبقى logged in
- [ ] Logout → redirect للـ login
- [ ] Admin يرى كل الـ nav items
- [ ] Employee لا يرى items الـ admin only

### أثناء الـ Dual Run (على React version)
- [ ] نفس الاختبارات السابقة على `/ms-accounting/app/login`
- [ ] Token المحفوظ من React يعمل مع الـ vanilla pages (نفس localStorage)
- [ ] Token المحفوظ من vanilla يعمل مع الـ React pages

### اختبارات إضافية للـ React
- [ ] RTL: النص العربي يتجه يميناً
- [ ] Mobile 375px: الـ form كامل وليس مقطوعاً
- [ ] Dark mode (إذا مطلوب): الألوان صحيحة
- [ ] Loading spinner يظهر أثناء الطلب
- [ ] لا يوجد re-render غير ضروري

---

## خطة الـ Rollback

**وقت الـ Rollback المستهدف:** أقل من 2 دقيقة

**السيناريو:** المستخدم لا يستطيع الدخول من الـ React version

```
الخطوة 1 — (30 ثانية)
المستخدم يفتح: https://mosaeed1099-ship-it.github.io/ms-accounting/
(النسخة الـ vanilla — دائماً متاحة)

الخطوة 2 — (لاحقاً)
إصلاح المشكلة في React → اختبار محلياً → إعادة النشر
```

**لا يحتاج Restore للـ Backup** — Login لا يكتب في قاعدة البيانات.

---

## تسلسل التنفيذ

```
اليوم 1:
[ ] إكمال Login.tsx (token storage + error + loading + redirect)
[ ] إكمال Layout.tsx (sidebar + RBAC + logout)
[ ] authStore.ts (Zustand)
[ ] اختبار محلي: npm run dev

اليوم 2:
[ ] Vite build → يعمل بدون errors
[ ] نشر على gh-pages في مسار /ms-accounting/app/
[ ] اختبار على الرابط الحقيقي

اليوم 3-9 (Dual Run):
[ ] المستخدمون يختبرون النسختين
[ ] لا bug reports؟ → جاهز للاعتماد

بعد 7 أيام:
[ ] موافقتك → الانتقال للـ Module التالي (Dashboard)
```

---

## تقرير الاكتمال

Module يُعتبر مكتملاً عند:
- [ ] Login يعمل على production بدون أخطاء
- [ ] Logout يعمل
- [ ] RBAC: admin يرى كل شيء، employee يرى المسموح فقط
- [ ] Mobile: form يعمل على 375px
- [ ] 7 أيام Dual Run بدون bug reports
- [ ] موافقتك الصريحة

**بعد الاعتماد:** لا شيء يُحذف من index.html في هذه المرحلة  
(Login في index.html بسيط جداً — يُحذف مع المرحلة النهائية)
