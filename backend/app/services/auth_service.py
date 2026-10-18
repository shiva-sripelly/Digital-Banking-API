import logging
from datetime import datetime, timezone

from fastapi import HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import (
    CODE_SEND_PER_EMAIL,
    CODE_SEND_PER_IP,
    CODE_VERIFY_PER_IP,
    LOGIN_FAILURES_PER_EMAIL,
    LOGIN_PER_IP,
    REGISTER_PER_IP,
    RateLimiter,
)
from app.core.security import hash_password, verify_password
from app.models.auth_session import PORTAL_CUSTOMER
from app.models.email_challenge import PURPOSE_EMAIL_VERIFICATION, PURPOSE_PASSWORD_RESET
from app.models.user import ROLE_CUSTOMER, User
from app.repositories.account_repository import AccountRepository
from app.repositories.user_repository import UserRepository, normalize_email
from app.services.audit_service import AuditService
from app.services.challenge_service import ChallengeService, code_lifetime_minutes
from app.services.notification_service import Notifier, mask_email
from app.services.session_service import SessionService
from app.utils.helpers import generate_account_number

logger = logging.getLogger("app.auth")

def invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "invalid_credentials", "message": "Invalid email or password"},
    )


def code_sent_response(email: str, purpose: str) -> dict:
    return {
        "message": "If the details are valid, we've emailed a 6-digit code. Check your inbox and spam folder.",
        "email": normalize_email(email),
        "code_expires_in": code_lifetime_minutes(purpose) * 60,
        "resend_available_in": settings.EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
    }


def session_payload(user: User, session) -> dict:
    return {"user": user, "csrf_token": SessionService.csrf_token(session), "expires_at": session.expires_at}


class AuthService:
    # --- Registration & verification ------------------------------------------
    @staticmethod
    def register_user(db: Session, full_name: str, email: str, password: str, ip: str):
        RateLimiter.hit(db, REGISTER_PER_IP, ip)
        RateLimiter.hit(db, CODE_SEND_PER_EMAIL, email)

        existing = UserRepository.get_by_email(db, email)
        if existing:
            # Same response as a new sign-up; tell the real owner instead
            if existing.email_verified:
                Notifier.send(db, "registration_attempt", existing.email, {"name": existing.full_name}, user_id=existing.id)
            elif existing.role == ROLE_CUSTOMER:
                ChallengeService.issue(db, existing, PURPOSE_EMAIL_VERIFICATION, "verify_email", resend=True)
            return code_sent_response(email, PURPOSE_EMAIL_VERIFICATION)

        # User and account are created in one commit, so a failure can't leave
        # a user without an account.
        user = UserRepository.create_user(db, full_name, email, hash_password(password), commit=False)
        account_number = generate_account_number()
        while AccountRepository.get_by_account_number(db, account_number):
            account_number = generate_account_number()
        AccountRepository.create_account(db, user.id, account_number, balance=0, currency="INR", commit=False)
        try:
            db.commit()
        except IntegrityError:
            # Concurrent sign-up with the same email: behave like the existing-email branch
            db.rollback()
            return code_sent_response(email, PURPOSE_EMAIL_VERIFICATION)

        AuditService.record(db, "user.registered", "customer", user.id, "user", user.id, ip, commit=True)
        ChallengeService.issue(db, user, PURPOSE_EMAIL_VERIFICATION, "verify_email")
        return code_sent_response(email, PURPOSE_EMAIL_VERIFICATION)

    @staticmethod
    def resend_verification(db: Session, email: str, ip: str):
        RateLimiter.hit(db, CODE_SEND_PER_IP, ip)
        RateLimiter.hit(db, CODE_SEND_PER_EMAIL, email)

        user = UserRepository.get_by_email(db, email)
        if user and not user.email_verified and user.is_active:
            ChallengeService.issue(db, user, PURPOSE_EMAIL_VERIFICATION, "verify_email", resend=True)
        return code_sent_response(email, PURPOSE_EMAIL_VERIFICATION)

    @staticmethod
    def verify_email(db: Session, email: str, code: str, ip: str):
        RateLimiter.hit(db, CODE_VERIFY_PER_IP, ip)

        user = UserRepository.get_by_email(db, email)
        if user is not None and user.email_verified:
            user = None  # nothing to verify; generic failure
        ChallengeService.consume(db, user, PURPOSE_EMAIL_VERIFICATION, code)

        user.email_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        AuditService.record(db, "user.email_verified", user.role, user.id, "user", user.id, ip)
        db.commit()

        if user.role == ROLE_CUSTOMER:
            Notifier.send(db, "welcome", user.email, {"name": user.full_name}, user_id=user.id, dedupe_key=f"welcome:{user.id}")
        return {"message": "Email verified. You can now log in."}

    # --- Login / logout -----------------------------------------------------
    @staticmethod
    def login_user(db: Session, email: str, password: str, ip: str, user_agent: str, response: Response):
        RateLimiter.hit(db, LOGIN_PER_IP, ip)
        RateLimiter.check(db, LOGIN_FAILURES_PER_EMAIL, email)

        user = UserRepository.get_by_email(db, email)
        if not verify_password(password, user.hashed_password if user else None):
            RateLimiter.record(db, LOGIN_FAILURES_PER_EMAIL, email)
            logger.info("customer login failed for %s from %s", mask_email(normalize_email(email)), ip)
            raise invalid_credentials()

        if user.role != ROLE_CUSTOMER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "use_admin_portal", "message": "Administrators must sign in through the admin portal."},
            )
        if not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "email_not_verified",
                    "message": "Please verify your email address before logging in. We can send you a new code.",
                },
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "account_inactive", "message": "This account has been deactivated. Contact support."},
            )

        session, token = SessionService.create(db, user.id, user.role, PORTAL_CUSTOMER, ip, user_agent)
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
        SessionService.set_cookie(response, PORTAL_CUSTOMER, token, session)

        Notifier.send(
            db,
            "login_alert",
            user.email,
            {
                "name": user.full_name,
                "time": user.last_login_at.strftime("%d %b %Y %H:%M UTC"),
                "ip": ip,
                "agent": user_agent[:80] or "unknown device",
            },
            user_id=user.id,
            dedupe_key=f"login:{session.id}",
        )
        return session_payload(user, session)

    @staticmethod
    def logout(db: Session, ctx, response: Response, portal: str = PORTAL_CUSTOMER):
        SessionService.revoke(db, ctx.session, "logout")
        db.commit()
        SessionService.clear_cookie(response, portal)
        return {"message": "Logged out"}

    # --- Password reset ---------------------------------------------------------
    @staticmethod
    def request_password_reset(db: Session, email: str, ip: str):
        RateLimiter.hit(db, CODE_SEND_PER_IP, ip)
        RateLimiter.hit(db, CODE_SEND_PER_EMAIL, email)

        user = UserRepository.get_by_email(db, email)
        if user and user.is_active:
            ChallengeService.issue(db, user, PURPOSE_PASSWORD_RESET, "password_reset")
        return code_sent_response(email, PURPOSE_PASSWORD_RESET)

    @staticmethod
    def reset_password(db: Session, email: str, code: str, new_password: str, ip: str):
        RateLimiter.hit(db, CODE_VERIFY_PER_IP, ip)

        user = UserRepository.get_by_email(db, email)
        if user is not None and not user.is_active:
            user = None
        ChallengeService.consume(db, user, PURPOSE_PASSWORD_RESET, code)

        now = datetime.now(timezone.utc)
        user.hashed_password = hash_password(new_password)
        user.password_changed_at = now
        # A code delivered to the mailbox proves ownership of it
        if not user.email_verified:
            user.email_verified = True
            user.email_verified_at = now
        revoked = SessionService.revoke_all_for_user(db, user.id, "password_reset")
        AuditService.record(db, "user.password_reset", user.role, user.id, "user", user.id, ip, {"sessions_revoked": revoked})
        db.commit()

        Notifier.send(db, "password_changed", user.email, {"name": user.full_name}, user_id=user.id)
        return {"message": "Password reset successful. Please log in with your new password."}
