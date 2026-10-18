import os
import re
import tempfile

from cryptography.fernet import Fernet

# Configure an isolated environment BEFORE the app is imported: a throwaway
# database, captured email, dummy third-party keys. Real env vars win over .env.
#
# Defaults to SQLite. Set TEST_DATABASE_URL to a *dedicated, empty* PostgreSQL
# database to also run the PostgreSQL-only tests (row locks, triggers). Every
# table in that database is emptied between tests.
TEST_DB = os.path.join(tempfile.gettempdir(), "digital_banking_test.db")
TEST_WEBHOOK_SECRET = "whsec_test_" + "a" * 32
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{TEST_DB}")
TEST_MIGRATION_DATABASE_URL = os.environ.get("TEST_MIGRATION_DATABASE_URL", TEST_DATABASE_URL)
TEST_MAINTENANCE_DATABASE_URL = os.environ.get("TEST_MAINTENANCE_DATABASE_URL", TEST_MIGRATION_DATABASE_URL)
TEST_SCHEMA_PREPARED = os.environ.get("TEST_SCHEMA_PREPARED", "false").lower() == "true"
os.environ.update({
    "APP_ENV": "test",
    "SANDBOX_MODE": "true",
    "DATABASE_URL": TEST_DATABASE_URL,
    "MIGRATION_DATABASE_URL": TEST_MIGRATION_DATABASE_URL,
    "SECRET_KEY": "test-secret-key-that-is-long-enough-1234567890",
    "MFA_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    "COOKIE_SECURE": "false",
    "CORS_ORIGINS": "http://localhost:5173",
    "FRONTEND_URL": "http://localhost:5173",
    "EMAIL_DELIVERY_MODE": "sync",
    "DEMO_FUNDING_ENABLED": "false",
    "ADMIN_MFA_REQUIRED": "true",
    "GEMINI_API_KEY": "test",
    "SMTP_HOST": "127.0.0.1",
    "SMTP_PORT": "1",
    "SMTP_USERNAME": "test",
    "SMTP_PASSWORD": "test",
    "SMTP_FROM": "noreply@example.com",
    "STRIPE_SECRET_KEY": "sk_test_dummy",
    "STRIPE_PUBLISHABLE_KEY": "pk_test_dummy",
    "STRIPE_WEBHOOK_SECRET": TEST_WEBHOOK_SECRET,
    "STRIPE_CURRENCY": "inr",
})

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from app.core.email import EmailDeliveryError
from app.main import app
from app.services.ai_service import AIService
from app.services.notification_service import dispatcher

IS_POSTGRES = engine.dialect.name == "postgresql"
postgres_only = pytest.mark.skipif(not IS_POSTGRES, reason="needs TEST_DATABASE_URL (PostgreSQL)")

if IS_POSTGRES:
    from sqlalchemy import create_engine

    migration_engine = create_engine(TEST_MIGRATION_DATABASE_URL)
    maintenance_engine = create_engine(TEST_MAINTENANCE_DATABASE_URL)
else:
    migration_engine = engine
    maintenance_engine = engine


# --- Database ----------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def schema():
    if IS_POSTGRES:
        # The real migrations, including the append-only triggers
        from alembic import command
        from alembic.config import Config

        cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
        if TEST_SCHEMA_PREPARED:
            # A restricted-role test database is migrated and granted before
            # pytest starts. Re-running upgrade verifies that only the
            # migration connection can inspect/manage the schema without
            # discarding its carefully scoped runtime grants.
            command.upgrade(cfg, "head")
        else:
            Base.metadata.drop_all(bind=migration_engine)
            with migration_engine.begin() as conn:
                conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
            command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def fresh_db():
    if IS_POSTGRES:
        if maintenance_engine.url.database == "digital_banking_db":
            raise RuntimeError("PostgreSQL tests refuse to clean the development database")
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        with maintenance_engine.begin() as conn:
            if maintenance_engine.url.username == "velqorin_migrator":
                # The migration owner may clean only this explicitly guarded,
                # disposable test database. DDL is transactional: any failure
                # rolls the temporary trigger state back automatically.
                protected = ("transactions", "ledger_entries", "audit_events")
                for table in protected:
                    conn.execute(text(f"ALTER TABLE {table} DISABLE TRIGGER USER"))
                conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
                for table in protected:
                    conn.execute(text(f"ALTER TABLE {table} ENABLE TRIGGER USER"))
            else:
                # Legacy test-owner cleanup. Application requests and Alembic
                # never receive this connection.
                conn.execute(text("SET session_replication_role = replica"))
                conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
                conn.execute(text("SET session_replication_role = DEFAULT"))
    else:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
    yield


# --- External services ------------------------------------------------------------------

class FakeTransport:
    """Captures outgoing email instead of using SMTP. `fail_with` simulates
    a provider error."""

    def __init__(self):
        self.sent = []
        self.fail_with: EmailDeliveryError | None = None

    def send(self, email):
        if self.fail_with:
            raise self.fail_with
        self.sent.append(email)
        return f"<test-{len(self.sent)}@example.com>"

    def to(self, address):
        return [m for m in self.sent if m.to_email == address.lower()]

    def latest_code(self, address):
        for message in reversed(self.to(address)):
            match = re.search(r"\b(\d{6})\b", message.text)
            if match:
                return match.group(1)
        raise AssertionError(f"no code emailed to {address}")


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    transport = FakeTransport()
    monkeypatch.setattr(dispatcher, "transport", transport)
    return transport


@pytest.fixture(autouse=True)
def offline_gemini(monkeypatch):
    """Force the AI service onto its rule-based fallback; no network calls."""
    class OfflineModels:
        def generate_content(self, **kwargs):
            raise RuntimeError("Gemini disabled in tests")

    class OfflineClient:
        models = OfflineModels()

    monkeypatch.setattr(AIService, "client", OfflineClient())


@pytest.fixture
def demo_funding(monkeypatch):
    monkeypatch.setattr(settings, "DEMO_FUNDING_ENABLED", True)


# --- Clients & users ----------------------------------------------------------------------

def new_client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def client():
    return new_client()


def register(client, full_name, email, password="secret123"):
    return client.post("/auth/register", json={"full_name": full_name, "email": email, "password": password})


def verify(client, outbox, email):
    return client.post("/auth/verify-email", json={"email": email, "code": outbox.latest_code(email)})


def login(client, email, password="secret123"):
    """Log in; on success the client keeps the session cookie and sends the CSRF header."""
    resp = client.post("/auth/login", data={"username": email, "password": password})
    if resp.status_code == 200:
        client.headers["X-CSRF-Token"] = resp.json()["csrf_token"]
    return resp


@pytest.fixture
def make_user(outbox):
    """Register, verify and log in a customer in its own client.
    Returns (client, account json)."""
    def _make(full_name="Alice Test", email="alice@example.com", password="secret123"):
        c = new_client()
        assert register(c, full_name, email, password).status_code == 202
        assert verify(c, outbox, email).status_code == 200
        assert login(c, email, password).status_code == 200
        return c, c.get("/accounts/me").json()
    return _make


@pytest.fixture
def funded_user(make_user, demo_funding):
    def _make(amount=500, **kwargs):
        c, account = make_user(**kwargs)
        assert c.post("/transactions/deposit", json={"amount": amount}).status_code == 200
        return c, c.get("/accounts/me").json()
    return _make
