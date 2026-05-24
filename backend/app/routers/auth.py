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


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db), request: Request = None):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="البريد الإلكتروني أو كلمة المرور غير صحيحة",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="الحساب غير مفعل")

    user.last_login = datetime.utcnow()
    db.commit()

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
    return {"message": "تم تغيير كلمة المرور بنجاح"}
