from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel
from datetime import date, datetime
from app.database import get_db
from app.models.task import Task, TaskComment, TaskStatus, TaskPriority, TaskCategory
from app.models.activity import ActivityLog
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    client_id: Optional[int] = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    category: TaskCategory = TaskCategory.OTHER
    due_date: Optional[date] = None
    estimated_hours: Optional[int] = None
    assigned_to: Optional[int] = None
    tags: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    client_id: Optional[int] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    category: Optional[TaskCategory] = None
    due_date: Optional[date] = None
    estimated_hours: Optional[int] = None
    actual_hours: Optional[int] = None
    assigned_to: Optional[int] = None
    tags: Optional[str] = None


class CommentCreate(BaseModel):
    content: str


def task_to_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "client_id": task.client_id,
        "client_name": task.client.name if task.client else None,
        "status": task.status,
        "priority": task.priority,
        "category": task.category,
        "due_date": task.due_date,
        "completed_at": task.completed_at,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "tags": task.tags,
        "assigned_to": task.assigned_to,
        "assigned_to_name": task.assigned_to_user.name if task.assigned_to_user else None,
        "created_by": task.created_by,
        "created_by_name": task.created_by_user.name if task.created_by_user else None,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "comments_count": len(task.comments),
    }


@router.get("")
async def list_tasks(
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    category: Optional[TaskCategory] = None,
    assigned_to: Optional[int] = None,
    client_id: Optional[int] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Task)
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    if category:
        query = query.filter(Task.category == category)
    if assigned_to:
        query = query.filter(Task.assigned_to == assigned_to)
    if client_id:
        query = query.filter(Task.client_id == client_id)
    if q:
        query = query.filter(Task.title.ilike(f"%{q}%"))

    total = query.count()
    tasks = query.order_by(Task.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "items": [task_to_dict(t) for t in tasks]}


@router.get("/board")
async def tasks_board(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = {}
    board_statuses = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.CANCELLED]
    for status in board_statuses:
        tasks = db.query(Task).filter(Task.status == status).order_by(Task.priority.desc()).limit(50).all()
        result[status] = [task_to_dict(t) for t in tasks]
    return result


@router.get("/my")
async def my_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = (
        db.query(Task)
        .filter(Task.assigned_to == current_user.id, Task.status != TaskStatus.DONE)
        .order_by(Task.due_date.asc())
        .all()
    )
    return [task_to_dict(t) for t in tasks]


@router.get("/{task_id}")
async def get_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    data = task_to_dict(task)
    data["comments"] = [
        {
            "id": c.id,
            "content": c.content,
            "user_id": c.user_id,
            "user_name": c.user.name if c.user else None,
            "created_at": c.created_at,
        }
        for c in task.comments
    ]
    return data


@router.post("")
async def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = Task(**data.dict(), created_by=current_user.id)
    db.add(task)
    db.commit()
    db.refresh(task)

    # ── Email notification: task assigned ──────────────────────────────────
    if task.assigned_to and task.assigned_to != current_user.id:
        assignee = db.query(User).filter(User.id == task.assigned_to).first()
        if assignee and assignee.email:
            try:
                from app.services.email_service import notify_task_assigned
                client_name = task.client.name if task.client else None
                due_str = task.due_date.strftime('%Y/%m/%d') if task.due_date else None
                notify_task_assigned(
                    to_email=assignee.email,
                    task_title=task.title,
                    assigned_to=assignee.name,
                    assigned_by=current_user.name,
                    client_name=client_name,
                    due_date=due_str,
                    priority=task.priority.value if hasattr(task.priority, 'value') else str(task.priority),
                    description=task.description,
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Email notification failed: {e}")

    return task_to_dict(task)


@router.put("/{task_id}")
async def update_task(
    task_id: int,
    data: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")

    updates = data.dict(exclude_none=True)
    if "status" in updates and updates["status"] == TaskStatus.DONE and task.status != TaskStatus.DONE:
        task.completed_at = datetime.utcnow()

    prev_assigned_to = task.assigned_to
    for field, value in updates.items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)

    # ── Email notification: assignee changed ──────────────────────────────
    new_assigned_to = task.assigned_to
    if new_assigned_to and new_assigned_to != prev_assigned_to and new_assigned_to != current_user.id:
        assignee = db.query(User).filter(User.id == new_assigned_to).first()
        if assignee and assignee.email:
            try:
                from app.services.email_service import notify_task_assigned
                client_name = task.client.name if task.client else None
                due_str = task.due_date.strftime('%Y/%m/%d') if task.due_date else None
                notify_task_assigned(
                    to_email=assignee.email,
                    task_title=task.title,
                    assigned_to=assignee.name,
                    assigned_by=current_user.name,
                    client_name=client_name,
                    due_date=due_str,
                    priority=task.priority.value if hasattr(task.priority, 'value') else str(task.priority),
                    description=task.description,
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Email notification failed: {e}")

    return task_to_dict(task)


@router.delete("/{task_id}")
async def delete_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    db.delete(task)
    db.commit()
    return {"message": "تم حذف المهمة"}


@router.post("/{task_id}/comments")
async def add_comment(
    task_id: int,
    data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    comment = TaskComment(task_id=task_id, user_id=current_user.id, content=data.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {"id": comment.id, "content": comment.content, "user_name": current_user.name, "created_at": comment.created_at}
