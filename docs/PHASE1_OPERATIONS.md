# VELQORIN sandbox — Phase 1 operations guide

Everything here runs in **sandbox mode**: balances are simulated and Stripe runs
in test mode. Live Stripe keys and live-mode events are refused while
`SANDBOX_MODE=true`.

## 1. Configuration

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to
`frontend/.env`, then fill in real values. Never commit either `.env` file.

Required secrets:

| Variable | How to create it |
|---|---|
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` (32+ chars; refused in production if weak) |
| `MFA_ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` — **back it up**: losing it means admins must re-enroll MFA |
| `SMTP_*` | Your transactional email provider. Gmail: `smtp.gmail.com`, `587`, `starttls`, and a 16-character App Password |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys (test mode: `sk_test_…` / `pk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen` (local) or the Dashboard webhook endpoint (deployed) |

The frontend and API must be on the **same site** (e.g. both `localhost`) so
the HttpOnly session cookie is sent. Don't mix `localhost` and `127.0.0.1`.

Run the backend with the project venv, not the global `py` launcher:

```powershell
# From the repository root
.\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload

# Or from backend/
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

## 2. Database migrations

The schema is managed by Alembic; the app no longer creates tables at startup.

**New database:** `cd backend && python -m alembic upgrade head`

**Database created before Phase 1** (tables already exist):

```bash
# 1. Back up first (store outside the repo; dumps contain customer data)
pg_dump -Fc --no-owner -d digital_banking_db -f ../../db-backups/before-phase1.dump
# 2. Mark the existing schema as the baseline (no changes are made)
python -m alembic stamp 0001_baseline
# 3. Apply Phase 1 (non-destructive)
python -m alembic upgrade head
# 4. Confirm models and schema agree
python -m alembic check
```

Migration `0002_phase1` only adds columns, constraints, indexes and tables and
renames `password_reset_codes` → `email_challenges` (rows kept). It records
each account's current balance in `ledger_opening_balances`; earlier history
stays in `transactions` without ledger entries (nothing is fabricated).

**Rollback:** prefer restoring the backup:
`pg_restore --clean --if-exists --no-owner -d digital_banking_db before-phase1.dump`.
`alembic downgrade 0001_baseline` also works and keeps users, accounts,
balances and transactions, but drops Phase 1 data (sessions, payments,
ledger, audit log, email tracking).

## 3. Existing customers and email verification

Existing users were migrated as **unverified** (there was no proof they own
their mailbox). They verify by either:

* logging in → "Verify my email" → requesting a code at `/verify-email`, or
* resetting their password at `/forgot-password` (the emailed code proves ownership).

Both require working SMTP.

## 4. Creating an administrator

There is no public admin sign-up and nothing is created at startup.

```bash
cd backend
python scripts/create_admin.py            # prompts for email, name, password (hidden)
```

Non-interactive: set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (and optionally
`ADMIN_NAME`) in the shell for that one command — never in a committed file.

The script validates the password (12+ chars, upper/lower/digit/symbol),
never modifies an existing account (re-running is a no-op), refuses to promote
a customer, records an `admin.created` audit event, and emails a verification
code. If the email can't be sent it says so; fix SMTP and run
`python scripts/create_admin.py --resend-verification --email <email>`.

Then: verify at `/verify-email`, sign in at `/admin/login`, and enroll an
authenticator app (TOTP). MFA is mandatory; there's no admin session until
a valid code is entered.

## 5. Stripe webhooks

The wallet is credited only from Stripe's data: a signature-verified webhook,
or a server-side lookup when the customer's page asks the server to re-check a
pending payment. Browser "success" callbacks never credit money.

Local development with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:8000/payments/stripe/webhook
# copy the printed whsec_... into STRIPE_WEBHOOK_SECRET and restart the API
```

Deployed: Dashboard → Developers → Webhooks → add
`https://<api-host>/payments/stripe/webhook` with events
`payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.canceled`, `payment_intent.processing`,
`payment_intent.requires_action`, `charge.refunded`.

Refunds are issued from the Stripe Dashboard (test mode); the
`charge.refunded` webhook debits the wallet once. If the wallet no longer has
enough money, the refund is flagged `needs_review` instead of going negative.

Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (declined).

## 6. Development-only demo funding

`POST /transactions/deposit` adds simulated money without a payment. It is
disabled unless `DEMO_FUNDING_ENABLED=true`, always refused when
`APP_ENV=production`, and audited (`demo_funding.used`).

## 7. Tests

```bash
cd backend
python -m pytest                                    # SQLite, fast
TEST_DATABASE_URL=postgresql://.../empty_test_db python -m pytest   # + row locks, triggers, concurrency
STRIPE_SANDBOX_TESTS=1 python -m pytest tests/test_stripe_sandbox.py # real Stripe test API

cd ../frontend
npm run lint && npm test && npm run build
```

`TEST_DATABASE_URL` must point to a dedicated, empty database: every table in
it is emptied between tests.

## 8. Production checklist (not yet done)

`APP_ENV=production`, `COOKIE_SECURE=true`, HTTPS + reverse proxy (HSTS is
sent automatically in production), strong rotated `SECRET_KEY`, backed-up
`MFA_ENCRYPTION_KEY`, Stripe webhook endpoint, monitored email delivery
(`email_notifications.status`), regular `pg_dump` with restore drills.
