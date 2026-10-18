import hmac
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.auth_session import PORTAL_ADMIN, PORTAL_CUSTOMER, AuthSession
from app.models.user import ROLE_ADMIN, ROLE_CUSTOMER, User
from app.services.session_service import COOKIE_NAMES, SessionService

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "X-CSRF-Token"


@dataclass
class AuthContext:
    user: User
    session: AuthSession


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _resolve(request: Request, db: Session, portal: str) -> AuthContext:
    token = request.cookies.get(COOKIE_NAMES[portal])
    if not token:
        raise _unauthorized()

    claims = decode_token(token, "session")
    if claims is None:
        raise _unauthorized("Session expired or invalid")

    session = db.get(AuthSession, claims.get("sid"))
    if not SessionService.is_valid(session, portal) or str(session.user_id) != claims["sub"]:
        raise _unauthorized("Session expired or revoked")

    user = db.get(User, session.user_id)
    if user is None or not user.is_active or not user.email_verified:
        raise _unauthorized("Account is not available")

    # Double protection against CSRF: SameSite cookie + a per-session token
    # header that a cross-site page cannot read or forge.
    if request.method in UNSAFE_METHODS:
        sent = request.headers.get(CSRF_HEADER, "")
        if not hmac.compare_digest(sent, SessionService.csrf_token(session)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing or invalid CSRF token")

    return AuthContext(user=user, session=session)


def get_customer_context(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    ctx = _resolve(request, db, PORTAL_CUSTOMER)
    if ctx.user.role != ROLE_CUSTOMER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access only")
    return ctx


def get_current_user(ctx: AuthContext = Depends(get_customer_context)) -> User:
    """Signed-in, verified, active customer. Kept for existing customer routes."""
    return ctx.user


def get_admin_context(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    ctx = _resolve(request, db, PORTAL_ADMIN)
    mfa_ok = not settings.ADMIN_MFA_REQUIRED or (ctx.session.mfa_verified and ctx.user.mfa_enabled)
    if ctx.user.role != ROLE_ADMIN or not mfa_ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return ctx


def require_admin(ctx: AuthContext = Depends(get_admin_context)) -> User:
    return ctx.user


def optional_context(request: Request, db: Session, portal: str) -> AuthContext | None:
    """Session lookup for GET /session endpoints: None instead of 401."""
    try:
        ctx = get_admin_context(request, db) if portal == PORTAL_ADMIN else get_customer_context(request, db)
    except HTTPException:
        return None
    return ctx
