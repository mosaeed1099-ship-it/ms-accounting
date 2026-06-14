import logging
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User, UserRole
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# ── Login brute-force protection ──────────────────────────────────────────────
# Tracks failed attempts per IP: { ip: [timestamp, ...] }
_failed_attempts: dict = defaultdict(list)
_MAX_FAILURES   = 10   # max failed attempts
_WINDOW_SECONDS = 60   # within this many seconds
_LOCKOUT_SECONDS = 300  # lockout duration (5 min)
_LOCKOUT_UNTIL: dict = {}


def _check_login_rate(ip: str):
    now = time.time()
    # Still in lockout?
    locked_until = _LOCKOUT_UNTIL.get(ip, 0)
    if now < locked_until:
        retry_after = int(locked_until - now)
        logger.warning(f"[auth] LOCKED {ip} — {retry_after}s remaining")
        raise HTTPException(
            status_code=429,
            detail=f"الحساب مقفل مؤقتاً بسبب محاولات فاشلة. حاول بعد {retry_after} ثانية.",
            headers={"Retry-After": str(retry_after)},
        )
    # Prune old attempts outside window
    _failed_attempts[ip] = [t for t in _failed_attempts[ip] if now - t < _WINDOW_SECONDS]
    if len(_failed_attempts[ip]) >= _MAX_FAILURES:
        _LOCKOUT_UNTIL[ip] = now + _LOCKOUT_SECONDS
        logger.warning(f"[auth] LOCKOUT triggered for {ip} ({_MAX_FAILURES} failures)")
        raise HTTPException(
            status_code=429,
            detail=f"تم تجاوز الحد الأقصى للمحاولات. الحساب مقفل لمدة {_LOCKOUT_SECONDS // 60} دقيقة.",
            headers={"Retry-After": str(_LOCKOUT_SECONDS)},
        )


def _record_failure(ip: str):
    _failed_attempts[ip].append(time.time())


def _clear_failures(ip: str):
    _failed_attempts.pop(ip, None)
    _LOCKOUT_UNTIL.pop(ip, None)


def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    request: Request = None,
):
    ip = _get_ip(request) if request else "unknown"
    _check_login_rate(ip)

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        _record_failure(ip)
        remaining = _MAX_FAILURES - len(_failed_attempts[ip])
        logger.warning(f"[auth] Failed login for '{form_data.username}' from {ip} — {remaining} attempts left")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="البريد الإلكتروني أو كلمة المرور غير صحيحة",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="الحساب غير مفعل")

    _clear_failures(ip)
    user.last_login = datetime.utcnow()
    db.commit()

    logger.info(f"[auth] Login OK: user_id={user.id} role={user.role} from {ip}")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "avatar": user.avatar,
        },
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "role": current_user.role,
        "avatar": current_user.avatar,
        "last_login": current_user.last_login,
        "created_at": current_user.created_at,
    }


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة")
    current_user.hashed_password = get_password_hash(req.new_password)
    db.commit()
    logger.info(f"[auth] Password changed: user_id={current_user.id}")
    return {"message": "تم تغيير كلمة المرور بنجاح"}
