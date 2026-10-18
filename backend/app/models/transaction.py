from sqlalchemy import CheckConstraint, Column, Index, Integer, Numeric, ForeignKey, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

# "deposit" is kept for historical rows; new top-ups are "stripe_topup" and
# development-only simulated funding is "demo_funding".
TRANSACTION_TYPES = ("transfer", "deposit", "withdraw", "stripe_topup", "stripe_refund", "demo_funding")
TRANSACTION_STATUSES = ("success", "pending", "failed")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
        CheckConstraint(
            "transaction_type IN ('transfer', 'deposit', 'withdraw', 'stripe_topup', 'stripe_refund', 'demo_funding')",
            name="ck_transactions_type",
        ),
        CheckConstraint("status IN ('success', 'pending', 'failed')", name="ck_transactions_status"),
        Index("ix_transactions_sender_created", "sender_account_id", "created_at"),
        Index("ix_transactions_receiver_created", "receiver_account_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sender_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    receiver_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    transaction_type = Column(String(20), default="transfer", nullable=False)
    reference = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(20), default="success", nullable=False)
    # "<user_id>:<client key>" for customer-initiated movements; a retry returns the original
    idempotency_key = Column(String(160), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
