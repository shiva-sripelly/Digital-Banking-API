from decimal import Decimal
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.repositories.account_repository import AccountRepository
from app.repositories.transaction_repository import TransactionRepository
from app.utils.helpers import generate_transaction_reference
from app.repositories.user_repository import UserRepository
from app.core.email import send_email

class TransactionService:
    @staticmethod
    def transfer_funds(db: Session, current_user_id: int, receiver_account_number: str, amount: Decimal):
        sender_account = AccountRepository.get_by_user_id(db, current_user_id)
        if not sender_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sender account not found"
            )

        receiver_account = AccountRepository.get_by_account_number(db, receiver_account_number)
        if not receiver_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receiver account not found"
            )

        if sender_account.account_number == receiver_account.account_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot transfer funds to your own account"
            )

        if amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transfer amount must be greater than zero"
            )

        if sender_account.balance < amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient balance"
            )

        sender_account.balance -= amount
        receiver_account.balance += amount

        reference = generate_transaction_reference()
        while TransactionRepository.get_by_reference(db, reference):
            reference = generate_transaction_reference()

        transaction = TransactionRepository.create_transaction(
            db=db,
            sender_account_id=sender_account.id,
            receiver_account_id=receiver_account.id,
            amount=amount,
            transaction_type="transfer",
            reference=reference,
            status="success"
        )

        db.add(sender_account)
        db.add(receiver_account)
        db.commit()
        
        user = UserRepository.get_by_id(db, current_user_id)

        if user:
            send_email(
        subject="Transaction Alert",
        body=f"Your {transaction.transaction_type} of ₹{transaction.amount} was successful. Ref: {transaction.reference}",
        to_email=user.email
    )

        db.refresh(sender_account)
        db.refresh(receiver_account)

        return {
            "message": "Fund transfer successful",
            "reference": transaction.reference,
            "amount": transaction.amount,
            "sender_account_number": sender_account.account_number,
            "receiver_account_number": receiver_account.account_number,
            "status": transaction.status
        }

    @staticmethod
    def deposit_funds(db: Session, current_user_id: int, amount: Decimal):
        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )

        if amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deposit amount must be greater than zero"
            )

        account.balance += amount

        reference = generate_transaction_reference()
        while TransactionRepository.get_by_reference(db, reference):
            reference = generate_transaction_reference()

        transaction = TransactionRepository.create_transaction(
            db=db,
            sender_account_id=None,
            receiver_account_id=account.id,
            amount=amount,
            transaction_type="deposit",
            reference=reference,
            status="success"
        )

        db.add(account)
        db.commit()
        user = UserRepository.get_by_id(db, current_user_id)

        if user:
            send_email(
        subject="Transaction Alert",
        body=f"Your {transaction.transaction_type} of amount {transaction.amount} was successful. Ref: {transaction.reference}",
        to_email=user.email
        )

        db.refresh(account)

        return {
            "message": "Deposit successful",
            "reference": transaction.reference,
            "amount": transaction.amount,
            "account_number": account.account_number,
            "balance": account.balance,
            "status": transaction.status
        }

    @staticmethod
    def withdraw_funds(db: Session, current_user_id: int, amount: Decimal):
        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )

        if amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Withdraw amount must be greater than zero"
            )

        if account.balance < amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient balance"
            )

        account.balance -= amount

        reference = generate_transaction_reference()
        while TransactionRepository.get_by_reference(db, reference):
            reference = generate_transaction_reference()

        transaction = TransactionRepository.create_transaction(
            db=db,
            sender_account_id=account.id,
            receiver_account_id=None,
            amount=amount,
            transaction_type="withdraw",
            reference=reference,
            status="success"
        )

        db.add(account)
        db.commit()
        user = UserRepository.get_by_id(db, current_user_id)

        if user:
            send_email(
        subject="Transaction Alert",
        body=f"Your {transaction.transaction_type} of ₹{transaction.amount} was successful. Ref: {transaction.reference}",
        to_email=user.email
    )
        db.refresh(account)

        return {
            "message": "Withdraw successful",
            "reference": transaction.reference,
            "amount": transaction.amount,
            "account_number": account.account_number,
            "balance": account.balance,
            "status": transaction.status
        }

    @staticmethod
    def get_my_transactions(db: Session, current_user_id: int):
        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )

        transactions = TransactionRepository.get_transactions_by_account_id(db, account.id)

        history = []
        for txn in transactions:
            sender_account_number = None
            receiver_account_number = None

            if txn.sender_account_id:
                sender_account = AccountRepository.get_by_id(db, txn.sender_account_id)
                sender_account_number = sender_account.account_number if sender_account else None

            if txn.receiver_account_id:
                receiver_account = AccountRepository.get_by_id(db, txn.receiver_account_id)
                receiver_account_number = receiver_account.account_number if receiver_account else None

            history.append({
                "id": txn.id,
                "reference": txn.reference,
                "transaction_type": txn.transaction_type,
                "amount": txn.amount,
                "status": txn.status,
                "sender_account_number": sender_account_number,
                "receiver_account_number": receiver_account_number,
                "created_at": txn.created_at
            })

        return history

    @staticmethod
    def get_transaction_detail(db: Session, transaction_id: int, current_user_id: int):
        account = AccountRepository.get_by_user_id(db, current_user_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )

        txn = TransactionRepository.get_by_id(db, transaction_id)
        if not txn:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaction not found"
            )

        if txn.sender_account_id != account.id and txn.receiver_account_id != account.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to view this transaction"
            )

        sender_account_number = None
        receiver_account_number = None

        if txn.sender_account_id:
            sender_account = AccountRepository.get_by_id(db, txn.sender_account_id)
            sender_account_number = sender_account.account_number if sender_account else None

        if txn.receiver_account_id:
            receiver_account = AccountRepository.get_by_id(db, txn.receiver_account_id)
            receiver_account_number = receiver_account.account_number if receiver_account else None

        return {
            "id": txn.id,
            "reference": txn.reference,
            "transaction_type": txn.transaction_type,
            "amount": txn.amount,
            "status": txn.status,
            "sender_account_id": txn.sender_account_id,
            "receiver_account_id": txn.receiver_account_id,
            "sender_account_number": sender_account_number,
            "receiver_account_number": receiver_account_number,
            "created_at": txn.created_at
        }