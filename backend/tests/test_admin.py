import sys
from decimal import Decimal

import pytest

from app.core.database import SessionLocal
from app.core.security import decrypt_secret, totp_at, TOTP_STEP_SECONDS
from app.models.audit_event import AuditEvent
from app.models.auth_session import AuthSession
from app.models.user import User
from scripts import create_admin
from tests.conftest import login, new_client

ADMIN_EMAIL = "ops.admin@example.com"
ADMIN_PASSWORD = "Str0ng!Admin#Pass"


def run_create_admin(monkeypatch, *args, email=ADMIN_EMAIL, password=ADMIN_PASSWORD):
    monkeypatch.setenv("ADMIN_EMAIL", email)
    if password is None:
        monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    else:
        monkeypatch.setenv("ADMIN_PASSWORD", password)
    monkeypatch.setenv("ADMIN_NAME", "Ops Admin")
    monkeypatch.setattr(sys, "argv", ["create_admin.py", *args])
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False, raising=False)
    return create_admin.main()


def _user(email):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()


@pytest.fixture
def admin_client(monkeypatch, outbox):
    """Provision, verify email, enroll MFA and return a signed-in admin client."""
    assert run_create_admin(monkeypatch) == 0
    c = new_client()
    assert c.post("/auth/verify-email", json={"email": ADMIN_EMAIL, "code": outbox.latest_code(ADMIN_EMAIL)}).status_code == 200

    step1 = c.post("/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()
    assert step1["mfa_required"] and step1["enrollment_required"]
    secret = step1["enrollment"]["secret"]
    resp = c.post("/admin/auth/mfa", json={"mfa_token": step1["mfa_token"], "code": totp_at(secret)})
    assert resp.status_code == 200
    c.headers["X-CSRF-Token"] = resp.json()["csrf_token"]
    c.mfa_secret = secret
    return c


# --- Provisioning script ----------------------------------------------------------------------

def test_create_admin_provisions_securely(monkeypatch, outbox, capsys):
    assert run_create_admin(monkeypatch) == 0
    out = capsys.readouterr().out
    assert ADMIN_PASSWORD not in out and ADMIN_EMAIL not in out  # email is masked too

    admin = _user(ADMIN_EMAIL)
    assert admin.role == "admin" and admin.email_verified is False and admin.mfa_enabled is False
    assert admin.hashed_password.startswith("$2") and ADMIN_PASSWORD not in admin.hashed_password
    assert outbox.latest_code(ADMIN_EMAIL)

    db = SessionLocal()
    try:
        assert db.query(AuditEvent).filter_by(action="admin.created").count() == 1
    finally:
        db.close()


def test_create_admin_is_idempotent_and_never_overwrites(monkeypatch, capsys):
    assert run_create_admin(monkeypatch) == 0
    before = _user(ADMIN_EMAIL).hashed_password
    assert run_create_admin(monkeypatch, password="An0ther!Strong#Pass") == 0
    assert "already exists" in capsys.readouterr().out
    assert _user(ADMIN_EMAIL).hashed_password == before


def test_create_admin_never_promotes_customers(monkeypatch, make_user):
    make_user()
    assert run_create_admin(monkeypatch, email="alice@example.com") == 1
    assert _user("alice@example.com").role == "customer"


def test_create_admin_rejects_weak_passwords(monkeypatch):
    assert run_create_admin(monkeypatch, password="weakpassword") == 2
    assert _user(ADMIN_EMAIL) is None


def test_create_admin_reports_email_failure(monkeypatch, outbox, capsys):
    from app.core.email import EmailDeliveryError

    outbox.fail_with = EmailDeliveryError("SMTP authentication rejected (code 535)", permanent=True)
    assert run_create_admin(monkeypatch) == 3
    assert "could not be sent" in capsys.readouterr().out


# --- Admin sign-in & MFA ----------------------------------------------------------------------

def test_admin_login_requires_verified_email(monkeypatch):
    run_create_admin(monkeypatch)
    resp = new_client().post("/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert resp.status_code == 403 and resp.json()["detail"]["code"] == "email_not_verified"


def test_admin_mfa_is_mandatory_and_codes_cannot_be_replayed(admin_client):
    secret = admin_client.mfa_secret
    stored = _user(ADMIN_EMAIL)
    assert stored.mfa_enabled and decrypt_secret(stored.mfa_secret_encrypted) == secret
    assert secret not in (stored.mfa_secret_encrypted or "")  # encrypted at rest

    c = new_client()
    step1 = c.post("/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()
    assert step1["enrollment_required"] is False and "enrollment" not in step1
    # Password alone gives no access
    assert c.get("/admin/metrics").status_code == 401
    # The code already used during enrollment is rejected
    used_code = totp_at(secret)
    assert c.post("/admin/auth/mfa", json={"mfa_token": step1["mfa_token"], "code": used_code}).status_code == 401
    assert c.post("/admin/auth/mfa", json={"mfa_token": step1["mfa_token"], "code": "000000"}).status_code == 401

    import time
    next_code = totp_at(secret, time.time() + TOTP_STEP_SECONDS)
    assert c.post("/admin/auth/mfa", json={"mfa_token": step1["mfa_token"], "code": next_code}).status_code == 200


def test_customer_credentials_do_not_grant_admin_access(make_user):
    customer, _ = make_user()
    resp = new_client().post("/admin/auth/login", json={"email": "alice@example.com", "password": "secret123"})
    assert resp.status_code == 401
    # A customer session cookie does not work on admin APIs
    assert customer.get("/admin/metrics").status_code == 401
    forged = new_client()
    forged.cookies.set("nb_admin_session", customer.cookies.get("nb_session"), path="/admin")
    assert forged.get("/admin/metrics").status_code == 401


def test_admin_cannot_use_customer_login(admin_client):
    resp = login(new_client(), ADMIN_EMAIL, ADMIN_PASSWORD)
    assert resp.status_code == 403 and resp.json()["detail"]["code"] == "use_admin_portal"


def test_admin_logout_revokes_session(admin_client):
    assert admin_client.post("/admin/auth/logout").status_code == 200
    assert admin_client.get("/admin/auth/me").status_code == 401


# --- Dashboard & management ---------------------------------------------------------------------

def test_metrics_use_real_data(admin_client, make_user, funded_user, client):
    funded_user(300)
    make_user("Bob Test", "bob@example.com")
    client.post("/auth/register", json={"full_name": "Carol Test", "email": "carol@example.com", "password": "secret123"})

    metrics = admin_client.get("/admin/metrics").json()
    assert metrics["customers"] == {"total": 3, "verified": 2, "unverified": 1, "active": 3, "inactive": 0}
    assert Decimal(metrics["wallets"]["total_balance"]) == 300
    assert metrics["ledger"]["status"] == "matched"


def test_customer_list_search_filter_and_masking(admin_client, make_user, client):
    make_user()
    make_user("Bob Test", "bob@example.com")
    client.post("/auth/register", json={"full_name": "Carol Test", "email": "carol@example.com", "password": "secret123"})

    everyone = admin_client.get("/admin/customers?page_size=2").json()
    assert everyone["total"] == 3 and len(everyone["items"]) == 2 and everyone["pages"] == 2
    assert admin_client.get("/admin/customers?search=bob").json()["items"][0]["email"] == "bob@example.com"
    unverified = admin_client.get("/admin/customers?verified=false").json()["items"]
    assert [u["email"] for u in unverified] == ["carol@example.com"]

    row = everyone["items"][0]
    assert row["account_number_masked"].startswith("••••") and len(row["account_number_masked"]) == 8
    assert "hashed_password" not in str(everyone) and "mfa" not in str(everyone)


def test_deactivation_is_audited_and_revokes_access(admin_client, make_user, outbox):
    customer, _ = make_user()
    user_id = customer.get("/auth/me").json()["user"]["id"]

    assert admin_client.post(f"/admin/customers/{user_id}/status", json={"is_active": False, "reason": "x"}).status_code == 422
    resp = admin_client.post(f"/admin/customers/{user_id}/status", json={"is_active": False, "reason": "Suspected fraud review"})
    assert resp.status_code == 200 and resp.json()["is_active"] is False
    assert customer.get("/accounts/me").status_code == 401
    assert login(new_client(), "alice@example.com").json()["detail"]["code"] == "account_inactive"
    assert any("status changed" in m.subject for m in outbox.to("alice@example.com"))

    db = SessionLocal()
    try:
        event = db.query(AuditEvent).filter_by(action="admin.customer_deactivated").one()
        assert event.target_id == str(user_id) and event.details["reason"] == "Suspected fraud review"
        assert db.query(AuthSession).filter_by(user_id=user_id, revoked_at=None).count() == 0
    finally:
        db.close()

    admin_client.post(f"/admin/customers/{user_id}/status", json={"is_active": True, "reason": "Review cleared"})
    assert login(new_client(), "alice@example.com").status_code == 200


def test_admin_requests_need_csrf_token(admin_client, make_user):
    customer, _ = make_user()
    user_id = customer.get("/auth/me").json()["user"]["id"]
    del admin_client.headers["X-CSRF-Token"]
    resp = admin_client.post(f"/admin/customers/{user_id}/status", json={"is_active": False, "reason": "No CSRF token"})
    assert resp.status_code == 403


def test_admin_cannot_change_balances(admin_client, funded_user):
    customer, account = funded_user(300)
    attempts = [
        ("put", f"/admin/accounts/{account['id']}", {"balance": 1_000_000}),
        ("patch", f"/admin/accounts/{account['id']}", {"balance": 1_000_000}),
        ("post", f"/admin/accounts/{account['id']}/balance", {"balance": 1_000_000}),
        ("post", "/admin/transactions", {"amount": 1_000_000}),
        ("delete", "/admin/transactions/1", None),
        ("post", "/admin/payments/1/credit", {}),
    ]
    for method, path, body in attempts:
        kwargs = {"json": body} if body is not None else {}
        assert getattr(admin_client, method)(path, **kwargs).status_code in (404, 405), path
    assert Decimal(customer.get("/accounts/me").json()["balance"]) == 300


def test_transaction_and_audit_monitoring(admin_client, funded_user, make_user):
    alice, _ = funded_user(100)
    _, bob = make_user("Bob Test", "bob@example.com")
    alice.post("/transactions/transfer", json={"receiver_account_number": bob["account_number"], "amount": 25})

    txns = admin_client.get("/admin/transactions?type=transfer").json()
    assert txns["total"] == 1
    item = txns["items"][0]
    assert item["receiver_account_masked"] == "••••" + bob["account_number"][-4:]
    detail = admin_client.get(f"/admin/transactions/{item['id']}").json()
    assert [leg["amount"] for leg in detail["ledger_entries"]] == ["-25.00", "25.00"]

    searched = admin_client.get(f"/admin/transactions?search={item['reference'][-6:]}").json()
    assert searched["total"] == 1

    audit = admin_client.get("/admin/audit-events?action=admin.").json()
    assert any(e["action"] == "admin.login_succeeded" for e in audit["items"])
    assert admin_client.get("/admin/reconciliation").json()["status"] == "matched"
