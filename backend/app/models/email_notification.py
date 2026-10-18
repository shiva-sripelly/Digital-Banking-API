from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func
from app.core.database import Base


class EmailNotification(Base):
    """Delivery tracking for outgoing email. Bodies are never stored because
    they can contain one-time codes; only metadata and status."""
    __tablename__ = "email_notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    to_email = Column(String(150), nullable=False)
    template = Column(String(50), nullable=False, index=True)
    subject = Column(String(200), nullable=False)
    # queued | retrying | accepted (provider accepted the message) | failed
    status = Column(String(20), nullable=False, default="queued", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(String(255), nullable=True)
    dedupe_key = Column(String(150), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
