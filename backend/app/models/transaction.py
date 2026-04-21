from sqlalchemy import Column, Integer, Numeric, ForeignKey, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    sender_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    receiver_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    transaction_type = Column(String(20), default="transfer", nullable=False)
    reference = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(20), default="success", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())