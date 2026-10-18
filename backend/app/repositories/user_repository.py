from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.user import ROLE_CUSTOMER, User


def normalize_email(email: str) -> str:
    return email.strip().lower()


class UserRepository:
    @staticmethod
    def get_by_email(db: Session, email: str):
        # Case-insensitive so existing mixed-case addresses still match
        return db.query(User).filter(func.lower(User.email) == normalize_email(email)).first()

    @staticmethod
    def create_user(db: Session, full_name: str, email: str, hashed_password: str, role: str = ROLE_CUSTOMER, commit: bool = True):
        user = User(
            full_name=full_name,
            email=normalize_email(email),
            hashed_password=hashed_password,
            role=role,
            email_verified=False,
        )
        db.add(user)
        if commit:
            db.commit()
            db.refresh(user)
        else:
            db.flush()
        return user

    @staticmethod
    def get_by_id(db: Session, user_id: int):
        return db.query(User).filter(User.id == user_id).first()
