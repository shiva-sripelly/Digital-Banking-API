"""Admin sign-in: password, then TOTP. There is no session until MFA passes.

First sign-in after `create_admin.py` enrolls the authenticator: the server
generates a secret (stored Fernet-encrypted), shows it once, and only enables
MFA when the admin proves possession with a valid code.
"""
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.rate_limit import (
    ADMIN_LOGIN_FAILURES_PER_EMAIL,
    ADMIN_LOGIN_PER_IP,
    ADMIN_MFA_FAILURES_PER_USER,
    RateLimiter,
)
from app.core.security import (
    MFAConfigurationError,
    create_purpose_token,
    decode_token,
    decrypt_secret,
    encrypt_secret,
    generate_totp_secret,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)
from app.models.auth_session import PORTAL_ADMIN
from app.models.user import ROLE_ADMIN, User
from app.repositories.user_repository import UserRepository, normalize_email
from app.services.audit_service import AuditService
from app.services.notification_service import Notifier, mask_email
from app.services.session_service import SessionService

logger = logging.getLogger("app.admin_auth")

MFA_TOKEN_PURPOSE = "admin_mfa"
MFA_TOKEN_MINUTES = 5


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "invalid_credentials", "message": "Invalid email or password"},
    )


def _mfa_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"code": "mfa_not_configured", "message": "Admin MFA is not configured on the server (MFA_ENCRYPTION_KEY)."},
    )


class AdminAuthService:
    @staticmethod
    def login(db: Session, email: str, password: str, ip: str):
        RateLimiter.hit(db, ADMIN_LOGIN_PER_IP, ip)
        RateLimiter.check(db, ADMIN_LOGIN_FAILURES_PER_EMAIL, email)

        user = UserRepository.get_by_email(db, email)
        password_ok = verify_password(password, user.hashed_password if user else None)
        if not password_ok or user.role != ROLE_ADMIN:
            RateLimiter.record(db, ADMIN_LOGIN_FAILURES_PER_EMAIL, email)
            AuditService.record(
                db, "admin.login_failed", "system", None, "user", user.id if user else None, ip,
                {"email": mask_email(normalize_email(email))}, commit=True,
            )
            raise _invalid_credentials()

        if not user.is_active:
            AuditService.record(db, "admin.login_blocked_inactive", "admin", user.id, "user", user.id, ip, commit=True)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "account_inactive", "message": "This administrator account is deactivated."},
            )
        if not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "email_not_verified", "message": "Verify your email address before signing in."},
            )

        response = {
            "mfa_required": True,
            "enrollment_required": not user.mfa_enabled,
            "mfa_token": create_purpose_token(user.id, MFA_TOKEN_PURPOSE, MFA_TOKEN_MINUTES),
            "expires_in": MFA_TOKEN_MINUTES * 60,
        }

        try:
            if not user.mfa_enabled:
                # New secret for each enrollment attempt; MFA stays disabled
                # until a code from the new secret is confirmed.
                secret = generate_totp_secret()
                user.mfa_secret_encrypted = encrypt_secret(secret)
                user.mfa_last_used_step = None
                response["enrollment"] = {"secret": secret, "otpauth_uri": totp_provisioning_uri(secret, user.email)}
            elif not user.mfa_secret_encrypted:
                raise _mfa_unavailable()
        except MFAConfigurationError:
            db.rollback()
            raise _mfa_unavailable()

        AuditService.record(db, "admin.password_verified", "admin", user.id, "user", user.id, ip)
        db.commit()
        return response

    @staticmethod
    def verify_mfa(db: Session, mfa_token: str, code: str, ip: str, user_agent: str, response: Response):
        claims = decode_token(mfa_token, MFA_TOKEN_PURPOSE)
        if claims is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "mfa_expired", "message": "Your sign-in step expired. Please sign in again."},
            )

        user = db.query(User).filter(User.id == int(claims["sub"])).with_for_update().first()
        if user is None or user.role != ROLE_ADMIN or not user.is_active or not user.email_verified:
            raise _invalid_credentials()

        RateLimiter.check(db, ADMIN_MFA_FAILURES_PER_USER, str(user.id))
        if not user.mfa_secret_encrypted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "mfa_restart", "message": "Please sign in again to set up MFA."},
            )

        try:
            secret = decrypt_secret(user.mfa_secret_encrypted)
        except MFAConfigurationError:
            raise _mfa_unavailable()

        step = verify_totp(secret, code, user.mfa_last_used_step)
        if step is None:
            RateLimiter.record(db, ADMIN_MFA_FAILURES_PER_USER, str(user.id), commit=False)
            AuditService.record(db, "admin.mfa_failed", "admin", user.id, "user", user.id, ip)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "invalid_mfa_code", "message": "Invalid authentication code"},
            )

        user.mfa_last_used_step = step
        if not user.mfa_enabled:
            user.mfa_enabled = True
            AuditService.record(db, "admin.mfa_enrolled", "admin", user.id, "user", user.id, ip)

        session, token = SessionService.create(
            db, user.id, user.role, PORTAL_ADMIN, ip, user_agent, mfa_verified=True
        )
        user.last_login_at = datetime.now(timezone.utc)
        AuditService.record(db, "admin.login_succeeded", "admin", user.id, "session", session.id[:8], ip)
        db.commit()
        SessionService.set_cookie(response, PORTAL_ADMIN, token, session)

        Notifier.send(
            db,
            "admin_login_alert",
            user.email,
            {
                "name": user.full_name,
                "time": user.last_login_at.strftime("%d %b %Y %H:%M UTC"),
                "ip": ip,
                "agent": user_agent[:80] or "unknown device",
            },
            user_id=user.id,
            dedupe_key=f"admin-login:{session.id}",
        )
        return {"user": user, "csrf_token": SessionService.csrf_token(session), "expires_at": session.expires_at}

    @staticmethod
    def logout(db: Session, ctx, response: Response, ip: str):
        SessionService.revoke(db, ctx.session, "logout")
        AuditService.record(db, "admin.logout", "admin", ctx.user.id, "session", ctx.session.id[:8], ip)
        db.commit()
        SessionService.clear_cookie(response, PORTAL_ADMIN)
        return {"message": "Logged out"}
