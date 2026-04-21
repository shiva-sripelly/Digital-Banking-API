from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.user_repository import UserRepository
from app.repositories.account_repository import AccountRepository
from app.core.security import hash_password, verify_password, create_access_token
from app.utils.helpers import generate_account_number


class AuthService:
    @staticmethod
    def register_user(db: Session, full_name: str, email: str, password: str):
        existing_user = UserRepository.get_by_email(db, email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        hashed_pw = hash_password(password)
        user = UserRepository.create_user(db, full_name, email, hashed_pw)

        account_number = generate_account_number()

        while AccountRepository.get_by_account_number(db, account_number):
            account_number = generate_account_number()

        AccountRepository.create_account(
            db=db,
            user_id=user.id,
            account_number=account_number,
            balance=0.00,
            currency="INR"
        )

        return user

    @staticmethod
    def login_user(db: Session, email: str, password: str):
        user = UserRepository.get_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        if not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        token = create_access_token({
            "sub": str(user.id),
            "email": user.email
        })

        return {
            "access_token": token,
            "token_type": "bearer",
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email
        }