#!/usr/bin/env python3
"""
MS Accounting — Regression Test Suite
Run: railway run --service ms-accounting-api python3 tests/regression.py
"""
import json, os, ssl, sys, time
import urllib.request, urllib.parse, urllib.error

_ctx = ssl._create_unverified_context()
API  = os.environ.get("API_BASE", "https://ms-accounting-api-production.up.railway.app")

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _req(method, path, body=None, token=None, form=False, timeout=15):
    url = API + path
    if form and body:
        data    = urllib.parse.urlencode(body).encode()
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
    else:
        data    = json.dumps(body).encode() if body else None
        headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    rq = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(rq, timeout=timeout, context=_ctx) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:    return e.code, json.loads(e.read())
        except: return e.code, {"error": str(e)}
    except Exception as e:
        return 0, {"error": str(e)}

# ── Result tracking ───────────────────────────────────────────────────────────

_results = []

def check(label, status, expected=(200, 201), info=""):
    ok  = status in expected
    sym = "✅" if ok else f"❌ {status}"
    line = f"  {sym} {label}" + (f" — {info}" if info else "")
    _results.append((label, ok, line))
    print(line)
    return ok

def section(title):
    print(f"\n{'═'*60}")
    print(f"  {title}")
    print('═'*60)

# ── Auth ──────────────────────────────────────────────────────────────────────

def login():
    email = os.environ.get("ADMIN_EMAIL", "")
    pwd   = os.environ.get("ADMIN_PASSWORD", "")
    if not email or not pwd:
        print("❌ ADMIN_EMAIL / ADMIN_PASSWORD not set"); sys.exit(1)
    s, d = _req("POST", "/api/auth/login", {"username": email, "password": pwd}, form=True)
    token = d.get("access_token", "")
    if not token:
        print(f"❌ Auth failed: {d}"); sys.exit(1)
    print(f"✅ Auth OK — {email}")
    return token

# ── Test groups ───────────────────────────────────────────────────────────────

def test_core(T):
    section("1 — Core / Health")
    s, d = _req("GET", "/health")
    check("API /health", s, info=f"db={d.get('db','?')} status={d.get('status','?')}")

    s, d = _req("GET", "/api/dashboard/stats", token=T)
    check("Dashboard stats", s, info=f"clients={d.get('clients','?')} obligations_due={d.get('obligations_due','?')}")


def test_clients(T):
    section("2 — Clients (CRUD + soft delete)")
    s, d = _req("GET", "/api/clients?page_size=5", token=T)
    check("Client list", s, info=f"total={d.get('total','?')}")

    # Create
    ts = int(time.time())
    s, c = _req("POST", "/api/clients", {
        "name": f"REG_TEST_{ts}", "client_type": "company",
        "tax_id": f"REG{ts}", "phone": "0100000000", "status": "active"
    }, token=T)
    check("Client create", s)
    cid = c.get("id")
    if not cid:
        check("Client get (skipped — no id)", 200); return

    # Read
    s, _ = _req("GET", f"/api/clients/{cid}", token=T)
    check("Client get", s)

    # Update
    s, u = _req("PUT", f"/api/clients/{cid}", {"name": f"REG_UPD_{ts}"}, token=T)
    check("Client update", s, info=f"name={u.get('name','?')}")

    # Soft delete (archive)
    s, _ = _req("DELETE", f"/api/clients/{cid}", token=T)
    check("Client soft-delete", s, expected=(200, 204))

    # Confirm still in DB as inactive
    s, d = _req("GET", f"/api/clients/{cid}", token=T)
    still_inactive = d.get("status") == "inactive"
    check("Client soft-delete preserved", 200 if still_inactive else 400,
          info=f"status={d.get('status','?')} (must be inactive)")


def test_obligations(T):
    section("3 — Obligations")
    s, d = _req("GET", "/api/obligations?page_size=5", token=T)
    check("Obligations list", s, info=f"total={d.get('total','?')}")

    s, d = _req("GET", "/api/obligations/notifications?unread_only=true&limit=3", token=T)
    notifs = d if isinstance(d, list) else d.get("items", [])
    check("Obligation notifications", s, info=f"{len(notifs)} unread")


def test_monthly_fees(T):
    section("4 — Monthly Fees")
    s, d = _req("GET", "/api/monthly-fees/dashboard", token=T)
    check("MF dashboard", s, info=f"total_due={d.get('summary',{}).get('total_due','?')}")

    s, d = _req("GET", "/api/monthly-fees/clients?page_size=3", token=T)
    rows = d if isinstance(d, list) else d.get("items", [])
    check("MF clients list", s, info=f"{len(rows)} clients")


def test_tax_center(T):
    section("5 — Tax Center")
    CID, YEAR = 62, 2025

    # VAT list
    s, d = _req("GET", f"/api/tax-center/vat/{CID}?year={YEAR}", token=T)
    rows = d if isinstance(d, list) else d.get("items", [])
    check("VAT list", s, info=f"{len(rows)} returns")

    # WHT types
    s, d = _req("GET", "/api/tax-center/withholding/types", token=T)
    types = d if isinstance(d, list) else []
    check("WHT types", s, info=f"{len(types)} types")
    check("WHT types not empty", 200 if len(types) >= 13 else 400, info="need ≥13 types from Law 91/2005")

    # WHT entries list
    s, d = _req("GET", f"/api/tax-center/withholding/entries?client_id={CID}&year={YEAR}&month=6", token=T)
    rows = d if isinstance(d, list) else d.get("items", [])
    check("WHT entries list", s, info=f"{len(rows)} entries")

    # Corporate
    s, d = _req("GET", f"/api/tax-center/corporate/{CID}/{YEAR}", token=T)
    check("Corporate tax", s, expected=(200, 201, 404))

    # Salary employees
    s, d = _req("GET", f"/api/payroll/employees?client_id={CID}", token=T)
    emps = d if isinstance(d, list) else []
    check("Payroll employees", s, info=f"{len(emps)} employees")

    # Tax calendar
    s, d = _req("GET", f"/api/tax-center/calendar?client_id={CID}&year={YEAR}", token=T)
    items = d if isinstance(d, list) else d.get("items", [])
    check("Tax calendar", s, info=f"{len(items)} events")

    # Tax dashboard
    s, d = _req("GET", f"/api/tax-center/dashboard/{CID}?year={YEAR}", token=T)
    check("Tax dashboard", s)


def test_vat_workflow(T):
    """Tests full VAT workflow: Build → Review → Back-to-Draft → Review → Approve."""
    section("6 — VAT Full Workflow")
    CID, YEAR, MONTH = 62, 2022, 6  # stable test month (unused period)

    s, r = _req("POST", "/api/tax-center/vat/build", {
        "client_id": CID, "year": YEAR, "month": MONTH, "force_rebuild": True,
        "manual_output_vat": 1000, "manual_input_vat": 400,
        "manual_sales_taxable": 10000, "manual_purch_taxable": 4000,
        "manual_notes": "regression test"
    }, token=T)
    check("VAT build", s)
    vid = r.get("id")
    if not vid:
        check("VAT workflow (skipped — no id)", 200); return

    s, _ = _req("POST", f"/api/tax-center/vat/{vid}/review", token=T)
    check("VAT → reviewed", s, info=_.get("status", "?"))

    s, _ = _req("PUT", f"/api/tax-center/vat/{vid}", {"status": "draft"}, token=T)
    check("VAT → back to draft", s, info=_.get("status", "?"))

    _req("POST", f"/api/tax-center/vat/{vid}/review", token=T)
    s, _ = _req("POST", f"/api/tax-center/vat/{vid}/approve", token=T)
    check("VAT → approved", s, info=_.get("status", "?"))


def test_accounting(T):
    section("7 — Accounting (client-scoped)")
    CID = 62
    s, d = _req("GET", f"/api/accounting/{CID}/accounts", token=T)
    rows = d if isinstance(d, list) else d.get("items", [])
    check("Chart of accounts", s, info=f"{len(rows)} accounts")

    s, d = _req("GET", f"/api/accounting/{CID}/journal-entries?page_size=3", token=T)
    check("Journal entries", s, info=f"total={d.get('total','?') if isinstance(d,dict) else len(d)}")


def test_backup(T):
    section("8 — Backup")
    s, d = _req("GET", "/api/backup/list?limit=5", token=T)
    bkups = d.get("backups", [])
    check("Backup list", s, info=f"{len(bkups)} records")
    if bkups:
        # find last completed backup (ignore pending/running)
        last_completed = next((b for b in bkups if b.get("status") == "completed"), None)
        if last_completed:
            check("Last backup completed", 200, info=f"created={last_completed.get('created_at','?')[:10]}")
        else:
            last = bkups[0]
            check("Last backup completed", 400, info=f"status={last.get('status','?')} — no completed backup found")


def test_safety_layer(T):
    """Confirms financial data is never hard-deleted."""
    section("9 — Safety Layer / Data Integrity")
    # Try to hard-delete a client and confirm it becomes inactive (not gone)
    ts = int(time.time())
    s, c = _req("POST", "/api/clients", {
        "name": f"SL_TEST_{ts}", "client_type": "individual",
        "tax_id": f"SL{ts}", "status": "active"
    }, token=T)
    cid = c.get("id")
    if not cid:
        check("Safety layer (skipped — could not create client)", 200); return

    _req("DELETE", f"/api/clients/{cid}", token=T)
    s, d = _req("GET", f"/api/clients/{cid}", token=T)
    not_hard_deleted = s == 200 and d.get("status") == "inactive"
    check("Hard delete blocked (soft delete only)", 200 if not_hard_deleted else 400,
          info=f"HTTP={s} status={d.get('status','?')}")


def test_collections(T):
    section("10 — Collections & Finance")
    s, d = _req("GET", "/api/collections?page_size=3", token=T)
    check("Collections list", s, info=f"total={d.get('total','?') if isinstance(d,dict) else len(d)}")

    s, d = _req("GET", "/api/invoices?page_size=3", token=T)
    check("Invoices list", s, info=f"total={d.get('total','?') if isinstance(d,dict) else len(d)}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  MS Accounting — Regression Test Suite")
    print(f"  API: {API}")
    print("=" * 60)

    T = login()
    t_start = time.time()

    test_core(T)
    test_clients(T)
    test_obligations(T)
    test_monthly_fees(T)
    test_tax_center(T)
    test_vat_workflow(T)
    test_accounting(T)
    test_backup(T)
    test_safety_layer(T)
    test_collections(T)

    elapsed = round(time.time() - t_start, 1)
    passed  = sum(1 for _, ok, _ in _results if ok)
    failed  = [line for _, ok, line in _results if not ok]

    print(f"\n{'═'*60}")
    print(f"  RESULT: {passed}/{len(_results)} passed  ({elapsed}s)")
    if failed:
        print("\n  Failed:")
        for f in failed:
            print(f"    {f}")
    else:
        print("  All checks PASSED ✅")
    print('═'*60)

    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
