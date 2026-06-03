import os
import shutil
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from app.database import get_db
from app.models.document import Document, DocumentCategory
from app.core.deps import get_current_user
from app.models.user import User
from app.config import settings

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls", ".docx", ".doc", ".csv"}


def get_file_size(file_path: str) -> int:
    return os.path.getsize(file_path)


@router.get("")
async def list_documents(
    client_id: Optional[int] = None,
    category: Optional[DocumentCategory] = None,
    q: Optional[str] = None,
    year: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Document).filter(Document.is_archived == False)
    if client_id:
        query = query.filter(Document.client_id == client_id)
    if category:
        query = query.filter(Document.category == category)
    if year:
        query = query.filter(Document.year == year)
    if q:
        query = query.filter(
            or_(Document.name.ilike(f"%{q}%"), Document.tags.ilike(f"%{q}%"))
        )
    total = query.count()
    docs = query.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    def make_url(d) -> Optional[str]:
        """Return accessible URL: Drive view URL or local path."""
        if d.gdrive_view_url:
            return d.gdrive_view_url
        if not d.file_path:
            return None
        normalized = d.file_path.replace("\\", "/").lstrip("/")
        return normalized

    return {
        "total": total,
        "items": [
            {
                "id": d.id,
                "name": d.name,
                "original_name": d.original_name,
                "file_path": make_url(d),
                "file_type": d.file_type,
                "file_size": d.file_size,
                "category": d.category.lower() if isinstance(d.category, str) else (d.category.value if hasattr(d.category, 'value') else str(d.category)),
                "client_id": d.client_id,
                "client_name": d.client.name if d.client else None,
                "description": d.description,
                "tags": d.tags,
                "year": d.year,
                "month": d.month,
                "uploaded_by": d.uploader.name if d.uploader else None,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                # Drive-specific
                "gdrive_file_id": d.gdrive_file_id,
                "gdrive_view_url": d.gdrive_view_url,
                "gdrive_folder_path": d.gdrive_folder_path,
                "source": "gdrive" if d.gdrive_file_id else "upload",
            }
            for d in docs
        ],
    }


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    client_id: Optional[int] = Form(None),
    category: DocumentCategory = Form(DocumentCategory.OTHER),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    month: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"نوع الملف غير مدعوم. الأنواع المسموح بها: {', '.join(ALLOWED_EXTENSIONS)}")

    upload_dir = os.path.join(settings.UPLOAD_DIR, str(client_id or "general"))
    os.makedirs(upload_dir, exist_ok=True)

    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = os.path.join(upload_dir, safe_name)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="حجم الملف كبير جدًا (الحد الأقصى 50MB)")
        await f.write(content)

    doc = Document(
        name=file.filename,
        original_name=file.filename,
        file_path=file_path,
        file_type=ext,
        file_size=len(content),
        category=category,
        client_id=client_id,
        description=description,
        tags=tags,
        year=year,
        month=month,
        uploaded_by=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return {"id": doc.id, "name": doc.name, "file_path": doc.file_path, "message": "تم رفع الملف بنجاح"}


@router.patch("/{doc_id}")
async def update_document(
    doc_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partially update a document (client_id, category, tags, description, etc.)"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    allowed = {"client_id", "category", "description", "tags", "year", "month", "name"}
    for field, value in data.items():
        if field in allowed:
            setattr(doc, field, value)
    db.commit()
    return {"message": "تم التحديث", "id": doc.id}


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="الملف غير موجود")

    if doc.file_path and os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.commit()
    return {"message": "تم حذف الملف"}
