from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.schemas.payment import PaymentCreateRequest, RazorpayVerifyRequest
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Payments"])



@router.post("/stripe/create-intent")
def create_stripe_intent(
    payload: PaymentCreateRequest,
    current_user=Depends(get_current_user)
):
    intent = PaymentService.create_stripe_payment_intent(
        amount=payload.amount,
        currency=payload.currency
    )
    return {
        "client_secret": intent.client_secret,
        "payment_intent_id": intent.id
    }


@router.post("/razorpay/create-order")
def create_razorpay_order(
    payload: PaymentCreateRequest,
    current_user=Depends(get_current_user)
):
    try:
        order = PaymentService.create_razorpay_order(
            amount=payload.amount,
            currency=payload.currency.upper()
        )

        return {
            "id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "status": order["status"]
        }

    except Exception as e:
        print("RAZORPAY CREATE ORDER ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create Razorpay order"
        )



@router.post("/razorpay/verify")
def verify_razorpay_payment(
    payload: RazorpayVerifyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    try:
        is_valid = PaymentService.verify_razorpay_signature(
            payload.razorpay_order_id,
            payload.razorpay_payment_id,
            payload.razorpay_signature
        )

        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

        # 🔥 NEW: update balance + save transaction
        result = PaymentService.process_razorpay_payment(
            db=db,
            user=current_user,
            amount=payload.amount / 100  # convert paise → rupees
        )

        return {
            "message": "Payment successful",
            "balance": result["new_balance"],
            "reference": result["reference"]
        }

    except Exception as e:
        print("VERIFY ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Payment verification failed")