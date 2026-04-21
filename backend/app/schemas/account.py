from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime


class AccountResponse(BaseModel):
    id: int
    user_id: int
    account_number: str
    balance: Decimal
    currency: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }