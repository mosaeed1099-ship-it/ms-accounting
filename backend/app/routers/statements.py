from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.statement import FinancialStatement

router = APIRouter(prefix="/api/statements", tags=["statements"])

STAGES = ["is_printed", "is_sent", "is_signed", "is_archived"]
STAGE_TS = {"is_printed": "printed_at", "is_sent": "sent_at",
            "is_signed": "signed_at", "is_archived": "archived_at"}


def _to_dict(s: FinancialStatement) -> dict:
    done = sum(1 for st in STAGES if getattr(s, st))
    return {
        "id": s.id,
        "client_id": s.client_id,
        "client_name": s.client.name if s.client else None,
        "year": s.year,
        "period": s.period,
        "statement_type": s.statement_type,
        "is_printed": s.is_printed,  "printed_at": str(s.printed_at) if s.printed_at else None,
        "is_sent":    s.is_sent,     "sent_at":    str(s.sent_at)    if s.sent_at    else None,
        "is_signed":  s.is_signed,   "signed_at":  str(s.signed_at)  if s.signed_at  else None,
        "is_archived":s.is_archived, "archived_at":str(s.archived_at)if s.archived_at else None,
        "stages_done": done,
        "stages_total": 4,
        "assigned_to": s.assigned_to,
        "assignee_name": s.assignee.name if s.assignee else None,
        "notes": s.notes,
        "created_at": str(s.created_at) if s.created_at else None,
    }


@router.get("")
def list_statements(
    year: Optional[int] = None,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(FinancialStatement)
    if year:
        q = q.filter(FinancialStatement.year == year)
    if client_id:
        q = q.filter(FinancialStatement.client_id == client_id)
    items = q.order_by(FinancialStatement.year.desc(), FinancialStatement.client_id).all()
    total = len(items)
    done = sum(1 for s in items if s.is_archived)
    return {
        "items": [_to_dict(s) for s in items],
        "summary": {"total": total, "done": done, "remaining": total - done},
    }


@router.post("")
def create_statement(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = FinancialStatement(
        client_id=body["client_id"],
        year=body["year"],
        period=body.get("period", "annual"),
        statement_type=body.get("statement_type", "balance"),
        assigned_to=body.get("assigned_to") or None,
        notes=body.get("notes"),
        created_by=current_user.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_dict(s)


@router.put("/{stmt_id}/stage")
def update_stage(
    stmt_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle a stage: body = {"stage": "is_printed", "value": true}"""
    s = db.query(FinancialStatement).filter(FinancialStatement.id == stmt_id).first()
    if not s:
        from fastapi import HTTPException
        raise HTTPException(404, "Statement not found")
    stage = body.get("stage")
    val   = bool(body.get("value", True))
    if stage in STAGES:
        setattr(s, stage, val)
        ts_field = STAGE_TS[stage]
        setattr(s, ts_field, datetime.utcnow() if val else None)
    db.commit()
    db.refresh(s)
    return _to_dict(s)


@router.put("/{stmt_id}")
def update_statement(
    stmt_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(FinancialStatement).filter(FinancialStatement.id == stmt_id).first()
    if not s:
        from fastapi import HTTPException
        raise HTTPException(404, "Statement not found")
    for f in ["year", "period", "statement_type", "notes"]:
        if f in body:
            setattr(s, f, body[f])
    if "assigned_to" in body:
        s.assigned_to = body["assigned_to"] or None
    db.commit()
    db.refresh(s)
    return _to_dict(s)


@router.delete("/{stmt_id}")
def delete_statement(
    stmt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(FinancialStatement).filter(FinancialStatement.id == stmt_id).first()
    if s:
        db.delete(s)
        db.commit()
    return {"ok": True}
