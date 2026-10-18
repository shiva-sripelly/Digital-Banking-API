import logging

from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent

logger = logging.getLogger("app.audit")

# Keys that must never be written to the audit log, whatever the caller passes
_FORBIDDEN_KEYS = {"password", "code", "otp", "token", "secret", "mfa_secret", "hashed_password"}


class AuditService:
    @staticmethod
    def record(
        db: Session,
        action: str,
        actor_type: str,
        actor_user_id: int | None = None,
        target_type: str | None = None,
        target_id: str | int | None = None,
        ip_address: str | None = None,
        details: dict | None = None,
        commit: bool = False,
    ) -> AuditEvent:
        safe_details = {k: v for k, v in (details or {}).items() if k.lower() not in _FORBIDDEN_KEYS}
        event = AuditEvent(
            action=action,
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            ip_address=ip_address,
            details=safe_details or None,
        )
        db.add(event)
        if commit:
            db.commit()
        logger.info("audit action=%s actor=%s:%s target=%s:%s", action, actor_type, actor_user_id, target_type, target_id)
        return event
