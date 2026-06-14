"""
Real-time WebSocket hub for multi-user live sync.
Broadcasts mutation events to all connected clients.
"""
from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["realtime"])

# Map API path → friendly entity name for the frontend
ENTITY_MAP: Dict[str, str] = {
    "clients":              "clients",
    "invoices":             "invoices",
    "collections":          "collections",
    "collection":           "collections",
    "tasks":                "tasks",
    "leads":                "leads",
    "formation":            "formation_obligations",
    "formation_obligations":"formation_obligations",
    "establishment":        "establishment",
    "obligations":          "obligations",
    "documents":            "documents",
    "payroll":              "payroll",
    "settlements":          "settlements",
    "quotations":           "quotations",
    "notifications":        "notifications",
    "mail":                 "mail",
    "folders":              "documents",
    "company_documents":    "documents",
    "dashboard":            "dashboard",
    "appointments":         "appointments",
    "assets":               "assets",
    "government-papers":    "government_papers",
    "government_papers":    "government_papers",
    "postal":               "postal",
    "statements":           "statements",
    "timesheet":            "timesheet",
    "office-services":      "office_services",
    "office_services":      "office_services",
    "accounting":           "accounting",
}

# Entities that affect dashboard counters
DASHBOARD_ENTITIES = {"clients", "invoices", "collection", "collections", "tasks", "leads", "formation", "obligations"}

# Skip broadcasting for these
SKIP_ENTITIES = {"auth", "health", "backup", "import", "ping", "eta", "config", "permissions", "audit_logs"}


class RealtimeManager:
    def __init__(self):
        self._connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)
        logger.info(f"[WS] Client connected. Total: {len(self._connections)}")

    def disconnect(self, ws: WebSocket):
        if ws in self._connections:
            self._connections.remove(ws)
        logger.info(f"[WS] Client disconnected. Total: {len(self._connections)}")

    async def broadcast(self, event: Dict[str, Any]):
        if not self._connections:
            return
        msg = json.dumps(event, ensure_ascii=False)
        dead = []
        for ws in self._connections[:]:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Singleton manager — imported by main.py middleware
manager = RealtimeManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    """WebSocket endpoint — requires valid JWT token as ?token=<jwt> query param."""
    from app.core.security import decode_token
    from app.database import SessionLocal
    from app.models.user import User

    if not token:
        await websocket.close(code=4001, reason="token required")
        logger.warning("[WS] Rejected — no token provided")
        return

    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001, reason="invalid or expired token")
        logger.warning("[WS] Rejected — invalid token")
        return

    db = SessionLocal()
    try:
        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
        if not user:
            await websocket.close(code=4001, reason="user not found or inactive")
            return
    finally:
        db.close()

    await manager.connect(websocket)
    logger.info(f"[WS] Authenticated user_id={user_id} connected")
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"[WS] Error: {e}")
        manager.disconnect(websocket)
