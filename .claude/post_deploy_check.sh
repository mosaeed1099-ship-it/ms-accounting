#!/bin/bash
# Post-Deploy Verification — ms-accounting
# Usage: bash .claude/post_deploy_check.sh
# يُشغَّل بعد كل push لـ gh-pages

SITE="https://mosaeed1099-ship-it.github.io/ms-accounting"
API="https://ms-accounting-api-production.up.railway.app"
LOCAL_F="frontend/index.html"
PASS=0; FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1${2:+ — $2}"; FAIL=$((FAIL+1)); }
section() { echo ""; echo "▶ $1"; }

echo ""
echo "══════════════════════════════════════════════"
echo "  Post-Deploy Verification"
echo "  Site: $SITE"
echo "══════════════════════════════════════════════"

# ─── 1. HTTP Response ─────────────────────────────────────────
section "الموقع يستجيب"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$SITE/")
SIZE=$(curl -s -o /dev/null -w "%{size_download}" --max-time 15 "$SITE/")
TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 15 "$SITE/")

[ "$HTTP_CODE" = "200" ] && ok "HTTP $HTTP_CODE" || fail "HTTP response" "got $HTTP_CODE"
[ "${SIZE:-0}" -gt 1000000 ] && ok "Page size: $(echo "$SIZE/1024/1024" | bc -l | xargs printf '%.1fMB') (> 1MB)" \
                              || fail "Page size صغير جداً" "${SIZE} bytes"
ok "Response time: ${TIME}s"

# ─── 2. جلب الـ HTML مرة واحدة ────────────────────────────────
HTML=$(curl -s --max-time 20 "$SITE/")

# ─── 3. No White Screen — فحص محتوى الـ HTML ─────────────────
section "لا White Screen"
echo "$HTML" | grep -q '<body' && ok "تجد <body> في الـ HTML" || fail "لا يوجد <body>"
echo "$HTML" | grep -q 'id="app"\|id="root"\|class="modal\|function load' \
  && ok "محتوى JS موجود في الـ HTML" || fail "HTML يبدو فارغاً"

# ─── 4. Version Match — cache-bust ────────────────────────────
section "النسخة المنشورة = آخر Commit"
if [ -f "$LOCAL_F" ]; then
  LOCAL_CB=$(grep -o "cache-bust: [0-9]*" "$LOCAL_F" | head -1)
  PROD_CB=$(echo "$HTML" | grep -o "cache-bust: [0-9]*" | head -1)
  LOCAL_LINES=$(wc -l < "$LOCAL_F" | tr -d ' ')
  PROD_LINES=$(echo "$HTML" | wc -l | tr -d ' ')

  if [ "$LOCAL_CB" = "$PROD_CB" ]; then
    ok "cache-bust متطابق: $PROD_CB"
  else
    fail "cache-bust مختلف" "local=$LOCAL_CB | prod=$PROD_CB"
  fi

  DIFF=$((LOCAL_LINES - PROD_LINES))
  ABSDIFF=${DIFF#-}
  [ "$ABSDIFF" -le 5 ] && ok "عدد الأسطر متطابق: $PROD_LINES سطر" \
                        || fail "فرق في عدد الأسطر" "local=$LOCAL_LINES | prod=$PROD_LINES"
else
  fail "لا يوجد $LOCAL_F للمقارنة"
fi

# ─── 5. JavaScript Syntax — على الـ local file (مصدر الحقيقة) ──
section "JavaScript Syntax"
if [ -f "$LOCAL_F" ]; then
  START=$(grep -n '<script type="module">' "$LOCAL_F" | head -1 | cut -d: -f1)
  END=$(grep -n '^</script>' "$LOCAL_F" | tail -1 | cut -d: -f1)
  if [ -n "$START" ] && [ -n "$END" ]; then
    sed -n "$((START+1)),$((END-1))p" "$LOCAL_F" > /tmp/_post_syntax.js
    if node --check /tmp/_post_syntax.js 2>/dev/null; then
      ok "JS Syntax سليم (من local file المنشور)"
    else
      fail "JS Syntax Error في الملف المنشور"
      node --check /tmp/_post_syntax.js 2>&1 | head -5
    fi
  fi
fi

# ─── 6. Critical Features في الـ Production HTML ──────────────
section "الـ Features في الـ Production"
check_feat() {
  local label="$1" pat="$2"
  echo "$HTML" | grep -q "$pat" && ok "$label" || fail "$label مفقود في production" "$pat"
}
check_feat "WhatsApp-mfOpenWA"         "mfOpenWA"
check_feat "VAT-Dashboard-_vatRender"  "_vatRender"
check_feat "Health-Check"              "loadHealthCheck"
check_feat "Safety-Layer-_SL"         "_SL"
check_feat "Delete-Formation"          "deleteFormationCase"
check_feat "Sequential-numbering"      "idx+1"
check_feat "tax_return-category"       "tax_return"
check_feat "_mfClientsMap"             "_mfClientsMap"
check_feat "WHT-Tab"                   "tcWhtBuildReturn"
check_feat "Obligations-Refresh"       "loadObligations(true)"

# ─── 7. API Backend ───────────────────────────────────────────
section "API Backend يستجيب"
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API/health")
if [ "$API_CODE" = "200" ]; then
  API_STATUS=$(curl -s --max-time 10 "$API/health" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status','?'),'|',d.get('db','?'))" 2>/dev/null)
  ok "API Health: $API_STATUS"
else
  fail "API لا يستجيب" "HTTP $API_CODE"
fi

# ─── 8. Critical API Endpoints ────────────────────────────────
section "Endpoints أساسية"
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -d "username=ms.owner@mshq.io&password=MS@QVj8ebqSw1iAOdLR#26" \
  --max-time 10 | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('access_token',''))" 2>/dev/null)

if [ -n "$TOKEN" ]; then
  ok "Login API يعمل"
  for ep in "/api/clients?page_size=1" "/api/obligations?page_size=1" "/api/monthly-fees/dashboard?year=2026&month=6" "/api/documents?page_size=1"; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$API$ep" -H "Authorization: Bearer $TOKEN")
    [ "$CODE" = "200" ] && ok "$ep" || fail "$ep" "HTTP $CODE"
  done
else
  fail "Login API — لا يمكن الحصول على token"
fi

# ─── 9. Manual Checks Reminder ────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
echo "  AUTOMATED: ✅ $PASS  ❌ $FAIL"
echo "══════════════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "⛔  Deploy فشل — راجع الأخطاء أعلاه قبل الإعلان عن نجاح النشر"
  echo ""
  exit 1
fi

echo ""
echo "✅ Automated checks passed."
echo ""
echo "══════════════════════════════════════════════"
echo "  MANUAL CHECKS (افتح المتصفح وتأكد يدوياً)"
echo "══════════════════════════════════════════════"
echo ""
echo "  1. افتح: $SITE"
echo "  2. تأكد: الصفحة الرئيسية تظهر بدون White Screen"
echo "  3. افتح Console (F12) — تأكد: لا يوجد JavaScript Error"
echo "  4. انتقل لكل صفحة وتأكد تفتح بشكل طبيعي:"
echo "     → العملاء (clients)"
echo "     → تأسيس الشركات (establishment)"
echo "     → المدفوعات الشهرية (monthly_fees)"
echo "     → الالتزامات (obligations)"
echo "     → ضريبة القيمة المضافة (tax)"
echo "     → المستندات (documents)"
echo "     → صحة النظام (health_check) — Admin فقط"
echo "  5. تأكد آخر feature تم تطويرها ظاهرة"
echo ""
echo "  بعد اجتياز الـ Manual Checks → ✅ Deploy ناجح رسمياً"
echo ""
exit 0
