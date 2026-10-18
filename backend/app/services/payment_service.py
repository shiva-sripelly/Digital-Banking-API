"""Stripe test-mode wallet top-ups (the only active payment provider).

Money is credited only from Stripe's own data, either a signature-verified
webhook or a server-side PaymentIntent retrieval, never from a browser
"success" callback. Each credit is guarded by a row lock on the payment, its
unique `transaction_id`, the unique transaction reference and the unique
ledger legs, so it can happen at most once.
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal

import stripe
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ledger import SYSTEM_STRIPE_CLEARING
from app.models.payment import PENDING_STATUSES, Payment, StripeWebhookEvent
from app.models.user import User
from app.repositories.account_repository import AccountRepository
from app.repositories.transaction_repository import TransactionRepository
from app.services.audit_service import AuditService
from app.services.ledger_service import Leg, LedgerService
from app.services.notification_service import Notifier

logger = logging.getLogger("app.payments")

stripe.api_key = settings.STRIPE_SECRET_KEY

HANDLED_INTENT_EVENTS = {
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "payment_intent.processing",
    "payment_intent.requires_action",
}


def _get(obj, key, default=None):
    """Read a field from a StripeObject or a plain dict."""
    try:
        value = obj[key]
    except (KeyError, TypeError, AttributeError):
        return default
    return default if value is None else value


def format_minor(amount_minor: int, currency: str) -> str:
    symbol = "₹" if currency.lower() == "inr" else currency.upper() + " "
    return f"{symbol}{Decimal(amount_minor) / 100:,.2f}"


def _stripe_error(exc: Exception) -> str:
    """Error type and Stripe code only. Stripe messages can include part of the API key."""
    return f"{type(exc).__name__} ({getattr(exc, 'code', None) or 'no code'})"


def _bad_request(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": code, "message": message})


class PaymentService:
    # --- Creating a top-up ---------------------------------------------------
    @staticmethod
    def create_payment(db: Session, user: User, amount_minor: int, idempotency_key: str) -> dict:
        currency = settings.STRIPE_CURRENCY.lower()
        if amount_minor < settings.PAYMENT_MIN_AMOUNT_MINOR or amount_minor > settings.PAYMENT_MAX_AMOUNT_MINOR:
            raise _bad_request(
                "invalid_amount",
                f"Amount must be between {format_minor(settings.PAYMENT_MIN_AMOUNT_MINOR, currency)} "
                f"and {format_minor(settings.PAYMENT_MAX_AMOUNT_MINOR, currency)}",
            )

        existing = (
            db.query(Payment)
            .filter(Payment.user_id == user.id, Payment.idempotency_key == idempotency_key)
            .first()
        )
        if existing:
            return PaymentService._replay(existing, amount_minor)

        account = AccountRepository.get_by_user_id(db, user.id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

        payment = Payment(
            user_id=user.id,
            account_id=account.id,
            idempotency_key=idempotency_key,
            amount_minor=amount_minor,
            currency=currency,
            status="pending",
        )
        db.add(payment)
        try:
            db.commit()
        except IntegrityError:
            # Same key submitted concurrently: return the winner
            db.rollback()
            winner = (
                db.query(Payment)
                .filter(Payment.user_id == user.id, Payment.idempotency_key == idempotency_key)
                .first()
            )
            return PaymentService._replay(winner, amount_minor)

        try:
            intent = stripe.PaymentIntent.create(
                amount=amount_minor,
                currency=currency,
                payment_method_types=["card"],
                description="VELQORIN sandbox wallet top-up",
                metadata={"payment_id": str(payment.id), "user_id": str(user.id), "account_id": str(account.id)},
                idempotency_key=f"nova-payment-{payment.id}",
            )
        except stripe.StripeError as exc:
            logger.warning("Stripe PaymentIntent creation failed for payment %s: %s", payment.id, _stripe_error(exc))
            payment.status = "failed"
            payment.failure_reason = "Could not start the payment with Stripe"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"code": "stripe_unavailable", "message": "Stripe payment could not be started. Please try again."},
            )

        payment.provider_payment_id = intent.id
        payment.livemode = bool(_get(intent, "livemode", False))
        db.commit()
        db.refresh(payment)
        return {**PaymentService.serialize(payment), "client_secret": intent.client_secret}

    @staticmethod
    def _replay(payment: Payment, amount_minor: int) -> dict:
        if payment.amount_minor != amount_minor:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "idempotency_conflict", "message": "This payment key was already used for a different amount."},
            )
        result = PaymentService.serialize(payment)
        if payment.provider_payment_id and payment.status in PENDING_STATUSES:
            try:
                result["client_secret"] = stripe.PaymentIntent.retrieve(payment.provider_payment_id).client_secret
            except stripe.StripeError as exc:
                logger.warning("could not retrieve PaymentIntent for replayed payment %s: %s", payment.id, _stripe_error(exc))
        return result

    # --- Webhooks -------------------------------------------------------------
    @staticmethod
    def handle_webhook(db: Session, payload: bytes, signature: str | None, ip: str) -> dict:
        if not settings.STRIPE_WEBHOOK_SECRET or not signature:
            raise _bad_request("invalid_signature", "Missing Stripe signature")
        try:
            event = stripe.Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.SignatureVerificationError):
            AuditService.record(
                db, "stripe.webhook_rejected", "system", ip_address=ip, details={"reason": "invalid_signature"}, commit=True
            )
            raise _bad_request("invalid_signature", "Invalid Stripe signature")

        if settings.SANDBOX_MODE and _get(event, "livemode", False):
            AuditService.record(
                db, "stripe.webhook_rejected", "system", ip_address=ip,
                details={"reason": "livemode_event", "event_id": event.id}, commit=True,
            )
            raise _bad_request("livemode_rejected", "Live-mode events are not accepted in sandbox mode")

        # Claim the event id first: a replay (sequential or concurrent) hits the
        # unique constraint and becomes a no-op.
        record = StripeWebhookEvent(event_id=event.id, event_type=event.type, outcome="processing", livemode=False)
        db.add(record)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return {"status": "duplicate"}

        obj = event.data.object
        try:
            if event.type in HANDLED_INTENT_EVENTS:
                payment, outcome = PaymentService.apply_intent(db, obj)
            elif event.type == "charge.refunded":
                payment, outcome = PaymentService.apply_refund(db, obj)
            else:
                payment, outcome = None, "ignored"

            record.payment_id = payment.id if payment else None
            record.outcome = outcome
            db.commit()
        except IntegrityError:
            db.rollback()
            return {"status": "duplicate"}

        PaymentService._notify(db, payment, outcome)
        return {"status": outcome}

    # --- Server-side status refresh (reconciliation) ---------------------------
    @staticmethod
    def sync_payment(db: Session, payment: Payment) -> Payment:
        """Pull the PaymentIntent from Stripe and apply its state, for when a
        webhook is delayed or can't reach this server. Uses Stripe's data only."""
        if not payment.provider_payment_id or payment.status not in PENDING_STATUSES:
            return payment
        try:
            intent = stripe.PaymentIntent.retrieve(payment.provider_payment_id)
        except stripe.StripeError as exc:
            logger.warning("Stripe retrieve failed for payment %s: %s", payment.id, _stripe_error(exc))
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"code": "stripe_unavailable", "message": "Could not reach Stripe. Please try again."},
            )
        try:
            _, outcome = PaymentService.apply_intent(db, intent)
            db.commit()
        except IntegrityError:
            db.rollback()
            outcome = "already_processed"
        db.refresh(payment)
        PaymentService._notify(db, payment, outcome)
        return payment

    # --- State application (shared by webhook and sync) ------------------------
    @staticmethod
    def _lock_payment(db: Session, intent_id: str) -> Payment | None:
        return (
            db.query(Payment)
            .filter(Payment.provider_payment_id == intent_id)
            .with_for_update()
            .populate_existing()
            .first()
        )

    @staticmethod
    def apply_intent(db: Session, intent) -> tuple[Payment | None, str]:
        payment = PaymentService._lock_payment(db, _get(intent, "id"))
        if payment is None:
            return None, "unknown_payment"

        intent_status = _get(intent, "status")
        metadata = _get(intent, "metadata", {}) or {}

        if intent_status == "succeeded":
            if payment.transaction_id is not None:
                return payment, "already_credited"

            problems = []
            if str(_get(metadata, "payment_id")) != str(payment.id):
                problems.append("payment_id")
            if str(_get(metadata, "user_id")) != str(payment.user_id):
                problems.append("user")
            if str(_get(metadata, "account_id")) != str(payment.account_id):
                problems.append("account")
            if int(_get(intent, "amount_received", 0)) != payment.amount_minor:
                problems.append("amount")
            if str(_get(intent, "currency", "")).lower() != payment.currency:
                problems.append("currency")
            if settings.SANDBOX_MODE and _get(intent, "livemode", False):
                problems.append("livemode")

            if problems:
                payment.reconciliation_status = "mismatch"
                payment.failure_reason = "Stripe data did not match: " + ", ".join(problems)
                AuditService.record(
                    db, "stripe.payment_mismatch", "system", None, "payment", payment.id,
                    details={"fields": problems, "intent": payment.provider_payment_id},
                )
                return payment, "rejected_mismatch"

            PaymentService._credit(db, payment)
            return payment, "credited"

        if payment.transaction_id is not None:
            return payment, "already_credited"

        if intent_status == "canceled":
            payment.status = "canceled"
            payment.failure_reason = _get(intent, "cancellation_reason") or "Payment was canceled"
            payment.reconciliation_status = "matched"
            return payment, "canceled"

        if intent_status == "requires_payment_method" and _get(intent, "last_payment_error"):
            error = _get(intent, "last_payment_error", {})
            payment.status = "failed"
            payment.failure_reason = str(_get(error, "message", "Payment failed"))[:250]
            payment.reconciliation_status = "matched"
            return payment, "failed"

        if intent_status == "processing":
            payment.status = "processing"
            return payment, "processing"
        if intent_status == "requires_action":
            payment.status = "requires_action"
            return payment, "requires_action"
        return payment, "pending"

    @staticmethod
    def _credit(db: Session, payment: Payment) -> None:
        account = AccountRepository.lock_accounts(db, [payment.account_id])[0]
        amount = Decimal(payment.amount_minor) / 100

        transaction = TransactionRepository.create_transaction(
            db=db,
            sender_account_id=None,
            receiver_account_id=account.id,
            amount=amount,
            transaction_type="stripe_topup",
            reference=payment.provider_payment_id,
            status="success",
        )
        account.balance += amount
        LedgerService.post(
            db,
            transaction,
            [Leg(amount, account_id=account.id), Leg(-amount, system_account=SYSTEM_STRIPE_CLEARING)],
            account.currency,
        )

        payment.status = "succeeded"
        payment.transaction_id = transaction.id
        payment.succeeded_at = datetime.now(timezone.utc)
        payment.failure_reason = None
        payment.reconciliation_status = "matched"
        db.flush()

    @staticmethod
    def apply_refund(db: Session, charge) -> tuple[Payment | None, str]:
        intent_id = _get(charge, "payment_intent")
        payment = PaymentService._lock_payment(db, intent_id) if intent_id else None
        if payment is None:
            return None, "unknown_payment"
        if payment.transaction_id is None:
            payment.reconciliation_status = "needs_review"
            return payment, "refund_before_credit"

        refunded_total = int(_get(charge, "amount_refunded", 0))
        delta = refunded_total - payment.amount_refunded_minor
        if delta <= 0:
            return payment, "refund_already_applied"

        account = AccountRepository.lock_accounts(db, [payment.account_id])[0]
        amount = Decimal(delta) / 100
        if account.balance < amount:
            # Never push a wallet negative: flag for review instead
            payment.reconciliation_status = "needs_review"
            AuditService.record(
                db, "stripe.refund_needs_review", "system", None, "payment", payment.id,
                details={"refund_minor": delta, "reason": "insufficient_wallet_balance"},
            )
            return payment, "refund_needs_review"

        transaction = TransactionRepository.create_transaction(
            db=db,
            sender_account_id=account.id,
            receiver_account_id=None,
            amount=amount,
            transaction_type="stripe_refund",
            reference=f"{_get(charge, 'id')}-refund-{refunded_total}",
            status="success",
        )
        account.balance -= amount
        LedgerService.post(
            db,
            transaction,
            [Leg(-amount, account_id=account.id), Leg(amount, system_account=SYSTEM_STRIPE_CLEARING)],
            account.currency,
        )
        payment.amount_refunded_minor = refunded_total
        payment.status = "refunded" if refunded_total >= payment.amount_minor else "partially_refunded"
        payment.reconciliation_status = "matched"
        return payment, "refunded"

    # --- Reads -------------------------------------------------------------------
    @staticmethod
    def serialize(payment: Payment, transaction_reference: str | None = None) -> dict:
        return {
            "id": payment.id,
            "provider": payment.provider,
            "provider_payment_id": payment.provider_payment_id,
            "amount_minor": payment.amount_minor,
            "amount_refunded_minor": payment.amount_refunded_minor,
            "currency": payment.currency,
            "status": payment.status,
            "failure_reason": payment.failure_reason,
            "reconciliation_status": payment.reconciliation_status,
            "transaction_reference": transaction_reference,
            "created_at": payment.created_at,
            "succeeded_at": payment.succeeded_at,
        }

    @staticmethod
    def _notify(db: Session, payment: Payment | None, outcome: str) -> None:
        if payment is None or outcome not in ("credited", "failed"):
            return
        user = db.get(User, payment.user_id)
        if user is None:
            return
        if outcome == "credited":
            account = AccountRepository.get_by_id(db, payment.account_id)
            Notifier.send(
                db, "payment_succeeded", user.email,
                {
                    "name": user.full_name,
                    "amount": format_minor(payment.amount_minor, payment.currency),
                    "reference": payment.provider_payment_id,
                    "balance": format_minor(int(account.balance * 100), payment.currency),
                },
                user_id=user.id, dedupe_key=f"payment-succeeded:{payment.id}",
            )
        else:
            Notifier.send(
                db, "payment_failed", user.email,
                {
                    "name": user.full_name,
                    "amount": format_minor(payment.amount_minor, payment.currency),
                    "reason": payment.failure_reason or "the card was declined",
                },
                user_id=user.id, dedupe_key=f"payment-failed:{payment.id}",
            )
