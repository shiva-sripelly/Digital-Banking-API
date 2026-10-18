"""Opt-in integration tests against the real Stripe TEST-mode API.

    STRIPE_SANDBOX_TESTS=1 python -m pytest tests/test_stripe_sandbox.py

Reads the test secret key from backend/.env (it must start with sk_test_).
Creates real test PaymentIntents and refunds; no real money is involved.
Stripe can't deliver webhooks to localhost without the Stripe CLI, so real
events are fetched from the Stripe API and posted to the webhook endpoint
signed with the test webhook secret.
"""
import hashlib
import hmac
import json
import os
import time
from decimal import Decimal
from pathlib import Path

import pytest
import stripe
from dotenv import dotenv_values

from tests.conftest import TEST_WEBHOOK_SECRET, new_client

REAL_KEY = dotenv_values(Path(__file__).resolve().parents[1] / ".env").get("STRIPE_SECRET_KEY", "")

pytestmark = pytest.mark.skipif(
    os.environ.get("STRIPE_SANDBOX_TESTS") != "1" or not REAL_KEY.startswith("sk_test_"),
    reason="set STRIPE_SANDBOX_TESTS=1 with a Stripe test key in backend/.env",
)


@pytest.fixture(autouse=True)
def real_stripe(monkeypatch):
    monkeypatch.setattr(stripe, "api_key", REAL_KEY)


def wait_for_event(event_type, object_id, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for event in stripe.Event.list(type=event_type, limit=20).data:
            obj = event.data.object
            if obj.id == object_id or obj.get("payment_intent") == object_id:
                return event
        time.sleep(2)
    raise AssertionError(f"Stripe did not emit {event_type} for {object_id}")


def post_signed(event):
    payload = json.dumps(event.to_dict())
    ts = int(time.time())
    sig = hmac.new(TEST_WEBHOOK_SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return new_client().post(
        "/payments/stripe/webhook", content=payload, headers={"Stripe-Signature": f"t={ts},v1={sig}"}
    )


def balance(client):
    return Decimal(client.get("/accounts/me").json()["balance"])


def start_payment(client, key, amount_minor=10000):
    resp = client.post("/payments", json={"amount_minor": amount_minor, "idempotency_key": key})
    assert resp.status_code == 201, resp.text
    payment = resp.json()
    intent = stripe.PaymentIntent.retrieve(payment["provider_payment_id"])
    assert intent.livemode is False and intent.metadata["payment_id"] == str(payment["id"])
    return payment


def test_real_payment_credited_via_server_side_check(make_user):
    c, _ = make_user()
    payment = start_payment(c, f"sandbox-{int(time.time())}-a")

    stripe.PaymentIntent.confirm(payment["provider_payment_id"], payment_method="pm_card_visa", return_url="http://localhost:5173/payments")
    assert c.post(f"/payments/{payment['id']}/refresh").json()["status"] == "succeeded"
    assert balance(c) == 100
    assert c.post(f"/payments/{payment['id']}/refresh").json()["status"] == "succeeded"
    assert balance(c) == 100  # exactly once


def test_real_stripe_events_through_the_webhook(make_user):
    c, _ = make_user()
    payment = start_payment(c, f"sandbox-{int(time.time())}-b", amount_minor=20000)
    intent_id = payment["provider_payment_id"]
    stripe.PaymentIntent.confirm(intent_id, payment_method="pm_card_visa", return_url="http://localhost:5173/payments")

    succeeded = wait_for_event("payment_intent.succeeded", intent_id)
    assert post_signed(succeeded).json()["status"] == "credited"
    assert post_signed(succeeded).json()["status"] == "duplicate"
    assert balance(c) == 200

    stripe.Refund.create(payment_intent=intent_id, amount=5000)
    refunded = wait_for_event("charge.refunded", intent_id)
    assert post_signed(refunded).json()["status"] == "refunded"
    assert balance(c) == 150
    assert c.get(f"/payments/{payment['id']}").json()["status"] == "partially_refunded"


def test_real_declined_card_is_recorded_as_failed(make_user):
    c, _ = make_user()
    payment = start_payment(c, f"sandbox-{int(time.time())}-c")
    with pytest.raises(stripe.CardError):
        stripe.PaymentIntent.confirm(payment["provider_payment_id"], payment_method="pm_card_chargeDeclined", return_url="http://localhost:5173/payments")

    failed = wait_for_event("payment_intent.payment_failed", payment["provider_payment_id"])
    assert post_signed(failed).json()["status"] == "failed"
    detail = c.get(f"/payments/{payment['id']}").json()
    assert detail["status"] == "failed" and "declined" in detail["failure_reason"].lower()
    assert balance(c) == 0
