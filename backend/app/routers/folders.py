"""
إدارة الملفات والمجلدات
"""
import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.folder import Folder, FileItem
from app.models.client import Client
from app.core.deps import get_current_user, require_admin
from app.models.user import User, UserRole
from app.config import settings

router = APIRouter(prefix="/api/folders", tags=["folders"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class FolderCreate(BaseModel):
    name: str
    client_id: Optional[int] = None
    parent_id: Optional[int] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def folder_to_dict(f: Folder, include_children: bool = False) -> dict:
    d = {
        "id": f.id,
        "name": f.name,
        "client_id": f.client_id,
        "parent_id": f.parent_id,
        "path": f.path,
        "created_by": f.created_by,
        "creator_name": f.creator.name if f.creator else None,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "file_count": len(f.files),
    }
    if include_children:
        d["children"] = [folder_to_dict(c) for c in f.children]
    return d


def file_to_dict(fi: FileItem) -> dict:
    return {
        "id": fi.id,
        "name": fi.name,
        "original_name": fi.original_name,
        "file_path": fi.file_path,
        "file_size": fi.file_size,
        "mime_type": fi.mime_type,
        "folder_id": fi.folder_id,
        "client_id": fi.client_id,
        "uploaded_by": fi.uploaded_by,
        "uploader_name": fi.uploader.name if fi.uploader else None,
        "description": fi.description,
        "created_at": fi.created_at.isoformat() if fi.created_at else None,
    }


def _build_path(db: Session, folder: Folder) -> str:
    parts = [folder.name]
    current = folder
    while current.parent_id:
        parent = db.query(Folder).filter(Folder.id == current.parent_id).first()
        if not parent:
            break
        parts.insert(0, parent.name)
        current = parent
    return " / ".join(parts)


# ─── Folder endpoints ─────────────────────────────────────────────────────────

@router.get("")
def list_folders(
    client_id: Optional[int] = Query(None),
    parent_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Folder)
    if client_id is not None:
        q = q.filter(Folder.client_id == client_id)
    if parent_id is not None:
        q = q.filter(Folder.parent_id == parent_id)
    else:
        q = q.filter(Folder.parent_id.is_(None))
    folders = q.order_by(Folder.name).all()
    return [folder_to_dict(f, include_children=False) for f in folders]


@router.get("/{folder_id}")
def get_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f:
        raise HTTPException(404, "المجلد غير موجود")
    result = folder_to_dict(f)
    result["files"] = [file_to_dict(fi) for fi in f.files]
    result["children"] = [folder_to_dict(c) for c in f.children]
    return result


@router.post("")
def create_folder(
    data: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    f = Folder(
        name       = data.name,
        client_id  = data.client_id,
        parent_id  = data.parent_id,
        created_by = current_user.id,
    )
    db.add(f)
    db.flush()
    f.path = _build_path(db, f)
    db.commit()
    db.refresh(f)
    return folder_to_dict(f)


@router.put("/{folder_id}")
def update_folder(
    folder_id: int,
    data: FolderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f:
        raise HTTPException(404, "المجلد غير موجود")
    if data.name:
        f.name = data.name
        f.path = _build_path(db, f)
    db.commit()
    db.refresh(f)
    return folder_to_dict(f)


@router.delete("/{folder_id}")
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Only admins can delete folders (cascades to files)."""
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f:
        raise HTTPException(404, "المجلد غير موجود")
    db.delete(f)
    db.commit()
    return {"ok": True}


# ─── File endpoints ────────────────────────────────────────────────────────────

@router.post("/{folder_id}/upload")
async def upload_file(
    folder_id: int,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(404, "المجلد غير موجود")

    dest_dir = os.path.join(settings.UPLOAD_DIR, "folders", str(folder_id))
    os.makedirs(dest_dir, exist_ok=True)
    safe_name = file.filename or "unnamed"
    dest = os.path.join(dest_dir, safe_name)
    # Avoid overwriting
    counter = 1
    base, ext = os.path.splitext(safe_name)
    while os.path.exists(dest):
        dest = os.path.join(dest_dir, f"{base}_{counter}{ext}")
        counter += 1

    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    fi = FileItem(
        name          = os.path.basename(dest),
        original_name = file.filename,
        file_path     = dest,
        file_size     = len(content),
        mime_type     = file.content_type,
        folder_id     = folder_id,
        client_id     = folder.client_id,
        uploaded_by   = current_user.id,
        description   = description,
    )
    db.add(fi)
    db.commit()
    db.refresh(fi)
    return file_to_dict(fi)


@router.post("/upload")
async def upload_file_no_folder(
    file: UploadFile = File(...),
    client_id: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file without a specific folder (root level)."""
    dest_dir = os.path.join(settings.UPLOAD_DIR, "folders", "root")
    if client_id:
        dest_dir = os.path.join(settings.UPLOAD_DIR, "folders", f"client_{client_id}")
    os.makedirs(dest_dir, exist_ok=True)
    safe_name = file.filename or "unnamed"
    dest = os.path.join(dest_dir, safe_name)
    counter = 1
    base, ext = os.path.splitext(safe_name)
    while os.path.exists(dest):
        dest = os.path.join(dest_dir, f"{base}_{counter}{ext}")
        counter += 1

    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    fi = FileItem(
        name          = os.path.basename(dest),
        original_name = file.filename,
        file_path     = dest,
        file_size     = len(content),
        mime_type     = file.content_type,
        folder_id     = None,
        client_id     = client_id,
        uploaded_by   = current_user.id,
        description   = description,
    )
    db.add(fi)
    db.commit()
    db.refresh(fi)
    return file_to_dict(fi)


@router.get("/files/list")
def list_files(
    folder_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(FileItem)
    if folder_id is not None:
        q = q.filter(FileItem.folder_id == folder_id)
    if client_id is not None:
        q = q.filter(FileItem.client_id == client_id)
    files = q.order_by(FileItem.created_at.desc()).all()
    return [file_to_dict(f) for f in files]


@router.delete("/files/{file_id}")
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Only admins can delete files."""
    fi = db.query(FileItem).filter(FileItem.id == file_id).first()
    if not fi:
        raise HTTPException(404, "الملف غير موجود")
    # Remove from disk
    try:
        if os.path.exists(fi.file_path):
            os.remove(fi.file_path)
    except Exception:
        pass
    db.delete(fi)
    db.commit()
    return {"ok": True}


@router.put("/files/{file_id}/move")
def move_file(
    file_id: int,
    folder_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fi = db.query(FileItem).filter(FileItem.id == file_id).first()
    if not fi:
        raise HTTPException(404, "الملف غير موجود")
    if folder_id is not None:
        folder = db.query(Folder).filter(Folder.id == folder_id).first()
        if not folder:
            raise HTTPException(404, "المجلد غير موجود")
    fi.folder_id = folder_id
    db.commit()
    return file_to_dict(fi)
