from app.core.database import SessionLocal
from app.models.user import User
from tests.conftest import login, new_client, register


def reset(client, code, new_password="newpass123", email="alice@example.com"):
    return client.post("/auth/reset-password", json={"email": email, "code": code, "new_password": new_password})


def test_forgot_password_response_does_not_reveal_registered_emails(make_user, outbox):
    make_user()
    c = new_client()
    known = c.post("/auth/forgot-password", json={"email": "alice@example.com"})
    unknown = c.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert {k: v for k, v in known.json().items() if k != "email"} == {k: v for k, v in unknown.json().items() if k != "email"}
    assert outbox.to("nobody@example.com") == []


def test_reset_password_revokes_sessions_and_notifies(make_user, outbox):
    signed_in, _ = make_user()
    c = new_client()
    c.post("/auth/forgot-password", json={"email": "alice@example.com"})
    code = outbox.latest_code("alice@example.com")

    assert reset(c, code).status_code == 200
    assert signed_in.get("/auth/me").status_code == 401  # old session revoked
    assert login(new_client(), "alice@example.com", "secret123").status_code == 401
    assert login(new_client(), "alice@example.com", "newpass123").status_code == 200
    assert any("password was changed" in m.subject for m in outbox.to("alice@example.com"))


def test_reset_code_is_single_use_and_attempt_limited(make_user, outbox):
    make_user()
    c = new_client()
    c.post("/auth/forgot-password", json={"email": "alice@example.com"})
    code = outbox.latest_code("alice@example.com")
    for _ in range(5):
        assert reset(c, "000000").status_code == 400
    assert reset(c, code).status_code == 400  # locked out


def test_reset_proves_mailbox_ownership_for_unverified_users(client, outbox):
    register(client, "Alice Test", "alice@example.com")
    client.post("/auth/forgot-password", json={"email": "alice@example.com"})
    reset_code = [m for m in outbox.to("alice@example.com") if "reset" in m.subject.lower()]
    assert reset_code
    import re
    code = re.search(r"\b(\d{6})\b", reset_code[-1].text).group(1)

    assert reset(client, code).status_code == 200
    db = SessionLocal()
    try:
        assert db.query(User).filter(User.email == "alice@example.com").one().email_verified is True
    finally:
        db.close()


def test_reset_codes_never_appear_in_responses_or_logs(make_user, outbox, caplog):
    make_user()
    c = new_client()
    resp = c.post("/auth/forgot-password", json={"email": "alice@example.com"})
    code = outbox.latest_code("alice@example.com")
    assert code not in resp.text
    assert code not in caplog.text


def test_reset_validates_input(client):
    assert reset(client, "12ab").status_code == 422
    assert reset(client, "123456", new_password="short").status_code == 422
