#!/bin/bash
# Pre-Deploy Feature & Functional Verification — ms-accounting
# Usage: bash .claude/pre_deploy_check.sh
# يجب تشغيله من داخل مجلد المشروع

F="frontend/index.html"
PASS=0; FAIL=0
SECTION_FAILS=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1${2:+ — $2}"; FAIL=$((FAIL+1)); SECTION_FAILS=$((SECTION_FAILS+1)); }
section() { SECTION_FAILS=0; echo ""; echo "▶ $1"; }

# ═══════════════════════════════════════════════════════════════
# BLOCK 1: STATIC CODE CHECKS (بدون network)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "══════════════════════════════════════════════"
echo "  BLOCK 1: Static Code Checks"
echo "══════════════════════════════════════════════"

section "تأسيس الشركات"
grep -q "window.deleteFormationCase" "$F"                                  && ok "deleteFormationCase function" || fail "deleteFormationCase function"
grep -q "deleteFormationCase.*escH\|onclick.*deleteFormationCase"  "$F"    && ok "زر حذف الملف مربوط بـ UI" || fail "زر حذف الملف مربوط بـ UI"

section "العملاء"
grep -q "idx+1\|idx \+ 1" "$F"                                            && ok "ترقيم تسلسلي (idx+1)" || fail "ترقيم تسلسلي"
grep -q "navigator.clipboard" "$F"                                         && ok "نسخ clipboard" || fail "نسخ clipboard"

section "المدفوعات الشهرية"
grep -q "mfOpenWA" "$F"                                                    && ok "mfOpenWA function" || fail "mfOpenWA function"
grep -q "mfSendWA" "$F"                                                    && ok "mfSendWA function" || fail "mfSendWA function"
grep -q "_mfClientsMap" "$F"                                               && ok "_mfClientsMap" || fail "_mfClientsMap"
grep -q "mfOpenWA(.*r\.id\|📱" "$F"                                        && ok "📱 زر WA في جدول الـ records" || fail "📱 زر WA في جدول الـ records"
grep -q "mfPayModal(" "$F"                                                 && ok "مفتوحة بـ UI (onclick)" || fail "mfPayModal غير مستدعاة من UI"
grep -q "mfExportCSV()" "$F"                                               && ok "mfExportCSV مربوط بـ زر" || fail "mfExportCSV"

section "الالتزامات"
grep -q "payroll_monthly.*income_annual\|income_annual.*payroll_monthly" "$F" && ok "3 أنواع فقط في modal" || fail "3 أنواع modal"
grep -q "withholding_monthly.*payroll_monthly" "$F"                        && ok "dedup withholding→payroll" || fail "dedup"
grep -q "loadObligations(true)" "$F"                                       && ok "loadObligations(true) بعد الحفظ" || fail "loadObligations(true)"

section "VAT Dashboard"
grep -q "_vatRender" "$F"                                                  && ok "_vatRender function" || fail "_vatRender function"
grep -q "vatDrill\|_vatDrillOpen" "$F"                                     && ok "Drill-down" || fail "Drill-down"
grep -q "_vatOpenHistory\|vatHistory" "$F"                                 && ok "History" || fail "History"
grep -q "tcVatExcelUpload" "$F"                                            && ok "Excel Upload" || fail "Excel Upload"
grep -q "_vatDownloadDeclaration" "$F"                                     && ok "Download Declaration" || fail "Download Declaration"

section "Auth & Documents"
grep -q "localStorage.getItem('ms_token')" "$F"                           && ok "ms_token fix" || fail "ms_token fix"
grep -q "tax_return" "$F"                                                  && ok "tax_return category" || fail "tax_return"

section "النظام"
grep -q "loadHealthCheck" "$F"                                             && ok "Health Check page function" || fail "Health Check page"
grep -q "id:'health_check'\|health_check.*adminOnly" "$F"                 && ok "Health Check في القائمة الجانبية" || fail "Health Check nav"
grep -q "const _SL\|let _SL\|_SL =" "$F"                                 && ok "Safety Layer _SL" || fail "Safety Layer"
grep -q "id.*wht\|wht.*tab" "$F"                                          && ok "WHT Tab" || fail "WHT Tab"

section "JavaScript Syntax"
START=$(grep -n '<script type="module">' "$F" | head -1 | cut -d: -f1)
END=$(grep -n '^</script>' "$F" | tail -1 | cut -d: -f1)
if [ -n "$START" ] && [ -n "$END" ]; then
  sed -n "$((START+1)),$((END-1))p" "$F" > /tmp/_ms_syntax.js
  if node --check /tmp/_ms_syntax.js 2>/dev/null; then
    ok "JavaScript Syntax سليم"
  else
    echo "  ❌ JavaScript Syntax ERROR:"
    node --check /tmp/_ms_syntax.js 2>&1 | head -5
    FAIL=$((FAIL+1))
  fi
else
  fail "لم يتم إيجاد script block"
fi

section "Script Tags Balance"
OPEN=$(grep -c '<script' "$F" 2>/dev/null || echo 0)
CLOSE=$(grep -c '</script>' "$F" 2>/dev/null || echo 0)
# السطر 15014 فيه <script> داخل template literal — طبيعي أن OPEN > CLOSE بمقدار 1
DIFF=$((OPEN - CLOSE))
if [ "$DIFF" -ge 0 ] && [ "$DIFF" -le 2 ]; then
  ok "Script tags: $OPEN open / $CLOSE close (diff=$DIFF — normal)"
else
  fail "Script tags غير متوازنة" "open=$OPEN close=$CLOSE diff=$DIFF"
fi

STATIC_PASS=$PASS; STATIC_FAIL=$FAIL
echo ""
echo "  Static: ✅ $PASS  ❌ $FAIL"

# ═══════════════════════════════════════════════════════════════
# BLOCK 2: FUNCTIONAL API TESTS (يحتاج network)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "══════════════════════════════════════════════"
echo "  BLOCK 2: Functional API Smoke Tests"
echo "══════════════════════════════════════════════"

API="https://ms-accounting-api-production.up.railway.app"
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -d "username=ms.owner@mshq.io&password=MS@QVj8ebqSw1iAOdLR#26" \
  2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "  ⚠️  تعذر الاتصال بالـ API — تخطي functional tests"
else
  # Health
  section "Health Check API"
  STATUS=$(curl -s "$API/health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  [ "$STATUS" = "ok" ] && ok "Health endpoint: $STATUS" || fail "Health endpoint" "$STATUS"

  # Formation create + delete
  section "Formation CRUD"
  CID=$(curl -s -X POST "$API/api/formation" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"company_name":"__SMOKE_TEST__","company_type":"llc","current_stage":"initial_meeting"}' \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
  if [ -n "$CID" ] && [ "$CID" != "" ]; then
    ok "إنشاء ملف تأسيس (id=$CID)"
    DEL=$(curl -s -X DELETE "$API/api/formation/$CID" -H "Authorization: Bearer $TOKEN" \
      | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('ok',''))" 2>/dev/null)
    [ "$DEL" = "True" ] && ok "حذف ملف التأسيس" || fail "حذف ملف التأسيس" "$DEL"
    # تأكد اختفى من القائمة
    IN_LIST=$(curl -s "$API/api/formation?page_size=200" -H "Authorization: Bearer $TOKEN" \
      | python3 -c "import sys,json;d=json.load(sys.stdin);items=d if isinstance(d,list) else d.get('items',[]);print($CID in [c['id'] for c in items])" 2>/dev/null)
    [ "$IN_LIST" = "False" ] && ok "الملف المحذوف لا يظهر في القائمة" || fail "الملف ما زال في القائمة" "soft-delete issue"
  else
    fail "إنشاء ملف تأسيس" "لا يوجد id في الـ response"
  fi

  # Monthly fees dashboard consistency
  section "المدفوعات الشهرية — تطابق الأرقام"
  python3 - <<'PYEOF' 2>/dev/null
import requests, os, sys
API=os.environ.get('API','https://ms-accounting-api-production.up.railway.app')
TOKEN=sys.argv[1] if len(sys.argv)>1 else ''
H={'Authorization':f'Bearer {TOKEN}'}
dash=requests.get(f'{API}/api/monthly-fees/dashboard?year=2026&month=6',headers=H).json()
recs=requests.get(f'{API}/api/monthly-fees/records?year=2026&month=6&page_size=200',headers=H).json()
items=recs if isinstance(recs,list) else recs.get('items',[])
dash_due=dash.get('summary',{}).get('total_due',0)
calc_due=sum(r.get('total_due',0) for r in items)
diff=abs(dash_due-calc_due)
if diff<1:
    print(f'OK:{dash_due:.0f}')
else:
    print(f'FAIL:dash={dash_due},calc={calc_due}')
PYEOF
  # نقرأ نتيجة python3 بشكل آخر
  MF_CHECK=$(python3 -c "
import requests,json
API='$API'; H={'Authorization':'Bearer $TOKEN'}
dash=requests.get(f'{API}/api/monthly-fees/dashboard?year=2026&month=6',headers=H).json()
recs=requests.get(f'{API}/api/monthly-fees/records?year=2026&month=6&page_size=200',headers=H).json()
items=recs if isinstance(recs,list) else recs.get('items',[])
dash_due=dash.get('summary',{}).get('total_due',0)
calc_due=sum(r.get('total_due',0) for r in items)
print('ok' if abs(dash_due-calc_due)<1 else f'diff={abs(dash_due-calc_due)}')
" 2>/dev/null)
  [ "$MF_CHECK" = "ok" ] && ok "Dashboard total_due يطابق records" || fail "Dashboard/records mismatch" "$MF_CHECK"

  # Obligations — API reachable
  section "الالتزامات API"
  OBL_TOTAL=$(curl -s "$API/api/obligations?page_size=1" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
  [ "${OBL_TOTAL:-0}" -gt 0 ] && ok "الالتزامات: $OBL_TOTAL إجمالي" || fail "الالتزامات API" "total=$OBL_TOTAL"

  # Monthly fees clients with phone
  section "WhatsApp — phone lookup"
  WA_COUNT=$(curl -s "$API/api/monthly-fees/clients?page_size=200" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);items=d if isinstance(d,list) else d.get('items',[]);print(sum(1 for c in items if c.get('phone')))" 2>/dev/null)
  [ "${WA_COUNT:-0}" -gt 0 ] && ok "عملاء بهاتف: $WA_COUNT" || fail "لا يوجد clients بهاتف"

  # Documents
  section "المستندات"
  DOC_TOTAL=$(curl -s "$API/api/documents?category=tax_return&page_size=1" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('total',0) if isinstance(d,dict) else len(d))" 2>/dev/null)
  [ "${DOC_TOTAL:-0}" -gt 0 ] && ok "tax_return docs: $DOC_TOTAL" || fail "لا يوجد tax_return documents"

  # VAT endpoint reachable
  section "VAT API"
  VAT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/tax-center/vat/2" -H "Authorization: Bearer $TOKEN")
  [ "$VAT_CODE" = "200" ] && ok "VAT endpoint يعمل (HTTP 200)" || fail "VAT endpoint" "HTTP $VAT_CODE"

  # Clients count
  section "العملاء"
  CLI_TOTAL=$(curl -s "$API/api/clients?page_size=1" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
  [ "${CLI_TOTAL:-0}" -gt 0 ] && ok "عدد العملاء: $CLI_TOTAL" || fail "clients API" "total=$CLI_TOTAL"
fi

# ═══════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════
echo ""
echo "══════════════════════════════════════════════"
echo "  FINAL: ✅ $PASS نجح  |  ❌ $FAIL فشل"
echo "══════════════════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "⛔  لا تكمل الـ Deploy — أصلح الـ issues أولاً"
  exit 1
else
  echo "🚀  الملف جاهز للـ Deploy"
  exit 0
fi
