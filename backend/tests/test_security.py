"""
Security Tests — Rate Limiting, CORS, WebSocket Auth, Audit Trail
Run: python3 -m pytest tests/test_security.py -v
"""
import time
import pytest
import requests
import websockets
import asyncio

BASE = "https://ms-accounting-api-production.up.railway.app"
WSS  = "wss://ms-accounting-api-production.up.railway.app"

ADMIN_EMAIL = "ms.owner@mshq.io"
ADMIN_PASS  = "MS@QVj8ebqSw1iAOdLR#26"


def get_token():
    r = requests.post(f"{BASE}/api/auth/login", data={
        "username": ADMIN_EMAIL, "password": ADMIN_PASS
    })
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


# ── 1. Rate Limiting ──────────────────────────────────────────────────────────

class TestRateLimiting:
    def test_login_allows_normal_usage(self):
        """Valid login should always work (rate limiter allows 10/min)."""
        r = requests.post(f"{BASE}/api/auth/login", data={
            "username": ADMIN_EMAIL, "password": ADMIN_PASS
        })
        assert r.status_code == 200

    def test_login_rate_limit_on_bad_creds(self):
        """10+ wrong-password attempts from same IP should trigger 429."""
        blocked = False
        for i in range(15):
            r = requests.post(f"{BASE}/api/auth/login", data={
                "username": "fake@test.com", "password": f"wrongpass{i}"
            })
            if r.status_code == 429:
                blocked = True
                assert "Retry-After" in r.headers, "429 should include Retry-After header"
                break
        assert blocked, "Rate limiter did not block after 10 failed attempts"

    def test_retry_after_header_present(self):
        """After lockout, Retry-After header must be present."""
        for i in range(12):
            r = requests.post(f"{BASE}/api/auth/login", data={
                "username": "attack@test.com", "password": f"bad{i}"
            })
            if r.status_code == 429:
                assert "Retry-After" in r.headers
                assert int(r.headers["Retry-After"]) > 0
                return
        pytest.skip("Rate limit not triggered in this test run (IP may differ)")


# ── 2. WebSocket Authentication ───────────────────────────────────────────────

class TestWebSocketAuth:
    def test_ws_rejects_no_token(self):
        """WS connection without token should be closed with code 4001."""
        async def _run():
            try:
                async with websockets.connect(f"{WSS}/ws") as ws:
                    await ws.recv()
                return False  # Should not reach here
            except (websockets.exceptions.ConnectionClosedError,
                    websockets.exceptions.InvalidStatusCode) as e:
                return True
        result = asyncio.get_event_loop().run_until_complete(_run())
        assert result, "WS should reject connection with no token"

    def test_ws_rejects_invalid_token(self):
        """WS with garbage token should be rejected."""
        async def _run():
            try:
                async with websockets.connect(f"{WSS}/ws?token=INVALID_TOKEN_XYZ") as ws:
                    await ws.recv()
                return False
            except (websockets.exceptions.ConnectionClosedError,
                    websockets.exceptions.InvalidStatusCode):
                return True
        result = asyncio.get_event_loop().run_until_complete(_run())
        assert result, "WS should reject invalid token"

    def test_ws_accepts_valid_token(self):
        """WS with valid JWT should connect and respond to ping."""
        token = get_token()
        async def _run():
            try:
                async with websockets.connect(f"{WSS}/ws?token={token}") as ws:
                    await ws.send("ping")
                    response = await asyncio.wait_for(ws.recv(), timeout=5)
                    return response == "pong"
            except Exception:
                return False
        result = asyncio.get_event_loop().run_until_complete(_run())
        assert result, "WS with valid token should connect and return pong"


# ── 3. CORS ───────────────────────────────────────────────────────────────────

class TestCORS:
    def test_cors_blocks_unknown_origin(self):
        """Request from unknown origin should not get Access-Control-Allow-Origin header."""
        r = requests.options(f"{BASE}/api/clients", headers={
            "Origin": "https://evil-site.com",
            "Access-Control-Request-Method": "GET",
        })
        origin = r.headers.get("Access-Control-Allow-Origin", "")
        assert origin != "https://evil-site.com", f"CORS allowed unknown origin: {origin}"
        assert origin != "*", "CORS wildcard still active!"

    def test_cors_allows_github_pages(self):
        """GitHub Pages origin should be allowed."""
        r = requests.options(f"{BASE}/api/clients", headers={
            "Origin": "https://mosaeed1099-ship-it.github.io",
            "Access-Control-Request-Method": "GET",
        })
        origin = r.headers.get("Access-Control-Allow-Origin", "")
        assert origin == "https://mosaeed1099-ship-it.github.io", \
            f"GitHub Pages not in allowed origins. Got: '{origin}'"

    def test_cors_allows_localhost_dev(self):
        """Localhost dev origins should be allowed."""
        r = requests.options(f"{BASE}/api/clients", headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        })
        origin = r.headers.get("Access-Control-Allow-Origin", "")
        assert origin == "http://localhost:5173", f"Localhost 5173 not allowed. Got: '{origin}'"


# ── 4. Audit Trail ────────────────────────────────────────────────────────────

class TestAuditTrail:
    def test_mutation_creates_audit_log(self):
        """POST to clients should create an audit log entry."""
        token = get_token()
        headers = {"Authorization": f"Bearer {token}"}

        # Get current audit count
        r1 = requests.get(f"{BASE}/api/audit-logs?limit=1", headers=headers)
        assert r1.status_code == 200
        before_id = r1.json()[0]["id"] if r1.json() else 0

        # Create a test client (will be deleted)
        r2 = requests.post(f"{BASE}/api/clients", json={
            "name": "Test Security Audit Client",
            "email": "security_test@test.com",
            "phone": "0500000000",
        }, headers=headers)
        # Accept 200/201/422 (422 = validation, still logs)
        assert r2.status_code in (200, 201, 422)

        time.sleep(1)  # Give async log time to write

        # Check audit log has new entries
        r3 = requests.get(f"{BASE}/api/audit-logs?limit=5", headers=headers)
        assert r3.status_code == 200
        latest_id = r3.json()[0]["id"] if r3.json() else 0
        assert latest_id > before_id, "No audit log entry created after mutation"
