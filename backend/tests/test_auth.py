from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.models.auth_session import AuthSession
from app.models.email_challenge import EmailChallenge
from app.models.email_notification import EmailNotification
from app.models.user import User
from tests.conftest import login, new_client, register, verify


def _db_user(email):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()


def _age_challenge(email, purpose="email_verification", **changes):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        challenge = db.query(EmailChallenge).filter_by(user_id=user.id, purpose=purpose).first()
        for key, value in changes.items():
            setattr(challenge, key, value)
        db.commit()
    finally:
        db.close()


# --- Registration & email verification -----------------------------------------------

def test_register_creates_unverified_customer_and_emails_a_code(client, outbox):
    resp = register(client, "Alice Test", "alice@example.com")
    assert resp.status_code == 202
    body = resp.json()
    assert body["email"] == "alice@example.com"
    assert body["code_expires_in"] == 600

    user = _db_user("alice@example.com")
    assert user.role == "customer" and user.email_verified is False
    code = outbox.latest_code("alice@example.com")
    assert code not in resp.text

    db = SessionLocal()
    try:
        challenge = db.query(EmailChallenge).filter_by(user_id=user.id).one()
        assert challenge.code_hash != code and len(challenge.code_hash) == 64  # only a hash is stored
        notification = db.query(EmailNotification).filter_by(template="verify_email").one()
        assert notification.status == "accepted"
    finally:
        db.close()


def test_unverified_customer_cannot_log_in(client):
    register(client, "Alice Test", "alice@example.com")
    resp = login(client, "alice@example.com")
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "email_not_verified"


def test_verification_then_login_succeeds(client, outbox):
    register(client, "Alice Test", "alice@example.com")
    assert verify(client, outbox, "alice@example.com").status_code == 200
    assert any(m.subject.startswith("Welcome") for m in outbox.to("alice@example.com"))

    resp = login(client, "alice@example.com")
    assert resp.status_code == 200
    cookie = resp.headers["set-cookie"]
    assert "nb_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "access_token" not in resp.json()  # the session lives only in the cookie
    assert client.get("/auth/me").json()["user"]["email_verified"] is True


def test_invalid_code_is_rejected(client):
    register(client, "Alice Test", "alice@example.com")
    resp = client.post("/auth/verify-email", json={"email": "alice@example.com", "code": "000000"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_code"


def test_code_cannot_be_replayed(client, outbox):
    register(client, "Alice Test", "alice@example.com")
    code = outbox.latest_code("alice@example.com")
    payload = {"email": "alice@example.com", "code": code}
    assert client.post("/auth/verify-email", json=payload).status_code == 200
    assert client.post("/auth/verify-email", json=payload).status_code == 400


def test_expired_code_is_rejected(client, outbox):
    register(client, "Alice Test", "alice@example.com")
    _age_challenge("alice@example.com", expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    assert verify(client, outbox, "alice@example.com").status_code == 400
    assert _db_user("alice@example.com").email_verified is False


def test_code_locks_after_max_attempts(client, outbox):
    register(client, "Alice Test", "alice@example.com")
    for _ in range(5):
        client.post("/auth/verify-email", json={"email": "alice@example.com", "code": "000000"})
    assert verify(client, outbox, "alice@example.com").status_code == 400


def test_resend_has_cooldown_and_hourly_limit(client, outbox):
    register(client, "Alice Test", "alice@example.com")
    assert len(outbox.to("alice@example.com")) == 1

    # Inside the cooldown: same generic response, no new email
    resp = client.post("/auth/resend-verification", json={"email": "alice@example.com"})
    assert resp.status_code == 200
    assert len(outbox.to("alice@example.com")) == 1

    _age_challenge("alice@example.com", created_at=datetime.now(timezone.utc) - timedelta(minutes=2))
    client.post("/auth/resend-verification", json={"email": "alice@example.com"})
    assert len(outbox.to("alice@example.com")) == 2

    for _ in range(3):
        client.post("/auth/resend-verification", json={"email": "alice@example.com"})
    limited = client.post("/auth/resend-verification", json={"email": "alice@example.com"})
    assert limited.status_code == 429


def test_registration_does_not_reveal_existing_accounts(client, outbox):
    register(client, "Alice Test", "alice@example.com")
    verify(client, outbox, "alice@example.com")

    again = register(new_client(), "Someone Else", "alice@example.com", "other123")
    fresh = register(new_client(), "Bob Test", "bob@example.com")
    assert again.status_code == fresh.status_code == 202
    assert set(again.json()) == set(fresh.json())
    assert again.json()["message"] == fresh.json()["message"]

    # The real owner is told; no second account or password change
    assert any("Sign-up attempt" in m.subject for m in outbox.to("alice@example.com"))
    assert login(new_client(), "alice@example.com", "secret123").status_code == 200


def test_register_validates_fields(client):
    resp = register(client, "A", "not-an-email", "short")
    assert resp.status_code == 422
    assert {e["loc"][-1] for e in resp.json()["detail"]} == {"full_name", "email", "password"}
    assert register(client, "Alice Test", "a@example.com", "lettersonly").status_code == 422


# --- Login -----------------------------------------------------------------------------

def test_invalid_login_is_generic(client, make_user):
    make_user()
    wrong = login(new_client(), "alice@example.com", "wrong-pass1")
    unknown = login(new_client(), "nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_login_is_rate_limited_per_email(make_user):
    make_user()
    for _ in range(5):
        login(new_client(), "alice@example.com", "wrong-pass1")
    # Even the correct password is refused while limited
    assert login(new_client(), "alice@example.com").status_code == 429


def test_inactive_customer_cannot_log_in_or_use_existing_session(make_user):
    c, _ = make_user()
    db = SessionLocal()
    try:
        db.query(User).filter(User.email == "alice@example.com").update({"is_active": False})
        db.commit()
    finally:
        db.close()

    assert c.get("/accounts/me").status_code == 401
    resp = login(new_client(), "alice@example.com")
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "account_inactive"


def test_logout_revokes_the_session(make_user):
    c, _ = make_user()
    stolen_cookie = c.cookies.get("nb_session")
    assert c.post("/auth/logout").status_code == 200
    assert c.get("/auth/me").status_code == 401

    replay = new_client()
    replay.cookies.set("nb_session", stolen_cookie)
    assert replay.get("/auth/me").status_code == 401


def test_expired_session_is_rejected(make_user):
    c, _ = make_user()
    db = SessionLocal()
    try:
        db.query(AuthSession).update({"expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)})
        db.commit()
    finally:
        db.close()
    assert c.get("/auth/me").status_code == 401


def test_state_changing_requests_need_csrf_token(funded_user, make_user):
    c, _ = funded_user()
    _, bob = make_user("Bob Test", "bob@example.com")
    del c.headers["X-CSRF-Token"]
    resp = c.post("/transactions/transfer", json={"receiver_account_number": bob["account_number"], "amount": 10})
    assert resp.status_code == 403


def test_foreign_origin_is_rejected(client):
    resp = client.post("/auth/login", data={"username": "x@example.com", "password": "x"}, headers={"Origin": "https://evil.example"})
    assert resp.status_code == 403


def test_protected_routes_reject_anonymous_requests(client):
    for method, path in [
        ("get", "/accounts/me"),
        ("get", "/transactions/history"),
        ("post", "/transactions/transfer"),
        ("post", "/payments"),
        ("post", "/ai/query"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path


def test_security_headers_present(client):
    resp = client.get("/")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"


def test_session_endpoint_reports_signed_out_without_error(client, make_user):
    assert client.get("/auth/session").json() == {"user": None}
    c, _ = make_user()
    body = c.get("/auth/session").json()
    assert body["user"]["email"] == "alice@example.com" and body["csrf_token"]
