from sqlalchemy.orm import Session
from app.models.transaction import Transaction


class TransactionRepository:
    @staticmethod
    def create_transaction(
        db: Session,
        sender_account_id,
        receiver_account_id,
        amount,
        transaction_type: str,
        reference: str,
        status: str = "success",
        idempotency_key: str | None = None
    ):
        transaction = Transaction(
            sender_account_id=sender_account_id,
            receiver_account_id=receiver_account_id,
            amount=amount,
            transaction_type=transaction_type,
            reference=reference,
            status=status,
            idempotency_key=idempotency_key
        )
        db.add(transaction)
        db.flush()
        db.refresh(transaction)
        return transaction

    @staticmethod
    def get_transactions_by_account_id(db: Session, account_id: int):
        return (
            db.query(Transaction)
            .filter(
                (Transaction.sender_account_id == account_id) |
                (Transaction.receiver_account_id == account_id)
            )
            .order_by(Transaction.created_at.desc())
            .all()
        )

    @staticmethod
    def get_by_reference(db: Session, reference: str):
        return db.query(Transaction).filter(Transaction.reference == reference).first()

    @staticmethod
    def get_by_idempotency_key(db: Session, idempotency_key: str):
        return db.query(Transaction).filter(Transaction.idempotency_key == idempotency_key).first()

    @staticmethod
    def get_by_id(db: Session, transaction_id: int):
        return db.query(Transaction).filter(Transaction.id == transaction_id).first()