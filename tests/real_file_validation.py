"""
Real-File Validation Suite for Universal Excel Import Engine
============================================================
يختبر Engine على ملفات حقيقية من النظام.
يطبع تقرير كامل لكل ملف ثم يقارن الأرقام بعد الاستيراد.
"""
import sys, os, time, traceback, json, re, io
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.routers.excel_engine import (
    classify_sheet_universal,
    map_columns_universal,
    get_field_confidences,
    detect_header_row,
    _is_number,
)

# ─── Colours ──────────────────────────────────────────────────────────────────
G = "\033[32m"; R = "\033[31m"; Y = "\033[33m"; B = "\033[34m"; BOLD = "\033[1m"; RST = "\033[0m"

def ok(s):  print(f"  {G}✅{RST} {s}")
def err(s): print(f"  {R}❌{RST} {s}")
def warn(s):print(f"  {Y}⚠️ {RST} {s}")
def hdr(s): print(f"\n{BOLD}{B}{'═'*60}{RST}\n{BOLD}{B}{s}{RST}\n{BOLD}{B}{'═'*60}{RST}")
def sub(s): print(f"\n{BOLD}── {s} ──{RST}")

# ─── Real file list ────────────────────────────────────────────────────────────
REAL_FILES = [
    # Egyptian ETA (real e-invoicing exports)
    ("/Users/render/Downloads/الفواتير_الإلكترونية_20-06-2026_16-29.xlsx",  "ETA فواتير إلكترونية (يونيو 2026)"),
    ("/Users/render/Downloads/الفواتير_الإلكترونية_14-06-2026_16-17.xlsx",  "ETA فواتير إلكترونية (يونيو 2026 — نسخة 2)"),
    ("/Users/render/Downloads/مبيعات نهائي.xlsx",                             "مبيعات عميل حقيقي (متعدد الشيتات)"),
    # Arabic accounting
    ("/Users/render/Downloads/الدخل.xlsx",                                    "الدخل — ملف عربي"),
    ("/Users/render/Desktop/نموذج_اقرار_ضريبة_القيمة_المضافة.xlsx",          "نموذج إقرار ض.ق.م"),
    ("/Users/render/Desktop/حساب_الضريبة.xlsx",                              "حاسبة الضريبة"),
    # Arabic ERP-style
    ("/Users/render/Documents/٢٠٢٥/ملفات عربية/برنامج محاسبي 2024 - V1 M.xlsx",  "برنامج محاسبي عربي متكامل"),
    ("/Users/render/Documents/٢٠٢٥/ملفات عربية/اليوميه الامريكيه 2020 (1).xlsx",  "اليومية الأمريكية"),
    ("/Users/render/Documents/٢٠٢٥/ملفات عربية/التحديث الشامل محاسبة متكاملة /فاتورة مبيعات Excel مجانية.xlsx", "فاتورة مبيعات عربية"),
    ("/Users/render/Documents/٢٠٢٥/ملفات عربية/التحديث الشامل محاسبة متكاملة /إيرادات-ومصروفات-الشركة.xlsx",   "إيرادات ومصروفات"),
    ("/Users/render/Documents/٢٠٢٥/salary_sheet.xlsx",                       "كشف الرواتب"),
    # English / mixed
    ("/Users/render/Documents/Cashbox_Allocation_Jan_v2.xlsx",               "Cashbox Allocation (English multi-sheet)"),
    ("/Users/render/Documents/٢٠٢٥/Audit MS  2025.xlsx",                    "Audit MS 2025 (multi-sheet)"),
    ("/Users/render/Documents/٢٠٢٥/Dashboard M&B.xlsx",                     "Dashboard M&B (Reports/Pivot)"),
    ("/Users/render/Documents/٢٠٢٥/Monthly_Report_June_July.xlsx",          "Monthly Report (Summary sheets)"),
    ("/Users/render/Downloads/test_2026.xlsx",                               "Test 2026"),
]

# ─── Engine helpers ────────────────────────────────────────────────────────────

def analyse_file(path: str, label: str) -> dict:
    results = {"file": label, "path": path, "sheets": [], "error": None}
    try:
        xl = pd.ExcelFile(path)
    except Exception as e:
        results["error"] = str(e)
        return results

    results["sheet_names"] = xl.sheet_names
    results["sheet_count"] = len(xl.sheet_names)

    for sheet_name in xl.sheet_names:
        sr = {"name": sheet_name}
        try:
            df_raw = xl.parse(sheet_name, header=None)
            if df_raw.empty:
                sr["skip_reason"] = "شيت فارغ"
                sr["skipped"] = True
                results["sheets"].append(sr)
                continue

            # Detect header row
            header_row = detect_header_row(df_raw)
            df = xl.parse(sheet_name, header=header_row)
            df = df.dropna(how="all")

            if df.empty or len(df.columns) < 2:
                sr["skip_reason"] = "أقل من عمودين بعد الـ header"
                sr["skipped"] = True
                results["sheets"].append(sr)
                continue

            cols = [str(c).strip() for c in df.columns]
            sample = df.head(20)

            # Classify
            t0 = time.time()
            classification = classify_sheet_universal(cols, sample, sheet_name)
            mapping_full   = map_columns_universal(cols, sample)
            field_conf     = get_field_confidences(cols, sample)
            elapsed        = time.time() - t0

            # Row stats
            sr["type"]          = classification["type"]
            sr["ar_label"]      = classification["ar_label"]
            sr["importable"]    = classification["importable"]
            sr["confidence"]    = classification["confidence"]
            sr["reasons"]       = classification["reasons"]
            sr["skip_reason"]   = classification.get("skip_reason")
            sr["skipped"]       = not classification["importable"]
            sr["all_scores"]    = classification.get("all_scores", {})
            sr["row_count"]     = len(df)
            sr["col_count"]     = len(cols)
            sr["cols"]          = cols[:20]
            sr["header_row"]    = header_row
            sr["elapsed_ms"]    = round(elapsed * 1000, 1)

            # Field confidences
            sr["field_conf"] = {
                f: {"col": info.get("col_name"), "conf": info.get("confidence", 0),
                    "method": info.get("method"), "needs_review": info.get("needs_review")}
                for f, info in field_conf.items()
                if info.get("col_idx") is not None
            }

            # Row-level parse if importable
            if classification["importable"]:
                mapping_legacy = {f: info["col_idx"] for f, info in mapping_full.items()
                                  if info["col_idx"] is not None}
                good, bad = _parse_rows(df, mapping_legacy)
                sr["good_rows"]    = len(good)
                sr["error_rows"]   = len(bad)
                sr["error_sample"] = bad[:3]
                sr["sheet_total_amount"] = round(sum(r.get("amount",0) or 0 for r in good), 2)
                sr["sheet_total_vat"]    = round(sum(r.get("vat",0)    or 0 for r in good), 2)
                sr["sheet_total_net"]    = round(sum(r.get("net",0)    or 0 for r in good), 2)

                # Raw totals from sheet (for comparison) — skip totals rows
                amt_idx = mapping_legacy.get("amount")
                TOTALS_KW = ['إجمالي','مجموع','total','grand total','subtotal','**','الإجمالي']
                raw_total = 0.0
                for _, row in df.iterrows():
                    is_totals = any(
                        any(kw in str(v).lower() for kw in TOTALS_KW)
                        for v in row.values
                        if v is not None and str(v).strip() not in ('nan','')
                    )
                    if is_totals: continue
                    if amt_idx is not None and amt_idx < len(row):
                        v = _smart_number(row.iloc[amt_idx])
                        if v: raw_total += v
                sr["raw_sheet_total"] = round(raw_total, 2)
                sr["total_diff"] = round(abs(raw_total - sr["sheet_total_amount"]), 2)

        except Exception as e:
            sr["error"] = f"{type(e).__name__}: {e}"
        results["sheets"].append(sr)

    return results


def _smart_number(raw):
    if raw is None: return None
    s = str(raw).strip().replace(',','').replace('٬','').replace('\xa0','')
    s = re.sub(r'[^\d.\-]', '', s)
    try:
        v = float(s)
        return v if abs(v) < 1e10 else None
    except (ValueError, TypeError):
        return None


def _parse_rows(df, mapping: dict) -> tuple:
    good, bad = [], []
    date_idx   = mapping.get("date")
    amount_idx = mapping.get("amount")
    vat_idx    = mapping.get("vat")
    net_idx    = mapping.get("net")
    partner_idx= mapping.get("partner")
    doc_idx    = mapping.get("doc")

    # quick totals-row check
    TOTALS_KW = ['إجمالي','مجموع','total','grand total','subtotal','**','الإجمالي']

    for idx, row in df.iterrows():
        # skip totals rows
        is_totals = any(
            any(kw in str(v).lower() for kw in TOTALS_KW)
            for v in row.values
            if v is not None and str(v).strip() not in ('nan','')
        )
        if is_totals: continue

        row_num = int(idx) + 2
        errors  = []

        # date
        tx_date = None
        if date_idx is not None and date_idx < len(row):
            raw_d = row.iloc[date_idx]
            try:
                # Normalize backslash separator (Windows: 18\1\2026)
                s_d = str(raw_d).strip().replace('\\', '/')
                dt = pd.to_datetime(s_d, dayfirst=True, errors='coerce')
                if pd.notna(dt) and 1990 <= dt.year <= 2100:
                    tx_date = dt.strftime('%Y-%m-%d')
                else:
                    errors.append(f"تاريخ غير صالح: {raw_d}")
            except Exception:
                errors.append(f"تاريخ غير قابل للقراءة: {raw_d}")
        else:
            errors.append("لا يوجد عمود تاريخ")

        # amount
        amount = None
        if amount_idx is not None and amount_idx < len(row):
            amount = _smart_number(row.iloc[amount_idx])
            if amount is None:
                errors.append(f"مبلغ غير صالح: {row.iloc[amount_idx]}")

        vat = _smart_number(row.iloc[vat_idx]) if vat_idx is not None and vat_idx < len(row) else 0.0
        net = _smart_number(row.iloc[net_idx]) if net_idx is not None and net_idx < len(row) else 0.0
        partner = str(row.iloc[partner_idx]).strip() if partner_idx is not None and partner_idx < len(row) else None
        doc_num = str(row.iloc[doc_idx]).strip()     if doc_idx is not None and doc_idx < len(row) else None

        r = {"row_num": row_num, "date": tx_date, "amount": amount or 0,
             "vat": vat or 0, "net": net or 0, "partner": partner, "doc_number": doc_num}

        if errors:
            r["errors"] = errors
            bad.append(r)
        else:
            good.append(r)

    return good, bad


# ─── Print report ──────────────────────────────────────────────────────────────

def print_file_report(result: dict):
    path    = result.get("path", "")
    label   = result["file"]
    sheets  = result.get("sheets", [])
    err_msg = result.get("error")

    hdr(f"📄 {label}")
    print(f"  المسار: {os.path.basename(path)}")

    if err_msg:
        err(f"فشل فتح الملف: {err_msg}")
        return result

    print(f"  الشيتات: {result['sheet_count']} — {result.get('sheet_names', [])}")

    total_good = total_bad = 0
    total_amount = total_vat = total_net = 0.0
    importable_sheets = []

    for s in sheets:
        sname = s["name"]
        stype = s.get("type","?")
        conf  = s.get("confidence", 0)
        skip  = s.get("skipped", False)

        if s.get("error"):
            print(f"\n  [{sname}] {R}ERROR: {s['error']}{RST}")
            continue

        if skip:
            print(f"\n  {Y}⏭️  [{sname}]{RST} → {stype} | {s.get('skip_reason','')}")
            continue

        # Importable sheet
        g = s.get("good_rows", 0)
        b = s.get("error_rows", 0)
        total_good += g
        total_bad  += b
        total_amount += s.get("sheet_total_amount", 0)
        total_vat    += s.get("sheet_total_vat", 0)
        total_net    += s.get("sheet_total_net", 0)
        importable_sheets.append(sname)

        conf_clr = G if conf >= 70 else Y if conf >= 40 else R
        print(f"\n  {G}📊 [{sname}]{RST}")
        print(f"     النوع:     {BOLD}{stype} — {s.get('ar_label','')}{RST}  (ثقة: {conf_clr}{conf}%{RST})")
        print(f"     الأسباب:   {s.get('reasons',[])[:3]}")
        print(f"     الأعمدة:   {len(s.get('cols',[]))} عمود — {s.get('cols',[])[:6]}...")
        print(f"     الصفوف:    {s.get('row_count',0)} إجمالي | {G}{g} سليم{RST} | {R if b else RST}{b} خطأ{RST}")
        print(f"     زمن التحليل: {s.get('elapsed_ms',0)} ms")

        # Field confidence table
        fc = s.get("field_conf", {})
        if fc:
            print(f"     {BOLD}الثقة per-field:{RST}")
            for field, info in fc.items():
                c = info["conf"]; clr = G if c >= 80 else Y if c >= 50 else R
                rev = " ⚠️" if info.get("needs_review") else ""
                print(f"       {field:10} → {info['col'][:30]:30}  {clr}{c}%{RST} [{info['method']}]{rev}")

        # Totals comparison
        raw_t  = s.get("raw_sheet_total", 0)
        good_t = s.get("sheet_total_amount", 0)
        diff   = s.get("total_diff", 0)
        if raw_t > 0:
            ok_sym = G+"✅"+RST if diff <= 1 else R+"❌"+RST
            print(f"     مجموع الشيت الخام:    {raw_t:>15,.2f}")
            print(f"     مجموع مُستخرج:        {good_t:>15,.2f}")
            print(f"     الفرق:                {diff:>15,.2f}  {ok_sym}")

        # Error samples
        if b > 0 and s.get("error_sample"):
            print(f"     {R}عينة الأخطاء:{RST}")
            for er in s["error_sample"][:2]:
                print(f"       صف {er['row_num']}: {er.get('errors',[])[0] if er.get('errors') else '?'}")

    # File summary
    sub("ملخص الملف")
    print(f"  شيتات قابلة للاستيراد: {len(importable_sheets)} → {importable_sheets}")
    print(f"  صفوف سليمة:  {G}{total_good}{RST}")
    print(f"  صفوف خاطئة: {R}{total_bad}{RST}")
    if total_amount:
        print(f"  مجموع المبالغ: {total_amount:>15,.2f}")
        print(f"  مجموع ض.ق.م:   {total_vat:>15,.2f}")
        print(f"  مجموع الإجمالي:{total_net:>15,.2f}")

    result["summary"] = {
        "importable_sheets": len(importable_sheets),
        "total_good": total_good,
        "total_bad":  total_bad,
        "total_amount": total_amount,
        "total_vat":    total_vat,
        "total_net":    total_net,
    }
    return result


# ─── Performance test ─────────────────────────────────────────────────────────

def performance_test():
    hdr("⏱️  اختبار الأداء")
    sizes = [100, 1000, 5000]
    cols = ["Invoice Date","Invoice Number","Customer","Net Amount","VAT","Total"]

    for n in sizes:
        import tracemalloc, random
        random.seed(42)
        rows = [
            {"Invoice Date": f"2025-{(i%12)+1:02d}-{(i%28)+1:02d}",
             "Invoice Number": f"INV-{i:06d}",
             "Customer": f"Customer {i % 200}",
             "Net Amount": round(random.uniform(100, 50000), 2),
             "VAT": round(random.uniform(10, 5000), 2),
             "Total": round(random.uniform(110, 55000), 2)}
            for i in range(n)
        ]
        df = pd.DataFrame(rows)

        tracemalloc.start()
        t0 = time.time()

        from app.routers.excel_engine import classify_sheet_universal, map_columns_universal
        r = classify_sheet_universal(cols, df, "Sheet1")
        m = map_columns_universal(cols, df.head(20))

        elapsed_ms = round((time.time() - t0) * 1000, 1)
        _, peak    = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        peak_kb = round(peak / 1024, 1)
        sym = G+"✅"+RST if elapsed_ms < 500 else Y+"⚠️"+RST if elapsed_ms < 2000 else R+"❌"+RST
        print(f"  {n:>6} صف → {elapsed_ms:>6} ms | ذاكرة peak: {peak_kb:>6} KB  {sym}  type={r['type']}")


# ─── Edge-case tests (API) ────────────────────────────────────────────────────

def api_edge_case_tests(file_path: str, label: str):
    """Test: double upload, batch delete, month isolation via API"""
    import requests, json as _json

    BASE  = "https://ms-accounting-api-production.up.railway.app/api/accounting"
    CREDS = {"username": "ms.owner@mshq.io", "password": "MS@QVj8ebqSw1iAOdLR#26"}

    hdr(f"🧪 Edge-Case API Tests على: {label}")

    # Login
    r = requests.post("https://ms-accounting-api-production.up.railway.app/api/auth/login",
                      data=CREDS, timeout=30)
    if r.status_code != 200:
        err(f"Login failed: {r.status_code}"); return
    token = r.json().get("access_token")
    if not token:
        err("No token"); return
    hdrs = {"Authorization": f"Bearer {token}"}
    ok("Login ✓")

    # Get a real client_id to use
    rc = requests.get("https://ms-accounting-api-production.up.railway.app/api/clients",
                      headers=hdrs, timeout=30)
    if rc.status_code != 200 or not rc.json().get("items"):
        err(f"No clients found: {rc.status_code}"); return
    client_id = rc.json()["items"][0]["id"]
    ok(f"Client ID: {client_id}")

    def upload_preview(fp, fname):
        with open(fp, "rb") as f:
            rr = requests.post(f"{BASE}/{client_id}/import/excel/preview",
                               files={"file": (fname, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                               headers=hdrs, timeout=120)
        return rr

    def confirm_import(rows_data, filename="test.xlsx", good_only=False):
        payload = {"rows": rows_data, "filename": filename, "import_good_only": good_only}
        rr = requests.post(f"{BASE}/{client_id}/import/excel/confirm",
                           json=payload, headers=hdrs, timeout=120)
        return rr

    def get_batches():
        rr = requests.get(f"{BASE}/{client_id}/import/batches", headers=hdrs, timeout=30)
        return rr.json() if rr.status_code == 200 else []

    def delete_batch(bid):
        rr = requests.delete(f"{BASE}/{client_id}/import/batches/{bid}", headers=hdrs, timeout=30)
        return rr.status_code

    def get_trial_balance():
        rr = requests.get(f"{BASE}/{client_id}/reports/trial-balance", headers=hdrs, timeout=30)
        return rr.json() if rr.status_code == 200 else {}

    # ── Test 1: Preview ───────────────────────────────────────────────────────
    sub("Test 1: Preview الملف")
    r1 = upload_preview(file_path, os.path.basename(file_path))
    if r1.status_code != 200:
        err(f"Preview فشل: {r1.status_code} — {r1.text[:300]}")
        return
    d1 = r1.json()
    importable = [s for s in d1.get("sheets",[]) if not s.get("skipped")]
    skipped    = [s for s in d1.get("sheets",[]) if s.get("skipped")]
    ok(f"Preview نجح — {len(importable)} قابل للاستيراد | {len(skipped)} متخطى")
    total_good = sum(s.get("ok_rows_count",0) + s.get("warning_rows_count",0) for s in importable)
    total_err  = sum(s.get("error_rows_count",0) for s in importable)
    print(f"    صفوف سليمة: {total_good} | صفوف خاطئة: {total_err}")
    for s in skipped:
        print(f"    ⏭️  [{s['sheet']}]: {s.get('skip_reason','')[:80]}")

    if total_good == 0:
        warn("لا توجد صفوف سليمة — تخطي اختبارات الاستيراد")
        return

    # ── Test 2: Batch count before import ─────────────────────────────────────
    sub("Test 2: Batches قبل الاستيراد")
    batches_before = get_batches()
    print(f"    Batches موجودة: {len(batches_before)}")

    # ── Test 3: Import ─────────────────────────────────────────────────────────
    sub("Test 3: استيراد الصفوف السليمة")
    # Collect good rows from preview
    import_rows = []
    for s in importable:
        for row_src in ["sample"]:
            for rr in s.get(row_src, []):
                if rr.get("status") in ("ok", "warning"):
                    import_rows.append({
                        "date": rr.get("date"), "amount": rr.get("amount", 0),
                        "vat": rr.get("vat", 0), "net": rr.get("net", 0),
                        "partner": rr.get("partner"), "doc_number": rr.get("doc_number"),
                        "tx_type": rr.get("tx_type", rr.get("transaction_type", "sale")),
                        "description": rr.get("desc", ""),
                    })

    if not import_rows:
        warn("لا توجد صفوف في sample — تخطي الاستيراد الفعلي")
    else:
        rc3 = confirm_import(import_rows, os.path.basename(file_path), good_only=True)
        if rc3.status_code == 200:
            d3 = rc3.json()
            imported_count = d3.get("imported_count", 0)
            batch_id       = d3.get("batch_id")
            ok(f"استيراد نجح — {imported_count} صف | batch_id={batch_id}")

            # ── Test 4: Trial balance after import ──────────────────────────
            sub("Test 4: Trial Balance بعد الاستيراد")
            tb = get_trial_balance()
            debit  = tb.get("total_debit", 0)
            credit = tb.get("total_credit", 0)
            diff   = abs(debit - credit)
            sym = G+"✅"+RST if diff < 0.01 else R+"❌"+RST
            print(f"    Debit:  {debit:>15,.2f}")
            print(f"    Credit: {credit:>15,.2f}")
            print(f"    Diff:   {diff:>15,.2f}  {sym}")

            # ── Test 5: Double upload (should detect duplicates) ────────────
            sub("Test 5: رفع نفس الملف مرة ثانية")
            r_dup = upload_preview(file_path, os.path.basename(file_path))
            if r_dup.status_code == 200:
                d_dup = r_dup.json()
                dup_sheets = [s for s in d_dup.get("sheets",[])
                              if "مكرر" in s.get("skip_reason","")]
                if dup_sheets:
                    ok(f"Duplicate detection ✓ — {len(dup_sheets)} شيت مكرر محدد: {[s['sheet'] for s in dup_sheets]}")
                else:
                    warn("Duplicate detection لم يكتشف شيتات مكررة (قد يكون doc_number مفقود)")
            else:
                err(f"Preview 2 فشل: {r_dup.status_code}")

            # ── Test 6: Delete batch ─────────────────────────────────────────
            if batch_id:
                sub(f"Test 6: حذف الـ Batch ({batch_id})")
                del_status = delete_batch(batch_id)
                if del_status in (200, 204):
                    ok(f"حذف الـ Batch نجح (HTTP {del_status})")
                    # Verify trial balance is back to 0
                    tb2 = get_trial_balance()
                    d2_val  = tb2.get("total_debit", 0)
                    c2_val  = tb2.get("total_credit", 0)
                    diff2   = abs(d2_val - c2_val)
                    print(f"    Trial Balance بعد الحذف: Debit={d2_val:,.2f} Credit={c2_val:,.2f} Diff={diff2:,.2f}")
                else:
                    err(f"حذف الـ Batch فشل: HTTP {del_status}")

                # ── Test 7: Re-upload after delete ───────────────────────────
                sub("Test 7: إعادة رفع بعد الحذف")
                r_re = upload_preview(file_path, os.path.basename(file_path))
                if r_re.status_code == 200:
                    d_re = r_re.json()
                    reimp = [s for s in d_re.get("sheets",[]) if not s.get("skipped")]
                    ok(f"إعادة الرفع نجحت — {len(reimp)} شيت قابل للاستيراد (لا duplicate)")
                else:
                    err(f"إعادة الرفع فشلت: {r_re.status_code}")
        else:
            err(f"Confirm import فشل: {rc3.status_code} — {rc3.text[:300]}")

    print(f"\n  {G}{'─'*40}{RST}")
    print(f"  {BOLD}Edge-case tests اكتملت{RST}")


# ─── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    all_results = []

    print(f"\n{BOLD}{'═'*60}{RST}")
    print(f"{BOLD}  Universal Excel Import Engine — Real File Validation{RST}")
    print(f"{BOLD}  {len(REAL_FILES)} ملف حقيقي{RST}")
    print(f"{BOLD}{'═'*60}{RST}\n")

    for path, label in REAL_FILES:
        if not os.path.exists(path):
            print(f"{Y}⏭️  لا يوجد: {label}{RST}")
            continue
        result = analyse_file(path, label)
        r = print_file_report(result)
        all_results.append(r)

    # Performance
    performance_test()

    # Edge-case API test on the real ETA file
    eta_path = "/Users/render/Downloads/الفواتير_الإلكترونية_20-06-2026_16-29.xlsx"
    if os.path.exists(eta_path):
        api_edge_case_tests(eta_path, "فواتير إلكترونية")

    # Final summary
    hdr("📊 ملخص النهائي")
    files_ok = [r for r in all_results if not r.get("error")]
    total_importable = sum(r.get("summary",{}).get("importable_sheets",0) for r in files_ok)
    total_good = sum(r.get("summary",{}).get("total_good",0) for r in files_ok)
    total_bad  = sum(r.get("summary",{}).get("total_bad",0)  for r in files_ok)
    total_amt  = sum(r.get("summary",{}).get("total_amount",0) for r in files_ok)

    print(f"  ملفات تمت معالجتها: {len(files_ok)} / {len(all_results)}")
    print(f"  شيتات قابلة للاستيراد: {total_importable}")
    print(f"  صفوف سليمة:  {G}{total_good}{RST}")
    print(f"  صفوف خاطئة: {R}{total_bad}{RST}")
    print(f"  مجموع المبالغ: {total_amt:>18,.2f}")

    rate = total_good / (total_good + total_bad) * 100 if (total_good + total_bad) > 0 else 0
    sym = G+"✅"+RST if rate >= 90 else Y+"⚠️"+RST if rate >= 70 else R+"❌"+RST
    print(f"  نسبة نجاح الصفوف: {sym} {rate:.1f}%")

    if len(files_ok) == len(REAL_FILES):
        ok(f"جميع الملفات الحقيقية ({len(REAL_FILES)}) مرت بدون أخطاء")
    else:
        err(f"{len(REAL_FILES) - len(files_ok)} ملف فشل في الفتح")
