"""
Production Verification Script — System Stabilization Phase
Runs real tests against the live production API.
Usage: python3 tests/verify_production.py
"""
import time
import sys
import requests

BASE = "https://ms-accounting-api-production.up.railway.app"
ADMIN_EMAIL = "ms.owner@mshq.io"
ADMIN_PASS  = "MS@QVj8ebqSw1iAOdLR#26"

PASS = "✅ PASS"
FAIL = "❌ FAIL"
WARN = "⚠️  WARN"

results = []

def record(name, status, detail=""):
    results.append((name, status, detail))
    print(f"  {status}  {name}")
    if detail:
        print(f"       {detail}")

def get_token():
    r = requests.post(f"{BASE}/api/auth/login",
        data={"username": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=10)
    if r.status_code == 200:
        return r.json()["access_token"]
    return None


# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  MS Accounting — Production Verification")
print("="*60)

# 0. Health Check
print("\n[0] Health & Version")
r = requests.get(f"{BASE}/health", timeout=10)
if r.status_code == 200:
    data = r.json()
    version = data.get("version", "unknown")
    db = data.get("db", "unknown")
    record("API is up", PASS, f"version={version} db={db}")
    if version != "2.4.0-security":
        record("Version is 2.4.0-security", WARN, f"Got: {version} — new code may not be deployed yet")
    else:
        record("Version is 2.4.0-security", PASS)
else:
    record("API is up", FAIL, f"HTTP {r.status_code}")
    print("\n❌ API is down. Aborting.")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
print("\n[1] Rate Limiting — Brute Force Test")
ATTACK_EMAIL = f"bruteforce_test_{int(time.time())}@attacker.com"
blocked_at = None
for i in range(15):
    r = requests.post(f"{BASE}/api/auth/login",
        data={"username": ATTACK_EMAIL, "password": f"wrongpass{i}"},
        timeout=10)
    if r.status_code == 429:
        blocked_at = i + 1
        break

if blocked_at:
    record("Brute-force blocked", PASS, f"Blocked after {blocked_at} attempts")
    # Check Retry-After header
    if "retry-after" in r.headers:
        record("Retry-After header present", PASS, f"Value: {r.headers['retry-after']}s")
    else:
        record("Retry-After header present", FAIL, "Header missing from 429 response")
    # Check error message is in Arabic
    detail = r.json().get("detail", "")
    if "محاولات" in detail or "مقفل" in detail or "كثيرة" in detail:
        record("Arabic error message", PASS)
    else:
        record("Arabic error message", WARN, f"Got: {detail}")
else:
    record("Brute-force blocked", FAIL, "Made 15 failed requests — NOT blocked")

# Verify valid login still works AFTER attack (different user/IP slot)
time.sleep(1)
token = get_token()
if token:
    record("Valid login works after attack", PASS)
else:
    record("Valid login works after attack", FAIL, "Admin login blocked (collateral damage)")


# ─────────────────────────────────────────────────────────────────────────────
print("\n[2] CORS — Domain Restriction Test")
EVIL_ORIGIN = "https://evil-attacker-site.com"
GOOD_ORIGIN = "https://mosaeed1099-ship-it.github.io"
LOCALHOST   = "http://localhost:5173"

r_evil = requests.options(f"{BASE}/api/clients",
    headers={"Origin": EVIL_ORIGIN, "Access-Control-Request-Method": "GET"}, timeout=10)
evil_origin_header = r_evil.headers.get("access-control-allow-origin", "")
if evil_origin_header in ("", "*", EVIL_ORIGIN):
    if evil_origin_header == EVIL_ORIGIN or evil_origin_header == "*":
        record("Evil origin blocked", FAIL, f"Server returned: '{evil_origin_header}'")
    else:
        record("Evil origin blocked", PASS, "No ACAO header returned")
else:
    record("Evil origin blocked", PASS, f"ACAO='{evil_origin_header}'")

r_good = requests.options(f"{BASE}/api/clients",
    headers={"Origin": GOOD_ORIGIN, "Access-Control-Request-Method": "GET"}, timeout=10)
good_header = r_good.headers.get("access-control-allow-origin", "")
if good_header == GOOD_ORIGIN:
    record("GitHub Pages origin allowed", PASS)
else:
    record("GitHub Pages origin allowed", FAIL, f"Got: '{good_header}'")

r_local = requests.options(f"{BASE}/api/clients",
    headers={"Origin": LOCALHOST, "Access-Control-Request-Method": "GET"}, timeout=10)
local_header = r_local.headers.get("access-control-allow-origin", "")
if local_header == LOCALHOST:
    record("Localhost dev origin allowed", PASS)
else:
    record("Localhost dev origin allowed", FAIL, f"Got: '{local_header}'")


# ─────────────────────────────────────────────────────────────────────────────
print("\n[3] WebSocket Authentication")
try:
    import websockets
    import asyncio

    async def test_ws_no_token():
        try:
            async with websockets.connect(f"wss://ms-accounting-api-production.up.railway.app/ws",
                                          open_timeout=5) as ws:
                await asyncio.wait_for(ws.recv(), timeout=3)
            return False  # Connected — bad
        except Exception:
            return True   # Rejected — good

    async def test_ws_bad_token():
        try:
            async with websockets.connect(
                f"wss://ms-accounting-api-production.up.railway.app/ws?token=GARBAGE_TOKEN_12345",
                open_timeout=5) as ws:
                await asyncio.wait_for(ws.recv(), timeout=3)
            return False
        except Exception:
            return True

    async def test_ws_valid_token(token):
        try:
            async with websockets.connect(
                f"wss://ms-accounting-api-production.up.railway.app/ws?token={token}",
                open_timeout=8) as ws:
                await ws.send("ping")
                resp = await asyncio.wait_for(ws.recv(), timeout=5)
                return resp == "pong"
        except Exception as e:
            return False

    loop = asyncio.new_event_loop()
    no_tok = loop.run_until_complete(test_ws_no_token())
    bad_tok = loop.run_until_complete(test_ws_bad_token())
    valid_tok = loop.run_until_complete(test_ws_valid_token(token)) if token else False
    loop.close()

    record("WS rejects no-token", PASS if no_tok else FAIL)
    record("WS rejects invalid token", PASS if bad_tok else FAIL)
    record("WS accepts valid JWT", PASS if valid_tok else FAIL,
           "(old version: no auth required)" if not valid_tok else "")

except ImportError:
    record("WebSocket tests", WARN, "websockets package not installed — skipping")


# ─────────────────────────────────────────────────────────────────────────────
print("\n[4] Audit Trail — Mutation Logging")
if token:
    headers = {"Authorization": f"Bearer {token}"}

    # Get latest audit log ID before test
    r_before = requests.get(f"{BASE}/api/audit-logs?limit=1", headers=headers, timeout=10)
    before_id = 0
    if r_before.status_code == 200 and r_before.json():
        before_id = r_before.json()[0].get("id", 0)

    # Perform a mutation (create then immediately check for log)
    test_name = f"AUDIT_TEST_{int(time.time())}"
    r_mut = requests.post(f"{BASE}/api/tasks", json={
        "title": test_name,
        "description": "Audit trail verification test",
        "priority": "normal",
        "status": "todo",
    }, headers=headers, timeout=10)
    # Any response (200, 201, 422) = request was made and should be logged

    time.sleep(2)  # Give async log time to write

    r_after = requests.get(f"{BASE}/api/audit-logs?limit=5", headers=headers, timeout=10)
    if r_after.status_code == 200 and r_after.json():
        after_id = r_after.json()[0].get("id", 0)
        if after_id > before_id:
            record("Mutation creates audit log", PASS, f"New log ID: {after_id}")
            # Verify log contents
            latest = r_after.json()[0]
            has_method = "method" in latest or "action" in latest
            has_user = latest.get("user_id") or latest.get("user")
            record("Audit log has method field", PASS if has_method else WARN)
            record("Audit log has user identity", PASS if has_user else WARN,
                   "user_id not captured" if not has_user else "")
        else:
            record("Mutation creates audit log", FAIL,
                   f"No new log entry. Before={before_id} After={after_id}")
    else:
        record("Audit log endpoint accessible", FAIL, f"HTTP {r_after.status_code}")


# ─────────────────────────────────────────────────────────────────────────────
print("\n[5] API Direct Bypass Test (Permissions)")
if token:
    headers = {"Authorization": f"Bearer {token}"}

    # Admin should access everything
    r = requests.get(f"{BASE}/api/clients", headers=headers, timeout=10)
    record("Admin can access /api/clients", PASS if r.status_code == 200 else FAIL,
           f"HTTP {r.status_code}")

    # No token = 401 (not 200 or 500)
    r_no_auth = requests.get(f"{BASE}/api/clients", timeout=10)
    if r_no_auth.status_code == 401:
        record("No-token request blocked (401)", PASS)
    else:
        record("No-token request blocked", FAIL, f"Got HTTP {r_no_auth.status_code} (expected 401)")

    # Expired/garbage token = 401
    r_bad_token = requests.get(f"{BASE}/api/clients",
        headers={"Authorization": "Bearer GARBAGE.TOKEN.HERE"}, timeout=10)
    if r_bad_token.status_code == 401:
        record("Garbage token blocked (401)", PASS)
    else:
        record("Garbage token blocked", FAIL, f"Got HTTP {r_bad_token.status_code}")

    # Check if user_permissions table enforcement is active
    # (This requires a non-admin user — we only have admin for now)
    record("Per-user permission enforcement", WARN,
           "Cannot test without a non-admin test user — create one to verify")


# ─────────────────────────────────────────────────────────────────────────────
print("\n[6] Real-time Broadcast — WebSocket Event Test")
try:
    import asyncio, websockets as ws_lib

    received_events = []

    async def listen_and_trigger(token):
        async with ws_lib.connect(
            f"wss://ms-accounting-api-production.up.railway.app/ws?token={token}",
            open_timeout=8) as ws:
            # Trigger a mutation in a separate coroutine
            async def do_mutation():
                await asyncio.sleep(0.5)
                requests.post(f"{BASE}/api/tasks", json={
                    "title": f"WS_REALTIME_TEST_{int(time.time())}",
                    "priority": "normal", "status": "todo"
                }, headers={"Authorization": f"Bearer {token}"})

            mutation_task = asyncio.create_task(do_mutation())
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=6)
                received_events.append(msg)
            except asyncio.TimeoutError:
                pass
            await mutation_task

    if token:
        loop2 = asyncio.new_event_loop()
        loop2.run_until_complete(listen_and_trigger(token))
        loop2.close()

        if received_events:
            import json
            try:
                event = json.loads(received_events[0])
                record("Real-time broadcast received", PASS, f"entity={event.get('entity')} action={event.get('action')}")
            except Exception:
                record("Real-time broadcast received", PASS, f"raw: {received_events[0][:80]}")
        else:
            record("Real-time broadcast received", FAIL, "No WS event received within 6s after mutation")
    else:
        record("Real-time test", WARN, "No token — skipping")

except ImportError:
    record("Real-time test", WARN, "websockets not installed")
except Exception as e:
    record("Real-time test", FAIL, str(e)[:100])


# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  SUMMARY")
print("="*60)
passed = sum(1 for _, s, _ in results if "PASS" in s)
failed = sum(1 for _, s, _ in results if "FAIL" in s)
warned = sum(1 for _, s, _ in results if "WARN" in s)
total  = len(results)
print(f"\n  Total: {total}  |  ✅ {passed}  |  ❌ {failed}  |  ⚠️  {warned}\n")

if failed > 0:
    print("  FAILED tests:")
    for name, status, detail in results:
        if "FAIL" in status:
            print(f"    - {name}: {detail}")

print()
