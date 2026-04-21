from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import datetime


class TransferRequest(BaseModel):
    receiver_account_number: str = Field(..., min_length=6, max_length=20)
    amount: Decimal = Field(..., gt=0)


class DepositRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)


class WithdrawRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)


class TransferResponse(BaseModel):
    message: str
    reference: str
    amount: Decimal
    sender_account_number: str
    receiver_account_number: str
    status: str


class DepositWithdrawResponse(BaseModel):
    message: str
    reference: str
    amount: Decimal
    account_number: str
    balance: Decimal
    status: str


class TransactionHistoryItem(BaseModel):
    id: int
    reference: str
    transaction_type: str
    amount: Decimal
    status: str
    sender_account_number: str | None
    receiver_account_number: str | None
    created_at: datetime


class TransactionDetailResponse(BaseModel):
    id: int
    reference: str
    transaction_type: str
    amount: Decimal
    status: str
    sender_account_id: int | None
    receiver_account_id: int | None
    sender_account_number: str | None
    receiver_account_number: str | None
    created_at: datetime