from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="بيانات الدخول غير صحيحة",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    user_id: int = payload.get("sub")
    if not user_id:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole):
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية للوصول لهذه الخدمة",
            )
        return current_user
    return role_checker


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="مطلوب صلاحية المدير")
    return current_user


# ── API-level Permission Check ────────────────────────────────────────────────

def check_permission(module: str, action: str = "view"):
    """
    Dependency that enforces UserPermission table at the API level.
    Admin role always passes. Other roles check user_permissions table.

    Usage:
        @router.get("/clients")
        def list_clients(
            current_user = Depends(check_permission("clients", "view"))
        ):

    Actions: view | add | edit | delete | export | approve
    """
    def _checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        # Admin bypasses all permission checks
        if current_user.role == UserRole.ADMIN:
            return current_user

        from app.models.permission import UserPermission

        # Check explicit permission row
        perm = db.query(UserPermission).filter(
            UserPermission.user_id == current_user.id,
            UserPermission.module == module,
            UserPermission.client_id == None,   # global permission
        ).first()

        if perm is None:
            # No explicit row = deny (fail-closed)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"لا تملك صلاحية الوصول إلى: {module}",
            )

        allowed = {
            "view":    perm.can_view,
            "add":     perm.can_add,
            "edit":    perm.can_edit,
            "delete":  perm.can_delete,
            "export":  perm.can_export,
            "approve": perm.can_approve,
        }.get(action, False)

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"ليس لديك صلاحية '{action}' في: {module}",
            )

        return current_user

    return _checker


def check_client_permission(module: str, action: str = "view"):
    """
    Like check_permission but also checks per-client restrictions.
    Pass client_id as a path parameter — the dependency reads it from the request.

    Usage:
        @router.get("/clients/{client_id}/invoices")
        def get_invoices(
            client_id: int,
            current_user = Depends(check_client_permission("invoices", "view"))
        ):
    """
    def _checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.role == UserRole.ADMIN:
            return current_user

        from app.models.permission import UserPermission

        # First check global module permission
        global_perm = db.query(UserPermission).filter(
            UserPermission.user_id == current_user.id,
            UserPermission.module == module,
            UserPermission.client_id == None,
        ).first()

        if global_perm:
            allowed = getattr(global_perm, f"can_{action}", False)
            if allowed:
                return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"لا تملك صلاحية '{action}' في: {module}",
        )

    return _checker
