from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from app.core.database import SessionLocal
from app.models.audit_event import AuditEvent
from app.models.ledger import LedgerEntry
from app.models.transaction import Transaction
from tests.conftest import postgres_only


def balance(client):
    return Decimal(client.get("/accounts/me").json()["balance"])


def transfer(client, account_number, amount, key=None):
    headers = {"Idempotency-Key": key} if key else {}
    return client.post(
        "/transactions/transfer",
        json={"receiver_account_number": account_number, "amount": amount},
        headers=headers,
    )


def test_customer_deposit_without_payment_is_disabled(make_user):
    c, _ = make_user()
    resp = c.post("/transactions/deposit", json={"amount": 500})
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "demo_funding_disabled"
    assert balance(c) == 0


def test_demo_funding_when_enabled_is_audited_and_posted_to_ledger(make_user, demo_funding):
    c, _ = make_user()
    resp = c.post("/transactions/deposit", json={"amount": 500})
    assert resp.status_code == 200
    assert balance(c) == 500

    db = SessionLocal()
    try:
        txn = db.query(Transaction).one()
        assert txn.transaction_type == "demo_funding"
        assert db.query(AuditEvent).filter_by(action="demo_funding.used").count() == 1
        legs = db.query(LedgerEntry).filter_by(transaction_id=txn.id).all()
        assert sum(leg.amount for leg in legs) == 0 and len(legs) == 2
    finally:
        db.close()


def test_withdraw_updates_balance_and_ledger(funded_user):
    c, _ = funded_user(500)
    resp = c.post("/transactions/withdraw", json={"amount": 120.5})
    assert resp.status_code == 200
    assert Decimal(resp.json()["balance"]) == Decimal("379.50")

    resp = c.post("/transactions/withdraw", json={"amount": 1000})
    assert resp.json()["detail"] == "Insufficient balance"
    assert balance(c) == Decimal("379.50")


def test_non_positive_amounts_are_rejected(make_user):
    c, _ = make_user()
    for amount in (0, -5):
        assert c.post("/transactions/withdraw", json={"amount": amount}).status_code == 422


def test_transfer_moves_money_and_posts_balanced_ledger(funded_user, make_user, outbox):
    alice, _ = funded_user(300)
    bob, bob_account = make_user("Bob Test", "bob@example.com")

    resp = transfer(alice, bob_account["account_number"], 75)
    assert resp.status_code == 200
    assert balance(alice) == 225 and balance(bob) == 75

    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter_by(transaction_type="transfer").one()
        legs = db.query(LedgerEntry).filter_by(transaction_id=txn.id).order_by(LedgerEntry.leg).all()
        assert [leg.amount for leg in legs] == [Decimal("-75.00"), Decimal("75.00")]
    finally:
        db.close()

    assert any(m.subject == "Transfer confirmation" for m in outbox.to("alice@example.com"))
    assert any(m.subject == "You received money" for m in outbox.to("bob@example.com"))


def test_transfer_with_same_idempotency_key_runs_once(funded_user, make_user):
    alice, _ = funded_user(300)
    _, bob = make_user("Bob Test", "bob@example.com")

    first = transfer(alice, bob["account_number"], 50, key="transfer-key-0001")
    retry = transfer(alice, bob["account_number"], 50, key="transfer-key-0001")
    assert first.status_code == retry.status_code == 200
    assert first.json()["reference"] == retry.json()["reference"]
    assert balance(alice) == 250

    conflict = transfer(alice, bob["account_number"], 60, key="transfer-key-0001")
    assert conflict.status_code == 409


def test_transfer_validation(funded_user, make_user):
    alice, alice_account = funded_user(50)
    _, bob = make_user("Bob Test", "bob@example.com")

    assert transfer(alice, alice_account["account_number"], 10).json()["detail"] == "You cannot transfer funds to your own account"
    assert transfer(alice, "1000000000", 10).status_code == 404
    assert transfer(alice, bob["account_number"], 50.01).json()["detail"] == "Insufficient balance"
    assert balance(alice) == 50


def test_history_and_detail_are_scoped_to_the_owner(funded_user, make_user):
    alice, _ = funded_user(100)
    bob, bob_account = make_user("Bob Test", "bob@example.com")
    carol, _ = make_user("Carol Test", "carol@example.com")
    transfer(alice, bob_account["account_number"], 40)

    history = alice.get("/transactions/history").json()
    assert {t["transaction_type"] for t in history} == {"transfer", "demo_funding"}
    transfer_id = next(t["id"] for t in history if t["transaction_type"] == "transfer")

    assert alice.get(f"/transactions/{transfer_id}").status_code == 200
    detail = bob.get(f"/transactions/{transfer_id}")
    assert detail.json()["receiver_account_number"] == bob_account["account_number"]
    assert carol.get(f"/transactions/{transfer_id}").status_code == 403
    assert alice.get("/transactions/99999").status_code == 404


def test_historical_rows_without_ledger_remain_readable(make_user):
    """Pre-Phase-1 deposits (and any provider references such as Razorpay
    'pay_...' ids) stay visible in history unchanged."""
    c, account = make_user()
    db = SessionLocal()
    try:
        db.add(Transaction(receiver_account_id=account["id"], amount=Decimal("250.00"), transaction_type="deposit",
                           reference="pay_LegacyRazorpay01", status="success"))
        db.commit()
    finally:
        db.close()

    history = c.get("/transactions/history").json()
    assert history[0]["reference"] == "pay_LegacyRazorpay01"
    assert history[0]["transaction_type"] == "deposit"


@postgres_only
def test_concurrent_withdrawals_cannot_overdraw(funded_user):
    c, _ = funded_user(100)

    def withdraw(_):
        return c.post("/transactions/withdraw", json={"amount": 30}).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = list(pool.map(withdraw, range(6)))

    successes = codes.count(200)
    assert successes == 3
    assert balance(c) == 100 - 30 * successes


@postgres_only
def test_concurrent_identical_transfers_with_one_key_move_money_once(funded_user, make_user):
    alice, _ = funded_user(500)
    _, bob = make_user("Bob Test", "bob@example.com")

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(lambda _: transfer(alice, bob["account_number"], 100, key="same-key-123456"), range(5)))

    assert all(r.status_code == 200 for r in results)
    assert len({r.json()["reference"] for r in results}) == 1
    assert balance(alice) == 400


@postgres_only
def test_ledger_is_append_only_in_postgres(funded_user):
    import pytest
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError

    funded_user(100)
    db = SessionLocal()
    try:
        with pytest.raises(DBAPIError, match="append-only"):
            db.execute(text("UPDATE ledger_entries SET amount = 999"))
        db.rollback()
        with pytest.raises(DBAPIError, match="append-only"):
            db.execute(text("DELETE FROM ledger_entries"))
    finally:
        db.rollback()
        db.close()
