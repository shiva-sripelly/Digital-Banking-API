from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.schemas.account import AccountResponse
from app.services.account_service import AccountService


router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.get("/me", response_model=AccountResponse)
def get_my_account(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return AccountService.get_my_account(db, current_user.id)


@router.get("/balance")
def get_balance(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    account = AccountService.get_my_account(db, current_user.id)
    return {
        "account_number": account.account_number,
        "balance": account.balance,
        "currency": account.currency
    }