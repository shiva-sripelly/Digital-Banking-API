from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_admin_context, optional_context, require_admin
from app.models.auth_session import PORTAL_ADMIN
from app.core.database import get_db
from app.core.request_context import client_ip, user_agent
from app.services.admin_auth_service import AdminAuthService
from app.services.admin_service import AdminService
from app.services.session_service import ADMIN_COOKIE, SessionService

auth_router = APIRouter(prefix="/admin/auth", tags=["Admin authentication"])
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class AdminMfaRequest(BaseModel):
    mfa_token: str = Field(..., min_length=10, max_length=2048)
    code: str = Field(..., pattern=r"^\d{6}$")


class CustomerStatusRequest(BaseModel):
    is_active: bool
    reason: str = Field(..., min_length=5, max_length=300)


def _admin_user(user) -> dict:
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role, "mfa_enabled": user.mfa_enabled}


# --- Admin authentication -------------------------------------------------------

@auth_router.post("/login")
def admin_login(payload: AdminLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    result = AdminAuthService.login(db, payload.email, payload.password, client_ip(request), user_agent(request), response)
    if "user" in result:
        result = {**result, "user": _admin_user(result["user"])}
    return result


@auth_router.post("/mfa")
def admin_mfa(payload: AdminMfaRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    result = AdminAuthService.verify_mfa(
        db,
        payload.mfa_token,
        payload.code,
        request.cookies.get(ADMIN_COOKIE, ""),
        client_ip(request),
        user_agent(request),
        response,
    )
    return {**result, "user": _admin_user(result["user"])}


@auth_router.post("/logout")
def admin_logout(request: Request, response: Response, ctx: AuthContext = Depends(get_admin_context), db: Session = Depends(get_db)):
    return AdminAuthService.logout(db, ctx, response, client_ip(request))


@auth_router.get("/session")
def admin_session(request: Request, db: Session = Depends(get_db)):
    ctx = optional_context(request, db, PORTAL_ADMIN)
    if ctx is None:
        return {"user": None}
    return {"user": _admin_user(ctx.user), "csrf_token": SessionService.csrf_token(ctx.session), "expires_at": ctx.session.expires_at}


@auth_router.get("/me")
def admin_me(ctx: AuthContext = Depends(get_admin_context)):
    return {"user": _admin_user(ctx.user), "csrf_token": SessionService.csrf_token(ctx.session), "expires_at": ctx.session.expires_at}


# --- Dashboard & monitoring (read-only for financial data) ------------------------

@router.get("/metrics")
def metrics(db: Session = Depends(get_db)):
    return AdminService.metrics(db)


@router.get("/customers")
def customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    verified: bool | None = None,
    active: bool | None = None,
    db: Session = Depends(get_db),
):
    return AdminService.list_customers(db, page, page_size, search, verified, active)


@router.get("/customers/{user_id}")
def customer_detail(user_id: int, db: Session = Depends(get_db)):
    return AdminService.customer_detail(db, user_id)


@router.post("/customers/{user_id}/status")
def set_customer_status(
    user_id: int,
    payload: CustomerStatusRequest,
    request: Request,
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    return AdminService.set_customer_status(db, admin, user_id, payload.is_active, payload.reason.strip(), client_ip(request))


@router.get("/transactions")
def transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    type: Literal["transfer", "deposit", "withdraw", "stripe_topup", "stripe_refund", "demo_funding"] | None = None,
    status: Literal["success", "pending", "failed"] | None = None,
    db: Session = Depends(get_db),
):
    return AdminService.list_transactions(db, page, page_size, search, type, status)


@router.get("/transactions/{transaction_id}")
def transaction_detail(transaction_id: int, db: Session = Depends(get_db)):
    return AdminService.transaction_detail(db, transaction_id)


@router.get("/payments")
def payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Literal["pending", "succeeded", "failed", "canceled", "refunded", "attention"] | None = None,
    search: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    return AdminService.list_payments(db, page, page_size, status, search)


@router.get("/payments/{payment_id}")
def payment_detail(payment_id: int, check_stripe: bool = False, db: Session = Depends(get_db)):
    return AdminService.payment_detail(db, payment_id, check_stripe)


@router.get("/reconciliation")
def reconciliation(db: Session = Depends(get_db)):
    return AdminService.reconciliation(db)


@router.get("/audit-events")
def audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    action: str | None = Query(None, max_length=64),
    db: Session = Depends(get_db),
):
    return AdminService.list_audit_events(db, page, page_size, action)
