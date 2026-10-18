from sqlalchemy import BigInteger, Boolean, CheckConstraint, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func
from app.core.database import Base

ROLE_CUSTOMER = "customer"
ROLE_ADMIN = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('customer', 'admin')", name="ck_users_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(String(20), nullable=False, default=ROLE_CUSTOMER, server_default=ROLE_CUSTOMER)
    email_verified = Column(Boolean, nullable=False, default=False, server_default="false")
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    # Admin TOTP: secret is Fernet-encrypted; last step blocks code replay
    mfa_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    mfa_secret_encrypted = Column(Text, nullable=True)
    mfa_last_used_step = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN
