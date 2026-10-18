import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import decode_token
from app.models.auth_session import PORTAL_CUSTOMER, AuthSession
from app.services.session_service import CUSTOMER_COOKIE, SessionService

router = APIRouter(tags=["WebSocket Chat"])

IDLE_TIMEOUT_SECONDS = 300
MAX_MESSAGE_BYTES = 2000


def _authenticated(websocket: WebSocket) -> bool:
    # Browsers send Origin on WebSocket handshakes; reject other sites
    origin = websocket.headers.get("origin")
    if origin and origin not in settings.cors_origins_list:
        return False

    claims = decode_token(websocket.cookies.get(CUSTOMER_COOKIE, ""), "session")
    if claims is None:
        return False
    db = SessionLocal()
    try:
        session = db.get(AuthSession, claims.get("sid"))
        return SessionService.is_valid(session, PORTAL_CUSTOMER)
    finally:
        db.close()


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """Presence channel for the AI chat page (answers come from POST /ai/query).
    Requires a valid customer session and closes idle connections."""
    if not _authenticated(websocket):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    try:
        while True:
            message = await asyncio.wait_for(websocket.receive_text(), timeout=IDLE_TIMEOUT_SECONDS)
            if len(message.encode()) > MAX_MESSAGE_BYTES:
                await websocket.close(code=status.WS_1009_MESSAGE_TOO_BIG)
                return
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        try:
            await websocket.close()
        except RuntimeError:
            pass
