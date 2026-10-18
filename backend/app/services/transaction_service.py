from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.models.account import Account
from app.models.ledger import SYSTEM_DEMO_FUNDING, SYSTEM_WITHDRAWALS
from app.models.transaction import Transaction
from app.repositories.account_repository import AccountRepository
from app.repositories.transaction_repository import TransactionRepository
from app.repositories.user_repository import UserRepository
from app.services.audit_service import AuditService
from app.services.ledger_service import Leg, LedgerService
from app.services.notification_service import Notifier
from app.utils.helpers import generate_transaction_reference, mask_account_number


def _money(amount) -> str:
    return f"₹{Decimal(amount):,.2f}"


def _scoped_key(user_id: int, idempotency_key: str | None) -> str | None:
    return f"{user_id}:{idempotency_key}" if idempotency_key else None


def _unique_reference(db: Session) -> str:
    reference = generate_transaction_reference()
    while TransactionRepository.get_by_reference(db, reference):
        reference = generate_transaction_reference()
    return reference


def _idempotency_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "idempotency_conflict", "message": "This request key was already used for a different operation."},
    )


class TransactionService:
    # --- Transfers ---------------------------------------------------------------
    @staticmethod
    def transfer_funds(
        db: Session,
        current_user_id: int,
        receiver_account_number: str,
        amount: Decimal,
        idempotency_key: str | None = None,
    ):
        key = _scoped_key(current_user_id, idempotency_key)
        if key:
            replay = TransactionService._replay_transfer(db, key, receiver_account_number, amount)
            if replay:
                return replay

        sender_account = AccountRepository.get_by_user_id(db, current_user_id)
        if not sender_account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sender account not found")

        receiver_account = AccountRepository.get_by_account_number(db, receiver_account_number)
        if not receiver_account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receiver account not found")

        if sender_account.account_number == receiver_account.account_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot transfer funds to your own account"
            )

        if amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transfer amount must be greater than zero")

        AccountRepository.lock_accounts(db, [sender_account.id, receiver_account.id])

        # A concurrent request with the same key may have committed while we
        # waited for the lock: return its result instead of moving money again.
        if key and TransactionRepository.get_by_idempotency_key(db, key):
            db.rollback()
            return TransactionService._replay_transfer(db, key, receiver_account_number, amount)

        if sender_account.balance < amount:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient balance")

        try:
            sender_account.balance -= amount
            receiver_account.balance += amount

            transaction = TransactionRepository.create_transaction(
                db=db,
                sender_account_id=sender_account.id,
                receiver_account_id=receiver_account.id,
                amount=amount,
                transaction_type="transfer",
                reference=_unique_reference(db),
                status="success",
                idempotency_key=key,
            )
            LedgerService.post(
                db,
                transaction,
                [Leg(-amount, account_id=sender_account.id), Leg(amount, account_id=receiver_account.id)],
                sender_account.currency,
            )
            db.commit()
        except IntegrityError:
            # The same idempotency key won a concurrent race; return its result
            db.rollback()
            replay = TransactionService._replay_transfer(db, key, receiver_account_number, amount) if key else None
            if replay:
                return replay
            raise

        TransactionService._notify_transfer(db, transaction, sender_account, receiver_account)

        return {
            "message": "Fund transfer successful",
            "reference": transaction.reference,
            "amount": transaction.amount,
            "sender_account_number": sender_account.account_number,
            "receiver_account_number": receiver_account.account_number,
            "status": transaction.status,
        }

    @staticmethod
    def _replay_transfer(db: Session, key: str, receiver_account_number: str, amount: Decimal):
        existing = TransactionRepository.get_by_idempotency_key(db, key)
        if not existing:
            return None
        receiver = AccountRepository.get_by_id(db, existing.receiver_account_id) if existing.receiver_account_id else None
        if (
            existing.transaction_type != "transfer"
            or receiver is None
            or receiver.account_number != receiver_account_number
            or Decimal(existing.amount) != Decimal(amount)
        ):
            raise _idempotency_conflict()
        sender = AccountRepository.get_by_id(db, existing.sender_account_id)
        return {
            "message": "Fund transfer successful",
            "reference": existing.reference,
            "amount": existing.amount,
            "sender_account_number": sender.account_number,
            "receiver_account_number": receiver.account_number,
            "status": existing.status,
        }

    @staticmethod
    def _notify_transfer(db: Session, transaction: Transaction, sender: Account, receiver: Account) -> None:
        sender_user = UserRepository.get_by_id(db, sender.user_id)
        receiver_user = UserRepository.get_by_id(db, receiver.user_id)
        if sender_user:
            Notifier.send(
                db, "transfer_sent", sender_user.email,
                {
                    "name": sender_user.full_name,
                    "amount": _money(transaction.amount),
                    "counterparty": mask_account_number(receiver.account_number),
                    "reference": transaction.reference,
                },
                user_id=sender_user.id, dedupe_key=f"transfer-sent:{transaction.id}",
            )
        if receiver_user:
            Notifier.send(
                db, "transfer_received", receiver_user.email,
                {
                    "name": receiver_user.full_name,
                    "amount": _money(transaction.amount),
                    "counterparty": mask_account_number(sender.account_number),
                    "reference": transaction.reference,
                },
                user_id=receiver_user.id, dedupe_key=f"transfer-received:{transaction.id}",
            )

    # --- Development-only demo funding ---------------------------------------
    @staticmethod
    def demo_fund(db: Session, current_user_id: int, amount: Decimal, ip: str | None = None):
        """Simulated money with no payment behind it. Disabled unless
        DEMO_FUNDING_ENABLED=true outside production; every use is audited."""
        if not settings.demo_funding_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "demo_funding_disabled",
                    "message": "Adding money without a payment is disabled. Use a Stripe test payment instead.",
                },
            )

        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
        if amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount must be greater than zero")

        AccountRepository.lock_accounts(db, [account.id])
        account.balance += amount

        transaction = TransactionRepository.create_transaction(
            db=db,
            sender_account_id=None,
            receiver_account_id=account.id,
            amount=amount,
            transaction_type="demo_funding",
            reference=_unique_reference(db),
            status="success",
        )
        LedgerService.post(
            db,
            transaction,
            [Leg(amount, account_id=account.id), Leg(-amount, system_account=SYSTEM_DEMO_FUNDING)],
            account.currency,
        )
        AuditService.record(
            db, "demo_funding.used", "customer", current_user_id, "transaction", transaction.reference, ip,
            {"amount": str(amount)},
        )
        db.commit()
        db.refresh(account)

        return {
            "message": "Demo funds added (development only)",
            "reference": transaction.reference,
            "amount": transaction.amount,
            "account_number": account.account_number,
            "balance": account.balance,
            "status": transaction.status,
        }

    # --- Withdrawals ---------------------------------------------------------------
    @staticmethod
    def withdraw_funds(db: Session, current_user_id: int, amount: Decimal, idempotency_key: str | None = None):
        key = _scoped_key(current_user_id, idempotency_key)
        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

        if key:
            replay = TransactionService._replay_withdrawal(db, key, account, amount)
            if replay:
                return replay

        if amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Withdraw amount must be greater than zero")

        AccountRepository.lock_accounts(db, [account.id])

        if key and TransactionRepository.get_by_idempotency_key(db, key):
            db.rollback()
            return TransactionService._replay_withdrawal(db, key, account, amount)

        if account.balance < amount:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient balance")

        try:
            account.balance -= amount

            transaction = TransactionRepository.create_transaction(
                db=db,
                sender_account_id=account.id,
                receiver_account_id=None,
                amount=amount,
                transaction_type="withdraw",
                reference=_unique_reference(db),
                status="success",
                idempotency_key=key,
            )
            LedgerService.post(
                db,
                transaction,
                [Leg(-amount, account_id=account.id), Leg(amount, system_account=SYSTEM_WITHDRAWALS)],
                account.currency,
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            replay = TransactionService._replay_withdrawal(db, key, account, amount) if key else None
            if replay:
                return replay
            raise
        db.refresh(account)

        user = UserRepository.get_by_id(db, current_user_id)
        if user:
            Notifier.send(
                db, "withdrawal", user.email,
                {
                    "name": user.full_name,
                    "amount": _money(transaction.amount),
                    "reference": transaction.reference,
                    "balance": _money(account.balance),
                },
                user_id=user.id, dedupe_key=f"withdrawal:{transaction.id}",
            )

        return {
            "message": "Withdraw successful",
            "reference": transaction.reference,
            "amount": transaction.amount,
            "account_number": account.account_number,
            "balance": account.balance,
            "status": transaction.status,
        }

    @staticmethod
    def _replay_withdrawal(db: Session, key: str, account: Account, amount: Decimal):
        existing = TransactionRepository.get_by_idempotency_key(db, key)
        if not existing:
            return None
        if existing.transaction_type != "withdraw" or Decimal(existing.amount) != Decimal(amount):
            raise _idempotency_conflict()
        db.refresh(account)
        return {
            "message": "Withdraw successful",
            "reference": existing.reference,
            "amount": existing.amount,
            "account_number": account.account_number,
            "balance": account.balance,
            "status": existing.status,
        }

    # --- History -----------------------------------------------------------------
    @staticmethod
    def _with_account_numbers(db: Session):
        sender = aliased(Account)
        receiver = aliased(Account)
        query = (
            db.query(Transaction, sender.account_number, receiver.account_number)
            .outerjoin(sender, Transaction.sender_account_id == sender.id)
            .outerjoin(receiver, Transaction.receiver_account_id == receiver.id)
        )
        return query

    @staticmethod
    def get_my_transactions(db: Session, current_user_id: int):
        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

        rows = (
            TransactionService._with_account_numbers(db)
            .filter(or_(Transaction.sender_account_id == account.id, Transaction.receiver_account_id == account.id))
            .order_by(Transaction.created_at.desc(), Transaction.id.desc())
            .all()
        )
        return [
            {
                "id": txn.id,
                "reference": txn.reference,
                "transaction_type": txn.transaction_type,
                "amount": txn.amount,
                "status": txn.status,
                "sender_account_number": sender_number,
                "receiver_account_number": receiver_number,
                "created_at": txn.created_at,
            }
            for txn, sender_number, receiver_number in rows
        ]

    @staticmethod
    def get_transaction_detail(db: Session, transaction_id: int, current_user_id: int):
        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

        row = TransactionService._with_account_numbers(db).filter(Transaction.id == transaction_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

        txn, sender_number, receiver_number = row
        if txn.sender_account_id != account.id and txn.receiver_account_id != account.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to view this transaction")

        return {
            "id": txn.id,
            "reference": txn.reference,
            "transaction_type": txn.transaction_type,
            "amount": txn.amount,
            "status": txn.status,
            "sender_account_id": txn.sender_account_id,
            "receiver_account_id": txn.receiver_account_id,
            "sender_account_number": sender_number,
            "receiver_account_number": receiver_number,
            "created_at": txn.created_at,
        }
