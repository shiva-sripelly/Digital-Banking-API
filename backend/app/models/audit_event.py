from sqlalchemy import JSON, BigInteger, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func
from app.core.database import Base


class AuditEvent(Base):
    """Append-only security and operations log (UPDATE/DELETE are blocked by a
    PostgreSQL trigger). `details` must never contain secrets or codes."""
    __tablename__ = "audit_events"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_type = Column(String(16), nullable=False)  # customer | admin | system
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(32), nullable=True)
    target_id = Column(String(64), nullable=True)
    ip_address = Column(String(64), nullable=True)
    details = Column(JSON, nullable=True)
