"""Admin read models and the one admin write action in Phase 1
(activate/deactivate a customer). Financial data is read-only: there is no
operation here that changes balances, payments or ledger entries."""
from decimal import Decimal

import stripe
from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from app.models.account import Account
from app.models.audit_event import AuditEvent
from app.models.auth_session import AuthSession
from app.models.ledger import LedgerEntry
from app.models.payment import PENDING_STATUSES, REFUND_STATUSES, Payment
from app.models.transaction import Transaction
from app.models.user import ROLE_CUSTOMER, User
from app.services.audit_service import AuditService
from app.services.ledger_service import LedgerService
from app.services.notification_service import Notifier
from app.services.session_service import SessionService
from app.utils.helpers import mask_account_number


def _page(query, page: int, page_size: int):
    total = query.order_by(None).count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, {"page": page, "page_size": page_size, "total": total, "pages": max(1, -(-total // page_size))}


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


class AdminService:
    # --- Dashboard ---------------------------------------------------------------
    @staticmethod
    def metrics(db: Session) -> dict:
        customers = db.query(User).filter(User.role == ROLE_CUSTOMER)
        total = customers.count()
        verified = customers.filter(User.email_verified.is_(True)).count()
        active = customers.filter(User.is_active.is_(True)).count()

        wallet_total = db.query(func.coalesce(func.sum(Account.balance), 0)).scalar()
        transfers = db.query(func.count(Transaction.id), func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.transaction_type == "transfer"
        ).one()

        by_status = dict(db.query(Payment.status, func.count(Payment.id)).group_by(Payment.status).all())
        reconciliation = LedgerService.reconcile(db)

        return {
            "customers": {
                "total": total,
                "verified": verified,
                "unverified": total - verified,
                "active": active,
                "inactive": total - active,
            },
            "wallets": {"total_balance": str(Decimal(wallet_total)), "accounts": db.query(Account).count()},
            "transfers": {"count": transfers[0], "total_amount": str(Decimal(transfers[1]))},
            "payments": {
                "succeeded": by_status.get("succeeded", 0),
                "pending": sum(by_status.get(s, 0) for s in PENDING_STATUSES),
                "failed": by_status.get("failed", 0),
                "canceled": by_status.get("canceled", 0),
                "refunded": sum(by_status.get(s, 0) for s in REFUND_STATUSES),
                "needs_attention": db.query(Payment)
                .filter(Payment.reconciliation_status.in_(("mismatch", "needs_review")))
                .count(),
            },
            "ledger": {
                "status": reconciliation["status"],
                "mismatched_accounts": len(reconciliation["mismatched_accounts"]),
                "unbalanced_transactions": reconciliation["unbalanced_transactions"],
            },
        }

    # --- Customers -----------------------------------------------------------------
    @staticmethod
    def _customer_row(user: User, account: Account | None) -> dict:
        return {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "is_active": bool(user.is_active),
            "email_verified": bool(user.email_verified),
            "created_at": user.created_at,
            "last_login_at": user.last_login_at,
            "account_number_masked": mask_account_number(account.account_number) if account else None,
        }

    @staticmethod
    def list_customers(db: Session, page: int, page_size: int, search: str | None, verified: bool | None, active: bool | None):
        query = (
            db.query(User, Account)
            .outerjoin(Account, Account.user_id == User.id)
            .filter(User.role == ROLE_CUSTOMER)
        )
        if search:
            term = f"%{search.strip().lower()}%"
            query = query.filter(or_(func.lower(User.email).like(term), func.lower(User.full_name).like(term)))
        if verified is not None:
            query = query.filter(User.email_verified.is_(verified))
        if active is not None:
            query = query.filter(User.is_active.is_(active))

        rows, meta = _page(query.order_by(User.created_at.desc(), User.id.desc()), page, page_size)
        return {"items": [AdminService._customer_row(u, a) for u, a in rows], **meta}

    @staticmethod
    def customer_detail(db: Session, user_id: int) -> dict:
        user = db.query(User).filter(User.id == user_id, User.role == ROLE_CUSTOMER).first()
        if not user:
            raise _not_found("Customer")
        account = db.query(Account).filter(Account.user_id == user.id).first()

        txn_count = 0
        if account:
            txn_count = (
                db.query(Transaction)
                .filter(or_(Transaction.sender_account_id == account.id, Transaction.receiver_account_id == account.id))
                .count()
            )
        payments = db.query(Payment).filter(Payment.user_id == user.id).order_by(Payment.created_at.desc()).limit(5).all()
        active_sessions = (
            db.query(AuthSession).filter(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)).count()
        )
        return {
            **AdminService._customer_row(user, account),
            "balance": str(account.balance) if account else None,
            "currency": account.currency if account else None,
            "transaction_count": txn_count,
            "open_sessions": active_sessions,
            "recent_payments": [
                {"id": p.id, "status": p.status, "amount_minor": p.amount_minor, "currency": p.currency, "created_at": p.created_at}
                for p in payments
            ],
        }

    @staticmethod
    def set_customer_status(db: Session, admin: User, user_id: int, is_active: bool, reason: str, ip: str) -> dict:
        user = db.query(User).filter(User.id == user_id, User.role == ROLE_CUSTOMER).with_for_update().first()
        if not user:
            raise _not_found("Customer")
        if bool(user.is_active) == is_active:
            return AdminService.customer_detail(db, user_id)

        user.is_active = is_active
        revoked = 0
        if not is_active:
            revoked = SessionService.revoke_all_for_user(db, user.id, "deactivated_by_admin")
        AuditService.record(
            db,
            "admin.customer_activated" if is_active else "admin.customer_deactivated",
            "admin", admin.id, "user", user.id, ip,
            {"reason": reason, "sessions_revoked": revoked},
        )
        db.commit()

        Notifier.send(
            db, "account_status_changed", user.email,
            {"name": user.full_name, "state": "reactivated" if is_active else "deactivated", "reason": reason},
            user_id=user.id,
        )
        return AdminService.customer_detail(db, user_id)

    # --- Transactions ----------------------------------------------------------------
    @staticmethod
    def list_transactions(db: Session, page: int, page_size: int, search: str | None, txn_type: str | None, txn_status: str | None):
        sender = aliased(Account)
        receiver = aliased(Account)
        query = (
            db.query(Transaction, sender.account_number, receiver.account_number, Payment.provider_payment_id)
            .outerjoin(sender, Transaction.sender_account_id == sender.id)
            .outerjoin(receiver, Transaction.receiver_account_id == receiver.id)
            .outerjoin(Payment, Payment.transaction_id == Transaction.id)
        )
        if search:
            query = query.filter(func.lower(Transaction.reference).like(f"%{search.strip().lower()}%"))
        if txn_type:
            query = query.filter(Transaction.transaction_type == txn_type)
        if txn_status:
            query = query.filter(Transaction.status == txn_status)

        rows, meta = _page(query.order_by(Transaction.created_at.desc(), Transaction.id.desc()), page, page_size)
        return {
            "items": [
                {
                    "id": txn.id,
                    "reference": txn.reference,
                    "transaction_type": txn.transaction_type,
                    "amount": str(txn.amount),
                    "status": txn.status,
                    "sender_account_masked": mask_account_number(s),
                    "receiver_account_masked": mask_account_number(r),
                    "stripe_payment_id": stripe_id,
                    "created_at": txn.created_at,
                }
                for txn, s, r, stripe_id in rows
            ],
            **meta,
        }

    @staticmethod
    def transaction_detail(db: Session, transaction_id: int) -> dict:
        sender = aliased(Account)
        receiver = aliased(Account)
        row = (
            db.query(Transaction, sender.account_number, receiver.account_number, Payment)
            .outerjoin(sender, Transaction.sender_account_id == sender.id)
            .outerjoin(receiver, Transaction.receiver_account_id == receiver.id)
            .outerjoin(Payment, Payment.transaction_id == Transaction.id)
            .filter(Transaction.id == transaction_id)
            .first()
        )
        if not row:
            raise _not_found("Transaction")
        txn, s, r, payment = row
        legs = db.query(LedgerEntry).filter(LedgerEntry.transaction_id == txn.id).order_by(LedgerEntry.leg).all()
        return {
            "id": txn.id,
            "reference": txn.reference,
            "transaction_type": txn.transaction_type,
            "amount": str(txn.amount),
            "status": txn.status,
            "sender_account_masked": mask_account_number(s),
            "receiver_account_masked": mask_account_number(r),
            "stripe_payment_id": payment.provider_payment_id if payment else None,
            "payment_id": payment.id if payment else None,
            "created_at": txn.created_at,
            "ledger_entries": [
                {
                    "leg": leg.leg,
                    "account": mask_account_number(
                        db.get(Account, leg.account_id).account_number) if leg.account_id else None,
                    "system_account": leg.system_account,
                    "amount": str(leg.amount),
                }
                for leg in legs
            ],
            "ledger_note": None if legs else "Recorded before the ledger was introduced (no ledger entries).",
        }

    # --- Payments ------------------------------------------------------------------
    @staticmethod
    def _payment_row(payment: Payment, email: str | None, reference: str | None) -> dict:
        return {
            "id": payment.id,
            "customer_email": email,
            "provider": payment.provider,
            "provider_payment_id": payment.provider_payment_id,
            "amount_minor": payment.amount_minor,
            "amount_refunded_minor": payment.amount_refunded_minor,
            "currency": payment.currency,
            "status": payment.status,
            "reconciliation_status": payment.reconciliation_status,
            "failure_reason": payment.failure_reason,
            "transaction_reference": reference,
            "created_at": payment.created_at,
            "succeeded_at": payment.succeeded_at,
        }

    @staticmethod
    def list_payments(db: Session, page: int, page_size: int, payment_status: str | None, search: str | None):
        query = (
            db.query(Payment, User.email, Transaction.reference)
            .join(User, User.id == Payment.user_id)
            .outerjoin(Transaction, Transaction.id == Payment.transaction_id)
        )
        if payment_status == "pending":
            query = query.filter(Payment.status.in_(PENDING_STATUSES))
        elif payment_status == "refunded":
            query = query.filter(Payment.status.in_(REFUND_STATUSES))
        elif payment_status == "attention":
            query = query.filter(Payment.reconciliation_status.in_(("mismatch", "needs_review")))
        elif payment_status:
            query = query.filter(Payment.status == payment_status)
        if search:
            term = f"%{search.strip().lower()}%"
            query = query.filter(or_(func.lower(Payment.provider_payment_id).like(term), func.lower(User.email).like(term)))

        rows, meta = _page(query.order_by(Payment.created_at.desc(), Payment.id.desc()), page, page_size)
        return {"items": [AdminService._payment_row(p, e, r) for p, e, r in rows], **meta}

    @staticmethod
    def payment_detail(db: Session, payment_id: int, check_stripe: bool) -> dict:
        row = (
            db.query(Payment, User.email, Transaction.reference)
            .join(User, User.id == Payment.user_id)
            .outerjoin(Transaction, Transaction.id == Payment.transaction_id)
            .filter(Payment.id == payment_id)
            .first()
        )
        if not row:
            raise _not_found("Payment")
        payment, email, reference = row
        result = AdminService._payment_row(payment, email, reference)

        if check_stripe and payment.provider_payment_id:
            # Read-only comparison with Stripe; nothing is changed here
            try:
                intent = stripe.PaymentIntent.retrieve(payment.provider_payment_id)
                stripe_status = intent.status
                local_credited = payment.transaction_id is not None
                consistent = (stripe_status == "succeeded") == local_credited or payment.status in REFUND_STATUSES
                result["stripe_check"] = {
                    "stripe_status": stripe_status,
                    "stripe_amount_received": intent.amount_received,
                    "consistent": consistent,
                }
            except stripe.StripeError as exc:
                result["stripe_check"] = {"error": f"Could not reach Stripe: {type(exc).__name__}"}
        return result

    # --- Audit & reconciliation ---------------------------------------------------
    @staticmethod
    def list_audit_events(db: Session, page: int, page_size: int, action: str | None):
        query = db.query(AuditEvent, User.email).outerjoin(User, User.id == AuditEvent.actor_user_id)
        if action:
            query = query.filter(AuditEvent.action.like(f"{action}%"))
        rows, meta = _page(query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()), page, page_size)
        return {
            "items": [
                {
                    "id": event.id,
                    "created_at": event.created_at,
                    "action": event.action,
                    "actor_type": event.actor_type,
                    "actor_email": email,
                    "target_type": event.target_type,
                    "target_id": event.target_id,
                    "ip_address": event.ip_address,
                    "details": event.details,
                }
                for event, email in rows
            ],
            **meta,
        }

    @staticmethod
    def reconciliation(db: Session) -> dict:
        return LedgerService.reconcile(db)
