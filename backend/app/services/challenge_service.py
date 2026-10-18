from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import generate_email_code, hash_email_code, verify_email_code
from app.models.email_challenge import PURPOSE_PASSWORD_RESET, EmailChallenge
from app.models.user import User
from app.services.notification_service import Notifier


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def code_lifetime_minutes(purpose: str) -> int:
    if purpose == PURPOSE_PASSWORD_RESET:
        return settings.PASSWORD_RESET_CODE_EXPIRE_MINUTES
    return settings.EMAIL_CODE_EXPIRE_MINUTES


def invalid_code() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "invalid_code", "message": "Invalid or expired code"},
    )


class ChallengeService:
    @staticmethod
    def issue(db: Session, user: User, purpose: str, template: str, resend: bool = False) -> bool:
        """Create a fresh one-time code and email it. Returns False (and sends
        nothing) inside the resend cooldown. Callers return the same response
        either way, so the cooldown doesn't reveal whether an account exists."""
        existing = (
            db.query(EmailChallenge)
            .filter(EmailChallenge.user_id == user.id, EmailChallenge.purpose == purpose)
            .first()
        )
        now = datetime.now(timezone.utc)
        if existing and existing.created_at:
            if (now - _as_utc(existing.created_at)).total_seconds() < settings.EMAIL_CODE_RESEND_COOLDOWN_SECONDS:
                return False

        if existing:
            db.delete(existing)
            db.flush()

        minutes = code_lifetime_minutes(purpose)
        code = generate_email_code()
        db.add(
            EmailChallenge(
                user_id=user.id,
                purpose=purpose,
                code_hash=hash_email_code(code, purpose, user.id),
                expires_at=now + timedelta(minutes=minutes),
                created_at=now,
            )
        )
        db.commit()

        Notifier.send(
            db,
            template,
            user.email,
            {"name": user.full_name, "code": code, "minutes": minutes, "resend": resend},
            user_id=user.id,
        )
        return True

    @staticmethod
    def consume(db: Session, user: User | None, purpose: str, code: str) -> None:
        """Validate and delete the code (single use). Raises invalid_code() on any
        failure; wrong guesses count toward the attempt limit."""
        if user is None:
            raise invalid_code()

        challenge = (
            db.query(EmailChallenge)
            .filter(EmailChallenge.user_id == user.id, EmailChallenge.purpose == purpose)
            .with_for_update()
            .first()
        )
        if challenge is None:
            raise invalid_code()

        expired = _as_utc(challenge.expires_at) < datetime.now(timezone.utc)
        if expired or challenge.attempts >= settings.EMAIL_CODE_MAX_ATTEMPTS:
            db.delete(challenge)
            db.commit()
            raise invalid_code()

        if not verify_email_code(code, purpose, user.id, challenge.code_hash):
            challenge.attempts += 1
            db.commit()
            raise invalid_code()

        db.delete(challenge)
