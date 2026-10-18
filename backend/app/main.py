import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.routes.auth import router as auth_router
from app.api.routes.account import router as account_router
from app.api.routes.transaction import router as transaction_router
from app.api.routes.ai import router as ai_router
from app.api.routes.payments import router as payments_router
from app.api.routes.ws_chat import router as ws_router
from app.api.routes.admin import auth_router as admin_auth_router, router as admin_router
from app.services.notification_service import dispatcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# The schema is managed by Alembic (`alembic upgrade head`); the app never
# creates or alters tables on startup.

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    dispatcher.start()
    yield
    dispatcher.stop()


app = FastAPI(
    title="VELQORIN Sandbox API",
    lifespan=lifespan,
    # API docs are useful in development but not exposed in production
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Cookie sessions + SameSite already stop most CSRF; also reject any
    # browser-sent state-changing request from an origin we don't serve.
    # (Stripe webhooks are server-to-server and send no Origin header.)
    origin = request.headers.get("origin")
    if request.method in UNSAFE_METHODS and origin and origin not in settings.cors_origins_list:
        return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    if settings.is_production:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
)

app.include_router(auth_router)
app.include_router(account_router)
app.include_router(transaction_router)
app.include_router(ai_router)
app.include_router(payments_router)
app.include_router(ws_router)
app.include_router(admin_auth_router)
app.include_router(admin_router)


@app.get("/")
def root():
    return {"message": "VELQORIN sandbox API is running", "sandbox": settings.SANDBOX_MODE}
