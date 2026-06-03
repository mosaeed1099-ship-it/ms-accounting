"""
صلاحيات المستخدمين — RBAC لكل موديول
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from app.database import get_db
from app.models.permission import UserPermission, MODULES
from app.models.user import User, UserRole
from app.core.deps import get_current_user, require_admin

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class PermissionSet(BaseModel):
    module: str
    can_view: bool = True
    can_add: bool = False
    can_edit: bool = False
    can_delete: bool = False
    can_export: bool = False
    can_approve: bool = False
    client_id: Optional[int] = None


class BulkPermissionUpdate(BaseModel):
    user_id: int
    permissions: List[PermissionSet]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def perm_to_dict(p: UserPermission) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "module": p.module,
        "can_view": p.can_view,
        "can_add": p.can_add,
        "can_edit": p.can_edit,
        "can_delete": p.can_delete,
        "can_export": p.can_export,
        "can_approve": p.can_approve,
        "client_id": p.client_id,
    }


def _get_effective_perms(user: User, module: str, db: Session, client_id: Optional[int] = None) -> dict:
    """Admin gets full access. Others look up the permission table."""
    if user.role == UserRole.ADMIN:
        return {k: True for k in ["can_view","can_add","can_edit","can_delete","can_export","can_approve"]}

    q = db.query(UserPermission).filter(
        UserPermission.user_id == user.id,
        UserPermission.module == module,
    )
    if client_id is not None:
        # prefer client-specific row, fall back to global
        specific = q.filter(UserPermission.client_id == client_id).first()
        if specific:
            return perm_to_dict(specific)
        q = q.filter(UserPermission.client_id.is_(None))

    perm = q.first()
    if not perm:
        # default: viewer sees everything, others see nothing beyond view
        if user.role == UserRole.VIEWER:
            return {"can_view": True, "can_add": False, "can_edit": False,
                    "can_delete": False, "can_export": False, "can_approve": False}
        # accountant/manager: view+add+edit by default
        return {"can_view": True, "can_add": True, "can_edit": True,
                "can_delete": False, "can_export": True, "can_approve": False}
    return perm_to_dict(perm)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/modules")
def list_modules():
    return {"modules": MODULES}


@router.get("/user/{user_id}")
def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(403, "غير مسموح")
    perms = db.query(UserPermission).filter(UserPermission.user_id == user_id).all()
    return [perm_to_dict(p) for p in perms]


@router.get("/me")
def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's effective permissions for all modules."""
    if current_user.role == UserRole.ADMIN:
        result = {}
        for m in MODULES:
            result[m] = {k: True for k in ["can_view","can_add","can_edit","can_delete","can_export","can_approve"]}
        return result

    perms = db.query(UserPermission).filter(
        UserPermission.user_id == current_user.id,
        UserPermission.client_id.is_(None),
    ).all()
    perm_map = {p.module: perm_to_dict(p) for p in perms}

    result = {}
    for m in MODULES:
        if m in perm_map:
            result[m] = perm_map[m]
        else:
            result[m] = {
                "can_view": True,
                "can_add": current_user.role in (UserRole.MANAGER, UserRole.ACCOUNTANT),
                "can_edit": current_user.role in (UserRole.MANAGER, UserRole.ACCOUNTANT),
                "can_delete": False,
                "can_export": current_user.role in (UserRole.MANAGER, UserRole.ACCOUNTANT),
                "can_approve": current_user.role == UserRole.MANAGER,
            }
    return result


@router.post("/bulk")
def set_permissions_bulk(
    data: BulkPermissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Replace all permissions for a user (admin only)."""
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")

    for pset in data.permissions:
        if pset.module not in MODULES:
            continue
        existing = db.query(UserPermission).filter(
            UserPermission.user_id == data.user_id,
            UserPermission.module == pset.module,
            UserPermission.client_id == pset.client_id,
        ).first()

        if existing:
            existing.can_view    = pset.can_view
            existing.can_add     = pset.can_add
            existing.can_edit    = pset.can_edit
            existing.can_delete  = pset.can_delete
            existing.can_export  = pset.can_export
            existing.can_approve = pset.can_approve
        else:
            p = UserPermission(
                user_id      = data.user_id,
                module       = pset.module,
                can_view     = pset.can_view,
                can_add      = pset.can_add,
                can_edit     = pset.can_edit,
                can_delete   = pset.can_delete,
                can_export   = pset.can_export,
                can_approve  = pset.can_approve,
                client_id    = pset.client_id,
            )
            db.add(p)

    db.commit()
    perms = db.query(UserPermission).filter(UserPermission.user_id == data.user_id).all()
    return [perm_to_dict(p) for p in perms]


@router.delete("/user/{user_id}/module/{module}")
def delete_permission(
    user_id: int,
    module: str,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    q = db.query(UserPermission).filter(
        UserPermission.user_id == user_id,
        UserPermission.module == module,
        UserPermission.client_id == client_id,
    )
    p = q.first()
    if not p:
        raise HTTPException(404, "الصلاحية غير موجودة")
    db.delete(p)
    db.commit()
    return {"ok": True}
