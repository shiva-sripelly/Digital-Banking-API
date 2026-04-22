from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.schemas.ai import AIQueryRequest, AIQueryResponse
from app.services.ai_service import AIService
from app.repositories.account_repository import AccountRepository
from app.repositories.transaction_repository import TransactionRepository

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


@router.post("/query", response_model=AIQueryResponse)
def ai_query(
    payload: AIQueryRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    account = AccountRepository.get_by_user_id(db, current_user.id)
    transactions = TransactionRepository.get_transactions_by_account_id(db, account.id) if account else []
    answer = AIService.ask_banking_assistant(current_user, account, transactions, payload.query)
    return {
        "query": payload.query,
        "answer": answer
    }