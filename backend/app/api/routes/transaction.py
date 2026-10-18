from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.request_context import client_ip
from app.schemas.payment import IDEMPOTENCY_KEY_PATTERN
from app.schemas.transaction import (
    TransferRequest,
    TransferResponse,
    DepositRequest,
    WithdrawRequest,
    DepositWithdrawResponse,
    TransactionHistoryItem,
    TransactionDetailResponse
)
from app.services.transaction_service import TransactionService


router = APIRouter(prefix="/transactions", tags=["Transactions"])

# Optional: a client that retries with the same key gets the original result
# instead of moving money twice.
IdempotencyKey = Header(default=None, alias="Idempotency-Key", pattern=IDEMPOTENCY_KEY_PATTERN)


@router.post("/transfer", response_model=TransferResponse)
def transfer_funds(
    payload: TransferRequest,
    idempotency_key: str | None = IdempotencyKey,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return TransactionService.transfer_funds(
        db=db,
        current_user_id=current_user.id,
        receiver_account_number=payload.receiver_account_number,
        amount=payload.amount,
        idempotency_key=idempotency_key,
    )


@router.post("/deposit", response_model=DepositWithdrawResponse)
def deposit_funds(
    payload: DepositRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Development-only simulated funding (DEMO_FUNDING_ENABLED). Customers add
    money with Stripe test payments at /payments."""
    return TransactionService.demo_fund(
        db=db,
        current_user_id=current_user.id,
        amount=payload.amount,
        ip=client_ip(request),
    )


@router.post("/withdraw", response_model=DepositWithdrawResponse)
def withdraw_funds(
    payload: WithdrawRequest,
    idempotency_key: str | None = IdempotencyKey,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return TransactionService.withdraw_funds(
        db=db,
        current_user_id=current_user.id,
        amount=payload.amount,
        idempotency_key=idempotency_key,
    )


@router.get("/history", response_model=list[TransactionHistoryItem])
def get_transaction_history(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return TransactionService.get_my_transactions(db, current_user.id)


@router.get("/{transaction_id}", response_model=TransactionDetailResponse)
def get_transaction_detail(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return TransactionService.get_transaction_detail(
        db=db,
        transaction_id=transaction_id,
        current_user_id=current_user.id
    )
