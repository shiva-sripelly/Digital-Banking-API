from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func
from app.core.database import Base

PORTAL_CUSTOMER = "customer"
PORTAL_ADMIN = "admin"


class AuthSession(Base):
    """Server-side session. The session cookie's JWT carries this id, so logout,
    password reset and deactivation revoke access immediately."""
    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_user_revoked", "user_id", "revoked_at"),)

    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    portal = Column(String(16), nullable=False)
    mfa_verified = Column(Boolean, nullable=False, default=False, server_default="false")
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoke_reason = Column(String(64), nullable=True)
