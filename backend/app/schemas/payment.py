from pydantic import BaseModel


class PaymentCreateRequest(BaseModel):
    amount: int
    currency: str = "inr"


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    amount: int