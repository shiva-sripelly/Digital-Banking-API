from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, String
from sqlalchemy.sql import func
from app.core.database import Base


class RateLimitEvent(Base):
    """One row per attempt. Database-backed so limits hold across workers and
    restarts. `key_hash` is a SHA-256 of scope + identifier (no raw emails/IPs)."""
    __tablename__ = "rate_limit_events"
    __table_args__ = (Index("ix_rate_limit_events_key_created", "key_hash", "created_at"),)

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    key_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
