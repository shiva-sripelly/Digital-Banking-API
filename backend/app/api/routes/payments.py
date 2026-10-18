from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import PAYMENT_CREATE_PER_USER, PAYMENT_SYNC_PER_USER, RateLimiter
from app.core.request_context import client_ip
from app.models.payment import Payment
from app.models.transaction import Transaction
from app.schemas.payment import PaymentCreateRequest
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Payments (Stripe test mode)"])


def _own_payment(db: Session, payment_id: int, user_id: int) -> Payment:
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.user_id == user_id).first()
    if payment is None:
        # 404 (not 403) so payment ids of other customers aren't confirmed
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def _with_reference(db: Session, payment: Payment) -> dict:
    reference = None
    if payment.transaction_id:
        reference = db.query(Transaction.reference).filter(Transaction.id == payment.transaction_id).scalar()
    return PaymentService.serialize(payment, reference)


@router.get("/config")
def payment_config(current_user=Depends(get_current_user)):
    return {
        "provider": "stripe",
        "test_mode": settings.SANDBOX_MODE,
        "currency": settings.STRIPE_CURRENCY.lower(),
        "min_amount_minor": settings.PAYMENT_MIN_AMOUNT_MINOR,
        "max_amount_minor": settings.PAYMENT_MAX_AMOUNT_MINOR,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_payment(payload: PaymentCreateRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    RateLimiter.hit(db, PAYMENT_CREATE_PER_USER, str(current_user.id))
    return PaymentService.create_payment(db, current_user, payload.amount_minor, payload.idempotency_key)


@router.get("")
def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(Payment).filter(Payment.user_id == current_user.id)
    total = query.count()
    payments = query.order_by(Payment.created_at.desc(), Payment.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [_with_reference(db, p) for p in payments],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": max(1, -(-total // page_size)),
    }


@router.get("/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _with_reference(db, _own_payment(db, payment_id, current_user.id))


@router.post("/{payment_id}/refresh")
def refresh_payment(payment_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Re-check a pending payment directly with Stripe (server-to-server)."""
    RateLimiter.hit(db, PAYMENT_SYNC_PER_USER, str(current_user.id))
    payment = _own_payment(db, payment_id, current_user.id)
    PaymentService.sync_payment(db, payment)
    return _with_reference(db, payment)


@router.post("/stripe/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    return PaymentService.handle_webhook(db, payload, request.headers.get("stripe-signature"), client_ip(request))
