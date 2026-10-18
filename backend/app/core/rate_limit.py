from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import sha256_hex
from app.models.rate_limit import RateLimitEvent


@dataclass(frozen=True)
class Limit:
    scope: str
    max_attempts: int
    window_seconds: int


# Per-IP limits stop one client hammering many accounts; per-email limits stop
# many clients hammering one account. Both apply to known and unknown emails
# alike, so responses never reveal whether an account exists.
LOGIN_PER_IP = Limit("login:ip", 20, 15 * 60)
LOGIN_FAILURES_PER_EMAIL = Limit("login-fail:email", 5, 15 * 60)
ADMIN_LOGIN_PER_IP = Limit("admin-login:ip", 10, 15 * 60)
ADMIN_LOGIN_FAILURES_PER_EMAIL = Limit("admin-login-fail:email", 5, 30 * 60)
ADMIN_MFA_FAILURES_PER_USER = Limit("admin-mfa-fail:user", 5, 15 * 60)
REGISTER_PER_IP = Limit("register:ip", 10, 60 * 60)
CODE_SEND_PER_EMAIL = Limit("code-send:email", 5, 60 * 60)
CODE_SEND_PER_IP = Limit("code-send:ip", 20, 60 * 60)
CODE_VERIFY_PER_IP = Limit("code-verify:ip", 30, 15 * 60)
PAYMENT_CREATE_PER_USER = Limit("payment-create:user", 20, 60 * 60)
PAYMENT_SYNC_PER_USER = Limit("payment-sync:user", 60, 60 * 60)


class RateLimiter:
    @staticmethod
    def _key(limit: Limit, identifier: str) -> str:
        return sha256_hex(f"{limit.scope}:{identifier.strip().lower()}")

    @staticmethod
    def count(db: Session, limit: Limit, identifier: str) -> int:
        since = datetime.now(timezone.utc) - timedelta(seconds=limit.window_seconds)
        return (
            db.query(RateLimitEvent)
            .filter(RateLimitEvent.key_hash == RateLimiter._key(limit, identifier), RateLimitEvent.created_at >= since)
            .count()
        )

    @staticmethod
    def is_limited(db: Session, limit: Limit, identifier: str) -> bool:
        return RateLimiter.count(db, limit, identifier) >= limit.max_attempts

    @staticmethod
    def record(db: Session, limit: Limit, identifier: str, commit: bool = True) -> None:
        db.add(RateLimitEvent(key_hash=RateLimiter._key(limit, identifier), created_at=datetime.now(timezone.utc)))
        if commit:
            db.commit()

    @staticmethod
    def check(db: Session, limit: Limit, identifier: str) -> None:
        if RateLimiter.is_limited(db, limit, identifier):
            raise too_many_requests(limit)

    @staticmethod
    def hit(db: Session, limit: Limit, identifier: str) -> None:
        """Check, then count this attempt."""
        RateLimiter.check(db, limit, identifier)
        RateLimiter.record(db, limit, identifier)

    @staticmethod
    def purge_expired(db: Session, older_than_hours: int = 24) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
        deleted = db.query(RateLimitEvent).filter(RateLimitEvent.created_at < cutoff).delete()
        db.commit()
        return deleted


def too_many_requests(limit: Limit) -> HTTPException:
    minutes = max(1, limit.window_seconds // 60)
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={"code": "rate_limited", "message": f"Too many attempts. Please try again in up to {minutes} minutes."},
        headers={"Retry-After": str(limit.window_seconds)},
    )
