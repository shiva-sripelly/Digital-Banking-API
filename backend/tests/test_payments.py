"""Stripe wallet top-ups. Stripe's API is faked here; webhook payloads are
signed exactly as Stripe signs them, and the real SDK verifies them."""
import hashlib
import hmac
import itertools
import json
import time
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
import stripe

from app.core.database import SessionLocal
from app.models.ledger import LedgerEntry
from app.models.payment import Payment, StripeWebhookEvent
from tests.conftest import TEST_WEBHOOK_SECRET, new_client, postgres_only

_ids = itertools.count(1)


class FakeStripe:
    def __init__(self):
        self.intents = {}
        self.created = []

    def create(self, **kwargs):
        self.created.append(kwargs)
        intent_id = f"pi_test_{next(_ids)}"
        data = {
            "id": intent_id,
            "object": "payment_intent",
            "amount": kwargs["amount"],
            "amount_received": 0,
            "currency": kwargs["currency"],
            "status": "requires_payment_method",
            "metadata": kwargs["metadata"],
            "client_secret": f"{intent_id}_secret_abc",
            "livemode": False,
            "last_payment_error": None,
        }
        self.intents[intent_id] = data
        return stripe.PaymentIntent.construct_from(data, "sk_test_dummy")

    def retrieve(self, intent_id, **kwargs):
        return stripe.PaymentIntent.construct_from(self.intents[intent_id], "sk_test_dummy")

    def succeed(self, intent_id, **overrides):
        intent = self.intents[intent_id]
        intent.update({"status": "succeeded", "amount_received": intent["amount"], **overrides})
        return intent


@pytest.fixture
def fake_stripe(monkeypatch):
    fake = FakeStripe()
    monkeypatch.setattr(stripe.PaymentIntent, "create", fake.create)
    monkeypatch.setattr(stripe.PaymentIntent, "retrieve", fake.retrieve)
    return fake


def signed_event(event_type, obj, event_id=None, livemode=False, secret=TEST_WEBHOOK_SECRET):
    payload = json.dumps({
        "id": event_id or f"evt_{next(_ids)}",
        "object": "event",
        "type": event_type,
        "livemode": livemode,
        "created": int(time.time()),
        "data": {"object": obj},
    })
    timestamp = int(time.time())
    signature = hmac.new(secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256).hexdigest()
    return payload, {"Stripe-Signature": f"t={timestamp},v1={signature}", "Content-Type": "application/json"}


def post_event(event_type, obj, **kwargs):
    payload, headers = signed_event(event_type, obj, **kwargs)
    return new_client().post("/payments/stripe/webhook", content=payload, headers=headers)


def create_payment(client, amount_minor=10000, key="topup-key-0001"):
    return client.post("/payments", json={"amount_minor": amount_minor, "idempotency_key": key})


def balance(client):
    return Decimal(client.get("/accounts/me").json()["balance"])


# --- Creating payments -------------------------------------------------------------------------

def test_create_payment_starts_a_pending_stripe_intent(make_user, fake_stripe):
    c, account = make_user()
    resp = create_payment(c)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending" and body["client_secret"].startswith("pi_test_")
    created = fake_stripe.created[0]
    assert created["amount"] == 10000 and created["currency"] == "inr"
    assert created["metadata"]["account_id"] == str(account["id"])
    assert created["idempotency_key"] == f"nova-payment-{body['id']}"
    assert balance(c) == 0  # nothing credited yet


def test_payment_creation_is_idempotent(make_user, fake_stripe):
    c, _ = make_user()
    first = create_payment(c).json()
    retry = create_payment(c).json()
    assert first["id"] == retry["id"] and len(fake_stripe.created) == 1
    assert create_payment(c, amount_minor=20000).status_code == 409


def test_payment_amount_limits(make_user, fake_stripe):
    c, _ = make_user()
    assert create_payment(c, amount_minor=4999).status_code == 400
    assert create_payment(c, amount_minor=10_000_001, key="topup-key-0002").status_code == 400


def test_browser_cannot_credit_the_wallet(make_user, fake_stripe):
    c, _ = make_user()
    create_payment(c)
    # The old trust-the-browser endpoints are gone
    assert c.post("/payments/stripe/confirm", json={"payment_intent_id": "pi_x"}).status_code in (404, 405)
    assert c.post("/payments/razorpay/verify", json={}).status_code in (404, 405)
    assert balance(c) == 0


# --- Webhooks -------------------------------------------------------------------------------------

def test_valid_webhook_credits_wallet_exactly_once(make_user, fake_stripe, outbox):
    c, account = make_user()
    payment = create_payment(c).json()
    intent = fake_stripe.succeed(payment["provider_payment_id"])

    first = post_event("payment_intent.succeeded", intent, event_id="evt_same")
    assert first.status_code == 200 and first.json()["status"] == "credited"
    assert balance(c) == 100

    replay = post_event("payment_intent.succeeded", intent, event_id="evt_same")
    assert replay.json()["status"] == "duplicate"
    second_event = post_event("payment_intent.succeeded", intent)
    assert second_event.json()["status"] == "already_credited"
    assert balance(c) == 100

    receipt = c.get(f"/payments/{payment['id']}").json()
    assert receipt["status"] == "succeeded" and receipt["transaction_reference"] == intent["id"]
    assert any("successful" in m.subject for m in outbox.to("alice@example.com"))

    db = SessionLocal()
    try:
        legs = db.query(LedgerEntry).all()
        assert sorted(leg.amount for leg in legs) == [Decimal("-100.00"), Decimal("100.00")]
        assert {leg.system_account for leg in legs} == {None, "stripe_clearing"}
    finally:
        db.close()


def test_invalid_signature_is_rejected(make_user, fake_stripe):
    c, _ = make_user()
    payment = create_payment(c).json()
    intent = fake_stripe.succeed(payment["provider_payment_id"])
    payload, headers = signed_event("payment_intent.succeeded", intent, secret="whsec_wrong_secret")
    resp = new_client().post("/payments/stripe/webhook", content=payload, headers=headers)
    assert resp.status_code == 400
    assert new_client().post("/payments/stripe/webhook", content=payload).status_code == 400
    assert balance(c) == 0


@pytest.mark.parametrize(
    "override,field",
    [({"amount_received": 999}, "amount"), ({"currency": "usd"}, "currency")],
)
def test_amount_or_currency_mismatch_is_not_credited(make_user, fake_stripe, override, field):
    c, _ = make_user()
    payment = create_payment(c).json()
    intent = fake_stripe.succeed(payment["provider_payment_id"], **override)
    resp = post_event("payment_intent.succeeded", intent)
    assert resp.json()["status"] == "rejected_mismatch"
    assert balance(c) == 0
    detail = c.get(f"/payments/{payment['id']}").json()
    assert detail["reconciliation_status"] == "mismatch" and field in detail["failure_reason"]


def test_payment_for_another_customer_is_not_credited(make_user, fake_stripe):
    alice, _ = make_user()
    bob, bob_account = make_user("Bob Test", "bob@example.com")
    payment = create_payment(alice).json()
    intent = fake_stripe.succeed(
        payment["provider_payment_id"],
        metadata={"payment_id": str(payment["id"]), "user_id": "999", "account_id": str(bob_account["id"])},
    )
    assert post_event("payment_intent.succeeded", intent).json()["status"] == "rejected_mismatch"
    assert balance(alice) == 0 and balance(bob) == 0
    # Bob cannot even see Alice's payment
    assert bob.get(f"/payments/{payment['id']}").status_code == 404


def test_livemode_events_are_rejected_in_sandbox(make_user, fake_stripe):
    c, _ = make_user()
    payment = create_payment(c).json()
    intent = fake_stripe.succeed(payment["provider_payment_id"])
    assert post_event("payment_intent.succeeded", intent, livemode=True).status_code == 400
    assert balance(c) == 0


def test_failed_and_canceled_payments(make_user, fake_stripe, outbox):
    c, _ = make_user()
    failed = create_payment(c, key="topup-key-fail").json()
    intent = fake_stripe.intents[failed["provider_payment_id"]]
    intent.update(status="requires_payment_method", last_payment_error={"message": "Your card was declined."})
    assert post_event("payment_intent.payment_failed", intent).json()["status"] == "failed"
    assert c.get(f"/payments/{failed['id']}").json()["failure_reason"] == "Your card was declined."
    assert any("did not go through" in m.subject for m in outbox.to("alice@example.com"))

    canceled = create_payment(c, key="topup-key-cancel").json()
    intent = fake_stripe.intents[canceled["provider_payment_id"]]
    intent.update(status="canceled", cancellation_reason="abandoned")
    assert post_event("payment_intent.canceled", intent).json()["status"] == "canceled"
    assert balance(c) == 0


def test_refunds_debit_the_wallet_once_and_never_below_zero(make_user, fake_stripe):
    c, _ = make_user()
    payment = create_payment(c, amount_minor=20000).json()
    intent = fake_stripe.succeed(payment["provider_payment_id"])
    post_event("payment_intent.succeeded", intent)
    assert balance(c) == 200

    charge = {"id": "ch_test_1", "object": "charge", "payment_intent": intent["id"], "amount_refunded": 5000}
    assert post_event("charge.refunded", charge).json()["status"] == "refunded"
    assert post_event("charge.refunded", charge).json()["status"] == "refund_already_applied"
    assert balance(c) == 150
    assert c.get(f"/payments/{payment['id']}").json()["status"] == "partially_refunded"

    c.post("/transactions/withdraw", json={"amount": 140})  # spend most of it
    charge["amount_refunded"] = 20000
    assert post_event("charge.refunded", charge).json()["status"] == "refund_needs_review"
    assert balance(c) == 10  # not pushed negative
    assert c.get(f"/payments/{payment['id']}").json()["reconciliation_status"] == "needs_review"


def test_refresh_uses_stripe_server_side(make_user, fake_stripe):
    c, _ = make_user()
    payment = create_payment(c).json()
    assert c.post(f"/payments/{payment['id']}/refresh").json()["status"] == "pending"
    fake_stripe.succeed(payment["provider_payment_id"])
    assert c.post(f"/payments/{payment['id']}/refresh").json()["status"] == "succeeded"
    assert c.post(f"/payments/{payment['id']}/refresh").json()["status"] == "succeeded"
    assert balance(c) == 100


def test_payment_history_lists_own_payments(make_user, fake_stripe):
    c, _ = make_user()
    create_payment(c, key="topup-key-a")
    create_payment(c, key="topup-key-b", amount_minor=6000)
    history = c.get("/payments").json()
    assert history["total"] == 2 and history["items"][0]["amount_minor"] == 6000


def test_ledger_reconciles_after_payments_and_transfers(make_user, fake_stripe):
    from app.services.ledger_service import LedgerService

    alice, _ = make_user()
    _, bob = make_user("Bob Test", "bob@example.com")
    payment = create_payment(alice).json()
    post_event("payment_intent.succeeded", fake_stripe.succeed(payment["provider_payment_id"]))
    alice.post("/transactions/transfer", json={"receiver_account_number": bob["account_number"], "amount": 30})

    db = SessionLocal()
    try:
        report = LedgerService.reconcile(db)
        assert report["status"] == "matched" and report["unbalanced_transactions"] == 0
    finally:
        db.close()


@postgres_only
def test_concurrent_webhook_replays_credit_once(make_user, fake_stripe):
    c, _ = make_user()
    payment = create_payment(c).json()
    intent = fake_stripe.succeed(payment["provider_payment_id"])
    payload, headers = signed_event("payment_intent.succeeded", intent, event_id="evt_concurrent")

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: new_client().post("/payments/stripe/webhook", content=payload, headers=headers), range(6)))

    assert all(r.status_code == 200 for r in results)
    assert sorted(r.json()["status"] for r in results).count("credited") == 1
    assert balance(c) == 100

    db = SessionLocal()
    try:
        assert db.query(StripeWebhookEvent).count() == 1
        assert db.query(Payment).one().status == "succeeded"
    finally:
        db.close()
