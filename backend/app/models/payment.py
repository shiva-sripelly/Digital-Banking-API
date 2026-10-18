from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint,
)
from sqlalchemy.sql import func
from app.core.database import Base

PENDING_STATUSES = ("pending", "processing", "requires_action")
REFUND_STATUSES = ("partially_refunded", "refunded")


class Payment(Base):
    """A Stripe test-mode wallet top-up. The wallet is credited only from a
    verified Stripe event or a server-side Stripe lookup, exactly once."""
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_payments_user_idempotency_key"),
        CheckConstraint("amount_minor > 0", name="ck_payments_amount_positive"),
        CheckConstraint(
            "amount_refunded_minor >= 0 AND amount_refunded_minor <= amount_minor",
            name="ck_payments_refund_range",
        ),
        CheckConstraint(
            "status IN ('pending', 'processing', 'requires_action', 'succeeded', 'failed', 'canceled', "
            "'partially_refunded', 'refunded')",
            name="ck_payments_status",
        ),
        CheckConstraint(
            "reconciliation_status IN ('pending', 'matched', 'mismatch', 'needs_review')",
            name="ck_payments_reconciliation_status",
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    provider = Column(String(20), nullable=False, default="stripe", server_default="stripe")
    provider_payment_id = Column(String(100), unique=True, nullable=True)
    idempotency_key = Column(String(100), nullable=False)
    amount_minor = Column(BigInteger, nullable=False)
    currency = Column(String(3), nullable=False)
    status = Column(String(32), nullable=False, default="pending", index=True)
    amount_refunded_minor = Column(BigInteger, nullable=False, default=0, server_default="0")
    failure_reason = Column(String(255), nullable=True)
    reconciliation_status = Column(String(32), nullable=False, default="pending", server_default="pending")
    livemode = Column(Boolean, nullable=False, default=False, server_default="false")
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    succeeded_at = Column(DateTime(timezone=True), nullable=True)


class StripeWebhookEvent(Base):
    """Every processed Stripe event id, so a replayed event is a no-op."""
    __tablename__ = "stripe_webhook_events"

    id = Column(Integer, primary_key=True)
    event_id = Column(String(100), unique=True, nullable=False)
    event_type = Column(String(100), nullable=False)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True, index=True)
    outcome = Column(String(40), nullable=False)
    livemode = Column(Boolean, nullable=False, default=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
