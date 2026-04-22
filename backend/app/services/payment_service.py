import hmac
import hashlib
import stripe
import razorpay
from fastapi import HTTPException
from app.core.config import settings
from app.models.account import Account
from app.models.transaction import Transaction
from sqlalchemy.orm import Session
from datetime import datetime
import random
import string

stripe.api_key = settings.STRIPE_SECRET_KEY


class PaymentService:
    razorpay_client = razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )

    @staticmethod
    def create_stripe_payment_intent(amount: int, currency: str = "inr"):
        if amount < 5000:
            raise HTTPException(
                status_code=400,
                detail="Minimum amount for Stripe is ₹50"
    )

        return stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            payment_method_types=["card"],
        )

    @staticmethod
    def create_razorpay_order(amount: int, currency: str = "INR"):
        return PaymentService.razorpay_client.order.create({
            "amount": amount,
            "currency": currency,
            "payment_capture": 1
        })

    @staticmethod
    def verify_razorpay_signature(order_id: str, payment_id: str, signature: str):
        body = f"{order_id}|{payment_id}"
        expected = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(),
            body.encode(),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    
    @staticmethod
    def generate_reference():
        return "TXN" + "".join(random.choices(string.ascii_uppercase + string.digits, k=10))

    @staticmethod
    def process_razorpay_payment(db: Session, user, amount: float):
        account = db.query(Account).filter(Account.user_id == user.id).first()

        if not account:
            raise Exception("Account not found")

        account.balance += amount

        txn = Transaction(
            sender_account_id=None,
            receiver_account_id=account.id,
            amount=amount,
            transaction_type="deposit",
            reference=PaymentService.generate_reference(),
            status="success",
            created_at=datetime.utcnow()
        )

        db.add(txn)
        db.commit()
        db.refresh(account)

        return {
            "new_balance": account.balance,
            "reference": txn.reference
        }