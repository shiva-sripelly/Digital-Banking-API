from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.repositories.account_repository import AccountRepository


class AccountService:
    @staticmethod
    def get_my_account(db: Session, user_id: int):
        account = AccountRepository.get_by_user_id(db, user_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )
        return account