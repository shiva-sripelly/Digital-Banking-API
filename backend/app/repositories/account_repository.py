from sqlalchemy.orm import Session
from app.models.account import Account


class AccountRepository:
    @staticmethod
    def create_account(db: Session, user_id: int, account_number: str, balance=0.00, currency="INR", commit: bool = True):
        account = Account(
            user_id=user_id,
            account_number=account_number,
            balance=balance,
            currency=currency
        )
        db.add(account)
        if commit:
            db.commit()
            db.refresh(account)
        else:
            db.flush()
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
    def lock_accounts(db: Session, account_ids: list[int]):
        """SELECT ... FOR UPDATE on the given accounts, in id order so two opposite
        transfers can't deadlock. Reloads the rows so balances are current."""
        return (
            db.query(Account)
            .filter(Account.id.in_(account_ids))
            .order_by(Account.id)
            .with_for_update()
            .populate_existing()
            .all()
        )

    @staticmethod
    def update_account(db: Session, account: Account):
        db.add(account)
        db.commit()
        db.refresh(account)
        return account