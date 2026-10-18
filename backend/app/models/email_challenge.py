from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base

PURPOSE_EMAIL_VERIFICATION = "email_verification"
PURPOSE_PASSWORD_RESET = "password_reset"


class EmailChallenge(Base):
    """One-time code sent to a mailbox. Only an HMAC of the code is stored and
    the row is deleted once used, so each code works at most once.
    (Formerly `password_reset_codes`; renamed in migration 0002.)"""
    __tablename__ = "email_challenges"
    __table_args__ = (UniqueConstraint("user_id", "purpose", name="uq_email_challenges_user_purpose"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose = Column(String(32), nullable=False)
    code_hash = Column(String(64), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
