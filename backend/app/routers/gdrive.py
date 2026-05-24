"""
Google Drive Integration — استيراد الملفات من Google Drive
يدعم:
  - مجلدات عامة (public) بدون API key (scraping)
  - مجلدات خاصة + عامة مع API key (Drive API v3)
  - مطابقة تلقائية للملفات مع العملاء
  - تصنيف تلقائي للملفات
  - كشف التكرار
"""
import re
import json
import hashlib
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.document import Document, DocumentCategory
from app.models.client import Client
from app.core.deps import get_current_user
from app.models.user import User
from app.config import settings

# requests is used lazily inside functions (not imported at module level)
# to avoid import failures if the package is not installed

router = APIRouter(prefix="/api/gdrive", tags=["gdrive"])

# ─── Keyword → Category mapping ──────────────────────────────────────────────
CATEGORY_KEYWORDS = {
    DocumentCategory.COMMERCIAL_REGISTER: [
        "سجل تجاري", "سجل_تجاري", "commercial register", "commercial_register",
        "comm_reg", "سجل", "register"
    ],
    DocumentCategory.TAX_CARD: [
        "بطاقة ضريبية", "بطاقه ضريبية", "بطاقة_ضريبية", "tax card", "tax_card",
        "taxcard", "بطاقة ضريبيه", "ضريبية"
    ],
    DocumentCategory.VAT_CERTIFICATE: [
        "قيمة مضافة", "قيمة_مضافة", "vat", "ق م", "ضريبة القيمة",
        "تسجيل ضريبي", "شهادة تسجيل"
    ],
    DocumentCategory.NATIONAL_ID: [
        "بطاقة رقم قومي", "رقم قومي", "national id", "national_id",
        "بطاقة شخصية", "هوية", "id card"
    ],
    DocumentCategory.CONTRACT: [
        "عقد", "contract", "اتفاقية", "agreement", "عقود", "اتفاق"
    ],
    DocumentCategory.INVOICE: [
        "فاتورة", "invoice", "فواتير", "receipts", "ايصال", "إيصال"
    ],
    DocumentCategory.TAX_RETURN: [
        "إقرار ضريبي", "اقرار ضريبي", "tax return", "ضريبة دخل", "income tax",
        "ضريبة", "declaration"
    ],
    DocumentCategory.BANK_STATEMENT: [
        "كشف حساب", "bank statement", "بنك", "bank", "حساب بنكي"
    ],
    DocumentCategory.PAYROLL: [
        "مرتبات", "payroll", "رواتب", "salaries", "مسير رواتب"
    ],
    DocumentCategory.ESTABLISHMENT: [
        "تأسيس", "establishment", "شهادة", "تسجيل", "إنشاء", "مستندات الشركة"
    ],
    DocumentCategory.FINANCIAL_STATEMENT: [
        "قوائم مالية", "ميزانية", "financial", "balance sheet", "income statement",
        "قائمة مالية", "حسابات ختامية"
    ],
}


def detect_category(filename: str) -> DocumentCategory:
    """Auto-detect document category from filename."""
    fname_lower = filename.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in fname_lower:
                return category
    return DocumentCategory.OTHER


def normalize_name(name: str) -> str:
    """Normalize Arabic name for comparison."""
    if not name:
        return ""
    # Remove extra spaces, normalize Arabic letters
    name = name.strip()
    name = re.sub(r'\s+', ' ', name)
    # Common Arabic normalization
    name = name.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    name = name.replace('ى', 'ي').replace('ة', 'ه')
    return name.lower()


def match_client(filename: str, clients: List[Client]) -> Optional[Client]:
    """Try to match a filename to a client by fuzzy name matching."""
    fname_normalized = normalize_name(filename)
    best_match = None
    best_score = 0

    for client in clients:
        cname_normalized = normalize_name(client.name)
        # Score: longest common substring / overlap
        score = 0
        if cname_normalized in fname_normalized:
            score = len(cname_normalized)
        elif fname_normalized in cname_normalized:
            score = len(fname_normalized)
        else:
            # Check first 4 words
            cwords = cname_normalized.split()[:4]
            for word in cwords:
                if len(word) >= 3 and word in fname_normalized:
                    score += len(word)

        if score > best_score and score >= 3:
            best_score = score
            best_match = client

    return best_match


# ─── Google Drive folder parsing ─────────────────────────────────────────────

def extract_folder_id(url: str) -> Optional[str]:
    """Extract folder/file ID from various Google Drive URL formats."""
    patterns = [
        r'/folders/([a-zA-Z0-9_-]{20,})',
        r'/file/d/([a-zA-Z0-9_-]{20,})',
        r'id=([a-zA-Z0-9_-]{20,})',
        r'^([a-zA-Z0-9_-]{20,})$',  # bare ID
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def list_drive_folder_with_api(folder_id: str, api_key: str) -> List[dict]:
    """List files in a Drive folder using Google Drive API v3."""
    try:
        import requests as _requests
    except ImportError:
        raise HTTPException(status_code=500, detail="مكتبة requests غير مثبتة. تحقق من requirements.txt")
    files = []
    page_token = None

    while True:
        params = {
            'q': f"'{folder_id}' in parents and trashed=false",
            'key': api_key,  # type: ignore
            'fields': 'nextPageToken,files(id,name,mimeType,size,createdTime,parents,webViewLink,thumbnailLink)',
            'pageSize': 1000,
            'includeItemsFromAllDrives': True,
            'supportsAllDrives': True,
        }
        if page_token:
            params['pageToken'] = page_token

        resp = _requests.get('https://www.googleapis.com/drive/v3/files', params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=400,
                                detail=f"Drive API error: {resp.status_code} — {resp.text[:200]}")
        data = resp.json()
        batch = data.get('files', [])
        files.extend(batch)

        # Recursively list subfolders
        for f in batch:
            if f.get('mimeType') == 'application/vnd.google-apps.folder':
                subfiles = list_drive_folder_with_api(f['id'], api_key)
                # Add folder path to subfolder files
                for sf in subfiles:
                    sf['_folder_path'] = f['name'] + '/' + sf.get('_folder_path', '')
                files.extend(subfiles)

        page_token = data.get('nextPageToken')
        if not page_token:
            break

    return files


def list_drive_folder_public(folder_id: str) -> List[dict]:
    """
    List files from a public Google Drive folder without API key.
    Parses the embedded JSON data from the Drive folder HTML page.
    """
    try:
        import requests as _requests
    except ImportError:
        raise HTTPException(status_code=500, detail="مكتبة requests غير مثبتة")

    url = f"https://drive.google.com/drive/folders/{folder_id}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    resp = _requests.get(url, headers=headers, timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=400,
                            detail=f"تعذر الوصول إلى المجلد. تأكد أن الرابط صحيح وأن المجلد مشترك عاماً.")

    html = resp.text

    # Google Drive embeds file data in the HTML as a JSON array
    # Pattern: AF_initDataCallback({key: 'ds:3', ...data: [[ ... ]]...})
    files = []

    # Try to find the file listing data
    # Method 1: Look for the main data structure
    patterns_to_try = [
        r'window\[.AF_initDataChunkQueue.\].*?\.push\((\{.*?\})\)',
        r'AF_initDataCallback\((\{key.*?\})\)',
        r'"([a-zA-Z0-9_-]{25,})".*?"([^"]+\.[a-z]{2,4})"',  # fallback: file IDs + names
    ]

    # Simpler extraction: find all file IDs and names
    # In Drive HTML, files appear as: ["FILE_ID","FILE_NAME",...,"mimeType"...]
    file_id_pattern = r'\["([a-zA-Z0-9_-]{25,})"[^]]*?"([^"]+\.[a-zA-Z0-9]{2,5})"'
    matches = re.findall(file_id_pattern, html)

    seen_ids = set()
    for file_id, file_name in matches:
        if file_id in seen_ids:
            continue
        if len(file_id) < 25:
            continue
        seen_ids.add(file_id)

        # Detect file type from name
        ext = file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else ''
        mime_map = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc': 'application/msword',
        }
        mime = mime_map.get(ext, 'application/octet-stream')

        files.append({
            'id': file_id,
            'name': file_name,
            'mimeType': mime,
            'size': None,
            'webViewLink': f'https://drive.google.com/file/d/{file_id}/view',
            '_folder_path': '',
        })

    if not files:
        raise HTTPException(
            status_code=400,
            detail="لم يتم العثور على ملفات في المجلد. تأكد أن الرابط صحيح وأن المجلد مشترك عاماً (anyone with link)."
        )

    return files


def get_drive_download_url(file_id: str) -> str:
    """Get direct download URL for a public Drive file."""
    return f"https://drive.google.com/uc?export=download&id={file_id}"


def get_drive_view_url(file_id: str) -> str:
    """Get view URL for a Drive file."""
    return f"https://drive.google.com/file/d/{file_id}/view"


# ─── Pydantic models ──────────────────────────────────────────────────────────

class DriveFile(BaseModel):
    id: str
    name: str
    mime_type: Optional[str] = None
    size: Optional[int] = None
    view_url: str
    folder_path: Optional[str] = None
    suggested_category: str
    suggested_client_id: Optional[int] = None
    suggested_client_name: Optional[str] = None
    is_duplicate: bool = False
    duplicate_doc_id: Optional[int] = None


class ScanRequest(BaseModel):
    folder_url: str
    api_key: Optional[str] = None  # Google Drive API key (optional for public folders)


class ScanResponse(BaseModel):
    folder_id: str
    total_files: int
    files: List[DriveFile]
    unmatched_files: int
    matched_files: int


class ImportFileRequest(BaseModel):
    gdrive_file_id: str
    name: str
    client_id: Optional[int] = None
    category: str = "other"
    folder_path: Optional[str] = None
    mime_type: Optional[str] = None
    size: Optional[int] = None


class ImportRequest(BaseModel):
    files: List[ImportFileRequest]


class ImportResult(BaseModel):
    imported: int
    skipped_duplicates: int
    errors: List[str]


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/scan", response_model=ScanResponse)
async def scan_folder(
    req: ScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Scan a Google Drive folder and return file list with auto-matching.
    Works with public folders (no API key needed).
    For private folders, provide an API key.
    """
    folder_id = extract_folder_id(req.folder_url)
    if not folder_id:
        raise HTTPException(status_code=400, detail="رابط Google Drive غير صالح")

    # Get file listing
    api_key = req.api_key or settings.GOOGLE_DRIVE_API_KEY
    if api_key:
        raw_files = list_drive_folder_with_api(folder_id, api_key)
    else:
        raw_files = list_drive_folder_public(folder_id)

    # Filter out folders
    raw_files = [f for f in raw_files
                 if f.get('mimeType') != 'application/vnd.google-apps.folder']

    # Load all clients for matching
    clients = db.query(Client).filter(Client.status == 'active').all()

    # Load existing docs for duplicate detection
    existing_gdrive_ids = {
        d.gdrive_file_id
        for d in db.query(Document.gdrive_file_id).filter(
            Document.gdrive_file_id.isnot(None)
        ).all()
    }

    result_files = []
    matched = 0
    unmatched = 0

    for f in raw_files:
        file_id = f['id']
        name = f['name']

        # Detect category
        category = detect_category(name)

        # Match client
        client = match_client(name, clients)
        if client:
            matched += 1
        else:
            unmatched += 1

        # Check duplicate
        is_dup = file_id in existing_gdrive_ids
        dup_doc_id = None
        if is_dup:
            dup_doc = db.query(Document).filter(Document.gdrive_file_id == file_id).first()
            dup_doc_id = dup_doc.id if dup_doc else None

        folder_path = f.get('_folder_path', '') or f.get('webViewLink', '')

        result_files.append(DriveFile(
            id=file_id,
            name=name,
            mime_type=f.get('mimeType'),
            size=int(f['size']) if f.get('size') else None,
            view_url=f.get('webViewLink') or get_drive_view_url(file_id),
            folder_path=f.get('_folder_path', ''),
            suggested_category=category.value,
            suggested_client_id=client.id if client else None,
            suggested_client_name=client.name if client else None,
            is_duplicate=is_dup,
            duplicate_doc_id=dup_doc_id,
        ))

    return ScanResponse(
        folder_id=folder_id,
        total_files=len(result_files),
        files=result_files,
        matched_files=matched,
        unmatched_files=unmatched,
    )


@router.post("/import", response_model=ImportResult)
async def import_files(
    req: ImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import selected Drive files as Document records (no download, uses Drive as storage)."""
    imported = 0
    skipped_duplicates = 0
    errors = []

    for f in req.files:
        # Check duplicate
        existing = db.query(Document).filter(
            Document.gdrive_file_id == f.gdrive_file_id
        ).first()
        if existing:
            skipped_duplicates += 1
            continue

        # Validate category
        try:
            category = DocumentCategory(f.category)
        except ValueError:
            category = DocumentCategory.OTHER

        # Get extension from mime type or name
        ext_map = {
            'application/pdf': '.pdf',
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'application/vnd.ms-excel': '.xls',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        }
        file_ext = ext_map.get(f.mime_type or '', '')
        if not file_ext and '.' in f.name:
            file_ext = '.' + f.name.rsplit('.', 1)[-1].lower()

        doc = Document(
            name=f.name,
            original_name=f.name,
            file_path=None,                           # no local copy
            file_type=file_ext,
            file_size=f.size,
            category=category,
            client_id=f.client_id,
            gdrive_file_id=f.gdrive_file_id,
            gdrive_view_url=get_drive_view_url(f.gdrive_file_id),
            gdrive_mime_type=f.mime_type,
            gdrive_folder_path=f.folder_path,
            uploaded_by=current_user.id,
            is_archived=False,
        )
        db.add(doc)
        imported += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ في حفظ البيانات: {str(e)}")

    return ImportResult(
        imported=imported,
        skipped_duplicates=skipped_duplicates,
        errors=errors,
    )


@router.get("/proxy/{file_id}")
async def proxy_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the Google Drive view URL for a file (redirect)."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=get_drive_view_url(file_id))


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the Google Drive direct download URL for a file."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=get_drive_download_url(file_id))
