from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.ledger import LedgerEntry, LedgerOpeningBalance
from app.models.transaction import Transaction


@dataclass(frozen=True)
class Leg:
    amount: Decimal
    account_id: int | None = None
    system_account: str | None = None


class LedgerImbalanceError(RuntimeError):
    pass


class LedgerService:
    @staticmethod
    def post(db: Session, transaction: Transaction, legs: list[Leg], currency: str) -> None:
        """Append the double-entry legs for `transaction` in the caller's DB
        transaction. Legs must sum to zero. (transaction_id, leg) is unique, so
        a transaction can never be posted twice."""
        total = sum((leg.amount for leg in legs), Decimal("0"))
        if total != 0 or len(legs) < 2:
            raise LedgerImbalanceError(f"Ledger legs for {transaction.reference} sum to {total}")

        for index, leg in enumerate(legs):
            db.add(
                LedgerEntry(
                    transaction_id=transaction.id,
                    leg=index,
                    account_id=leg.account_id,
                    system_account=leg.system_account,
                    amount=leg.amount,
                    currency=currency,
                )
            )

    @staticmethod
    def reconcile(db: Session) -> dict:
        """Check every wallet: opening balance + ledger movements must equal the
        stored balance. Accounts opened after the ledger was introduced start at 0."""
        movements = dict(
            db.query(LedgerEntry.account_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
            .filter(LedgerEntry.account_id.isnot(None))
            .group_by(LedgerEntry.account_id)
            .all()
        )
        openings = dict(db.query(LedgerOpeningBalance.account_id, LedgerOpeningBalance.balance).all())

        mismatches = []
        accounts = db.query(Account.id, Account.account_number, Account.balance).all()
        for account_id, account_number, balance in accounts:
            expected = Decimal(openings.get(account_id, 0)) + Decimal(movements.get(account_id, 0))
            if expected != Decimal(balance):
                mismatches.append(
                    {
                        "account_id": account_id,
                        "account_number_masked": f"••••{account_number[-4:]}",
                        "balance": str(balance),
                        "expected_from_ledger": str(expected),
                        "difference": str(Decimal(balance) - expected),
                    }
                )

        unbalanced = (
            db.query(LedgerEntry.transaction_id)
            .group_by(LedgerEntry.transaction_id)
            .having(func.sum(LedgerEntry.amount) != 0)
            .count()
        )
        return {
            "accounts_checked": len(accounts),
            "accounts_with_opening_balance": len(openings),
            "mismatched_accounts": mismatches,
            "unbalanced_transactions": unbalanced,
            "status": "matched" if not mismatches and not unbalanced else "mismatch",
        }
