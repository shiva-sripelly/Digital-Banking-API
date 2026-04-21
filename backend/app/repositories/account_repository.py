from sqlalchemy.orm import Session
from app.models.account import Account


class AccountRepository:
    @staticmethod
    def create_account(db: Session, user_id: int, account_number: str, balance=0.00, currency="INR"):
        account = Account(
            user_id=user_id,
            account_number=account_number,
            balance=balance,
            currency=currency
        )
        db.add(account)
        db.commit()
        db.refresh(account)
        return account

    @staticmethod
    def get_by_user_id(db: Session, user_id: int):
        return db.query(Account).filter(Account.user_id == user_id).first()

    @staticmethod
    def get_by_account_number(db: Session, account_number: str):
        return db.query(Account).filter(Account.account_number == account_number).first()

    @staticmethod
    def get_by_id(db: Session, account_id: int):
        return db.query(Account).filter(Account.id == account_id).first()

    @staticmethod
    def update_account(db: Session, account: Account):
        db.add(account)
        db.commit()
        db.refresh(account)
        return account