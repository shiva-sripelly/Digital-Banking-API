from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket Chat"])


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
            # Do not send echo message back
            pass
    except WebSocketDisconnect:
        print("WebSocket disconnected")