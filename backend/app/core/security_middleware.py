"""
Security Middleware — Rate Limiting + Audit Logging
Centralized security layer for MS Accounting backend.
"""
import time
import asyncio
import logging
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# ── In-memory rate limit store ────────────────────────────────────────────────
# Structure: { ip: (request_count, window_start_timestamp) }
_rate_store: Dict[str, Tuple[int, float]] = defaultdict(lambda: (0, time.time()))
_rate_lock = asyncio.Lock()

# ── Per-route limits ──────────────────────────────────────────────────────────
RATE_RULES = {
    "/api/auth/login":           {"max_requests": 10, "window_seconds": 60},   # 10/min per IP
    "/api/auth/change-password": {"max_requests": 5,  "window_seconds": 60},
    "/api/backup":               {"max_requests": 3,  "window_seconds": 60},
    "/api/import":               {"max_requests": 5,  "window_seconds": 60},
}

# Default for all other API routes (wide open on purpose, prevents runaway scripts)
DEFAULT_RATE = {"max_requests": 300, "window_seconds": 60}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter. Blocks by IP per route."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        rule = None
        for route_prefix, r in RATE_RULES.items():
            if path.startswith(route_prefix):
                rule = r
                break
        if rule is None:
            rule = DEFAULT_RATE

        ip = self._get_client_ip(request)
        key = f"{ip}:{path.split('?')[0]}"

        async with _rate_lock:
            count, window_start = _rate_store[key]
            now = time.time()

            if now - window_start > rule["window_seconds"]:
                # New window
                _rate_store[key] = (1, now)
            else:
                count += 1
                _rate_store[key] = (count, window_start)
                if count > rule["max_requests"]:
                    retry_after = int(rule["window_seconds"] - (now - window_start)) + 1
                    logger.warning(f"[rate-limit] BLOCKED {ip} → {path} ({count} reqs)")
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "طلبات كثيرة جداً. حاول مجدداً بعد قليل."},
                        headers={"Retry-After": str(retry_after)},
                    )

        return await call_next(request)

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


# ── Audit logging helper ──────────────────────────────────────────────────────
# Routes that should NOT be audit-logged (reads and infra)
_AUDIT_SKIP_METHODS = {"GET", "HEAD", "OPTIONS"}
_AUDIT_SKIP_PREFIXES = {
    "/health", "/api/auth/login", "/api/auth/me",
    "/api/dashboard", "/api/notifications", "/ws",
    "/uploads", "/static",
}
# Sensitive operations that must ALWAYS be logged regardless of method
_AUDIT_FORCE_LOG = {
    "/api/auth/change-password", "/api/users", "/api/permissions",
    "/api/backup", "/api/import",
}


def should_audit(method: str, path: str) -> bool:
    if method in _AUDIT_SKIP_METHODS:
        for prefix in _AUDIT_FORCE_LOG:
            if path.startswith(prefix):
                return True
        return False
    for prefix in _AUDIT_SKIP_PREFIXES:
        if path.startswith(prefix):
            return False
    return True


async def log_audit_event(request: Request, response_status: int, user_id=None, db=None):
    """Write a single audit row. Called from AuditMiddleware — never raises."""
    if not should_audit(request.method, request.url.path):
        return
    try:
        from app.models.audit_log import AuditLog
        from app.database import SessionLocal

        db_local = db or SessionLocal()
        close_db = db is None
        try:
            parts = request.url.path.strip("/").split("/")
            entity_type = parts[1] if len(parts) > 1 else "unknown"
            entity_id = None
            if len(parts) > 2 and parts[2].isdigit():
                entity_id = int(parts[2])

            row = AuditLog(
                user_id=user_id,
                method=request.method,
                path=request.url.path,
                entity_type=entity_type,
                entity_id=entity_id,
                status_code=response_status,
                ip_address=RateLimitMiddleware._get_client_ip(request),
                user_agent=request.headers.get("User-Agent", "")[:200],
            )
            db_local.add(row)
            db_local.commit()
        finally:
            if close_db:
                db_local.close()
    except Exception as exc:
        logger.warning(f"[audit] log failed: {exc}")
