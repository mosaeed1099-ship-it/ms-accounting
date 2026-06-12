"""WhatsApp send + log + status — new dedicated router"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/wa", tags=["whatsapp"])


class WASendReq(BaseModel):
    phone: str
    message: str
    recipient: Optional[str] = ""
    task_id: Optional[int] = None


@router.post("/send")
async def wa_send(req: WASendReq, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.whatsapp_service import send_and_log, is_enabled
    if not is_enabled():
        raise HTTPException(400, detail="WhatsApp غير مُعيَّن — أضف GREENAPI_INSTANCE_ID و GREENAPI_TOKEN في Railway")
    result = send_and_log(db, req.phone, req.message, recipient=req.recipient, task_id=req.task_id, sent_by=current_user.name)
    if result["success"]:
        return {"success": True, "log_id": result["log_id"]}
    raise HTTPException(500, detail=result["error"] or "فشل الإرسال")


@router.get("/status")
async def wa_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.whatsapp_service import get_status
    return get_status(db)


@router.get("/logs")
async def wa_logs(limit: int = 50, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.wa_log import WALog
    from app.services.whatsapp_service import _log_dict
    logs = db.query(WALog).order_by(WALog.created_at.desc()).limit(limit).all()
    return [_log_dict(l) for l in logs]
