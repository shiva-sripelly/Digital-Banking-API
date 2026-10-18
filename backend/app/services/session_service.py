import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_session_token, csrf_token_for
from app.models.auth_session import PORTAL_ADMIN, PORTAL_CUSTOMER, AuthSession

CUSTOMER_COOKIE = "nb_session"
ADMIN_COOKIE = "nb_admin_session"
# The admin cookie is only sent to /admin/* API routes
COOKIE_PATHS = {PORTAL_CUSTOMER: "/", PORTAL_ADMIN: "/admin"}
COOKIE_NAMES = {PORTAL_CUSTOMER: CUSTOMER_COOKIE, PORTAL_ADMIN: ADMIN_COOKIE}


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class SessionService:
    @staticmethod
    def create(
        db: Session,
        user_id: int,
        role: str,
        portal: str,
        ip_address: str | None,
        user_agent: str | None,
        mfa_verified: bool = False,
    ) -> tuple[AuthSession, str]:
        minutes = settings.ADMIN_SESSION_EXPIRE_MINUTES if portal == PORTAL_ADMIN else settings.ACCESS_TOKEN_EXPIRE_MINUTES
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes)
        session = AuthSession(
            id=secrets.token_urlsafe(32),
            user_id=user_id,
            portal=portal,
            mfa_verified=mfa_verified,
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=expires_at,
        )
        db.add(session)
        db.flush()
        token = create_session_token(user_id, session.id, role, expires_at)
        return session, token

    @staticmethod
    def is_valid(session: AuthSession | None, portal: str) -> bool:
        return (
            session is not None
            and session.portal == portal
            and session.revoked_at is None
            and _as_utc(session.expires_at) > datetime.now(timezone.utc)
        )

    @staticmethod
    def revoke(db: Session, session: AuthSession, reason: str) -> None:
        if session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
            session.revoke_reason = reason

    @staticmethod
    def revoke_all_for_user(db: Session, user_id: int, reason: str) -> int:
        return (
            db.query(AuthSession)
            .filter(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .update({"revoked_at": datetime.now(timezone.utc), "revoke_reason": reason}, synchronize_session=False)
        )

    @staticmethod
    def set_cookie(response: Response, portal: str, token: str, session: AuthSession) -> None:
        max_age = int((_as_utc(session.expires_at) - datetime.now(timezone.utc)).total_seconds())
        response.set_cookie(
            key=COOKIE_NAMES[portal],
            value=token,
            max_age=max_age,
            path=COOKIE_PATHS[portal],
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
        )

    @staticmethod
    def clear_cookie(response: Response, portal: str) -> None:
        response.delete_cookie(
            key=COOKIE_NAMES[portal],
            path=COOKIE_PATHS[portal],
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
        )

    @staticmethod
    def csrf_token(session: AuthSession) -> str:
        return csrf_token_for(session.id)
