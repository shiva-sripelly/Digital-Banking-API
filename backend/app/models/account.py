from sqlalchemy import CheckConstraint, Column, Integer, String, Numeric, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("balance >= 0", name="ck_accounts_balance_non_negative"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    account_number = Column(String(20), unique=True, nullable=False, index=True)
    balance = Column(Numeric(12, 2), default=0.00, nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
