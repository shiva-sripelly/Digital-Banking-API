from sqlalchemy import (
    BigInteger, CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint,
)
from sqlalchemy.sql import func
from app.core.database import Base

# Counterparty accounts for money entering or leaving customer wallets
SYSTEM_STRIPE_CLEARING = "stripe_clearing"
SYSTEM_WITHDRAWALS = "withdrawals"
SYSTEM_DEMO_FUNDING = "demo_funding"


class LedgerEntry(Base):
    """Double-entry, append-only ledger. Each transaction posts legs that sum
    to zero; wallet legs are signed (+credit / -debit). UPDATE and DELETE are
    blocked by a PostgreSQL trigger."""
    __tablename__ = "ledger_entries"
    __table_args__ = (
        UniqueConstraint("transaction_id", "leg", name="uq_ledger_entries_transaction_leg"),
        CheckConstraint("amount <> 0", name="ck_ledger_entries_amount_nonzero"),
        CheckConstraint(
            "(account_id IS NOT NULL AND system_account IS NULL) OR "
            "(account_id IS NULL AND system_account IS NOT NULL)",
            name="ck_ledger_entries_one_side",
        ),
    )

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    leg = Column(Integer, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)
    system_account = Column(String(40), nullable=True)
    amount = Column(Numeric(14, 2), nullable=False)
    currency = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LedgerOpeningBalance(Base):
    """Each account's balance when the ledger was introduced. Earlier history is
    preserved in `transactions` but has no ledger entries."""
    __tablename__ = "ledger_opening_balances"

    account_id = Column(Integer, ForeignKey("accounts.id"), primary_key=True)
    balance = Column(Numeric(12, 2), nullable=False)
    captured_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
