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
    "clients":           "clients",
    "invoices":          "invoices",
    "collections":       "invoices",   # same page in frontend
    "tasks":             "tasks",
    "leads":             "leads",
    "formation":         "establishment",
    "establishment":     "establishment",
    "obligations":       "obligations",
    "documents":         "documents",
    "payroll":           "payroll",
    "settlements":       "settlements",
    "quotations":        "establishment",
    "notifications":     "notifications",
    "mail":              "mail",
    "folders":           "documents",
    "company_documents": "documents",
    "dashboard":         "dashboard",
    "collection":        "invoices",
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
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint — clients connect here to receive live events."""
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            # Clients can also send events (e.g. cursor position in future)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"[WS] Error: {e}")
        manager.disconnect(websocket)
