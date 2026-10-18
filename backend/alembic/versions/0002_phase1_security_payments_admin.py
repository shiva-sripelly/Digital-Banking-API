"""Phase 1: roles, email verification, sessions, audit log, Stripe payments,
append-only double-entry ledger, email delivery tracking, rate limits.

Non-destructive: only adds columns, constraints, indexes and tables, and
renames `password_reset_codes` to `email_challenges` (rows kept). Existing
users become role=customer and email_verified=false (no evidence of mailbox
ownership exists yet). Existing balances are captured as ledger opening
balances; no historical ledger entries are fabricated.

Revision ID: 0002_phase1
Revises: 0001_baseline
Create Date: 2026-10-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_phase1"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

APPEND_ONLY_TABLES = ("ledger_entries", "audit_events")


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # --- users: role, verification, MFA ------------------------------------
    op.add_column("users", sa.Column("role", sa.String(20), nullable=False, server_default="customer"))
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("mfa_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_last_used_step", sa.BigInteger(), nullable=True))
    op.create_check_constraint("ck_users_role", "users", "role IN ('customer', 'admin')")

    # --- accounts / transactions integrity ------------------------------------
    op.create_check_constraint("ck_accounts_balance_non_negative", "accounts", "balance >= 0")

    op.add_column("transactions", sa.Column("idempotency_key", sa.String(160), nullable=True))
    op.create_unique_constraint("transactions_idempotency_key_key", "transactions", ["idempotency_key"])
    op.create_check_constraint("ck_transactions_amount_positive", "transactions", "amount > 0")
    op.create_check_constraint(
        "ck_transactions_type",
        "transactions",
        "transaction_type IN ('transfer', 'deposit', 'withdraw', 'stripe_topup', 'stripe_refund', 'demo_funding')",
    )
    op.create_check_constraint("ck_transactions_status", "transactions", "status IN ('success', 'pending', 'failed')")
    op.create_index("ix_transactions_sender_created", "transactions", ["sender_account_id", "created_at"])
    op.create_index("ix_transactions_receiver_created", "transactions", ["receiver_account_id", "created_at"])

    # --- password_reset_codes -> email_challenges (one table for one-time codes)
    op.rename_table("password_reset_codes", "email_challenges")
    op.add_column("email_challenges", sa.Column("purpose", sa.String(32), nullable=False, server_default="password_reset"))
    op.alter_column("email_challenges", "purpose", server_default=None)
    op.drop_constraint("password_reset_codes_user_id_key", "email_challenges", type_="unique")
    op.create_unique_constraint("uq_email_challenges_user_purpose", "email_challenges", ["user_id", "purpose"])
    if _is_postgres():
        op.execute("ALTER INDEX ix_password_reset_codes_id RENAME TO ix_email_challenges_id")
        op.execute("ALTER INDEX password_reset_codes_pkey RENAME TO email_challenges_pkey")
        op.execute("ALTER TABLE email_challenges RENAME CONSTRAINT password_reset_codes_user_id_fkey TO email_challenges_user_id_fkey")
        op.execute("ALTER SEQUENCE password_reset_codes_id_seq RENAME TO email_challenges_id_seq")

    # --- sessions ------------------------------------------------------------------
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("portal", sa.String(16), nullable=False),
        sa.Column("mfa_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.String(64), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_revoked", "auth_sessions", ["user_id", "revoked_at"])

    # --- audit log -------------------------------------------------------------------
    op.create_table(
        "audit_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_type", sa.String(16), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=True),
        sa.Column("target_id", sa.String(64), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
    )
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])
    op.create_index("ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"])
    op.create_index("ix_audit_events_action", "audit_events", ["action"])

    # --- Stripe payments --------------------------------------------------------------
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False, server_default="stripe"),
        sa.Column("provider_payment_id", sa.String(100), nullable=True, unique=True),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("amount_refunded_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("failure_reason", sa.String(255), nullable=True),
        sa.Column("reconciliation_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("livemode", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id"), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("succeeded_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_payments_user_idempotency_key"),
        sa.CheckConstraint("amount_minor > 0", name="ck_payments_amount_positive"),
        sa.CheckConstraint(
            "amount_refunded_minor >= 0 AND amount_refunded_minor <= amount_minor", name="ck_payments_refund_range"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'requires_action', 'succeeded', 'failed', 'canceled', "
            "'partially_refunded', 'refunded')",
            name="ck_payments_status",
        ),
        sa.CheckConstraint(
            "reconciliation_status IN ('pending', 'matched', 'mismatch', 'needs_review')",
            name="ck_payments_reconciliation_status",
        ),
    )
    op.create_index("ix_payments_user_id", "payments", ["user_id"])
    op.create_index("ix_payments_status", "payments", ["status"])
    op.create_index("ix_payments_created_at", "payments", ["created_at"])

    op.create_table(
        "stripe_webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.String(100), nullable=False, unique=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id"), nullable=True),
        sa.Column("outcome", sa.String(40), nullable=False),
        sa.Column("livemode", sa.Boolean(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_stripe_webhook_events_payment_id", "stripe_webhook_events", ["payment_id"])

    # --- ledger ------------------------------------------------------------------------
    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id"), nullable=False),
        sa.Column("leg", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("system_account", sa.String(40), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("transaction_id", "leg", name="uq_ledger_entries_transaction_leg"),
        sa.CheckConstraint("amount <> 0", name="ck_ledger_entries_amount_nonzero"),
        sa.CheckConstraint(
            "(account_id IS NOT NULL AND system_account IS NULL) OR (account_id IS NULL AND system_account IS NOT NULL)",
            name="ck_ledger_entries_one_side",
        ),
    )
    op.create_index("ix_ledger_entries_transaction_id", "ledger_entries", ["transaction_id"])
    op.create_index("ix_ledger_entries_account_id", "ledger_entries", ["account_id"])

    op.create_table(
        "ledger_opening_balances",
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), primary_key=True),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # Snapshot existing balances so reconciliation has a starting point
    op.execute("INSERT INTO ledger_opening_balances (account_id, balance) SELECT id, balance FROM accounts")

    # --- email delivery tracking ---------------------------------------------------------
    op.create_table(
        "email_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_email", sa.String(150), nullable=False),
        sa.Column("template", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.String(255), nullable=True),
        sa.Column("dedupe_key", sa.String(150), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_email_notifications_user_id", "email_notifications", ["user_id"])
    op.create_index("ix_email_notifications_template", "email_notifications", ["template"])
    op.create_index("ix_email_notifications_status", "email_notifications", ["status"])

    # --- rate limiting -----------------------------------------------------------------------
    op.create_table(
        "rate_limit_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rate_limit_events_key_created", "rate_limit_events", ["key_hash", "created_at"])

    # --- append-only enforcement (PostgreSQL) ------------------------------------------------
    if _is_postgres():
        op.execute(
            """
            CREATE OR REPLACE FUNCTION nova_reject_modification() RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        for table in APPEND_ONLY_TABLES:
            op.execute(
                f"CREATE TRIGGER {table}_append_only BEFORE UPDATE OR DELETE ON {table} "
                f"FOR EACH ROW EXECUTE FUNCTION nova_reject_modification()"
            )
            op.execute(
                f"CREATE TRIGGER {table}_no_truncate BEFORE TRUNCATE ON {table} "
                f"FOR EACH STATEMENT EXECUTE FUNCTION nova_reject_modification()"
            )


def downgrade() -> None:
    """Rollback for Phase 1. Drops the Phase 1 tables (their data is lost:
    sessions, payments, ledger, audit log). Users, accounts, balances and
    transactions are kept. Prefer restoring the pre-migration backup."""
    if _is_postgres():
        for table in APPEND_ONLY_TABLES:
            op.execute(f"DROP TRIGGER IF EXISTS {table}_append_only ON {table}")
            op.execute(f"DROP TRIGGER IF EXISTS {table}_no_truncate ON {table}")
        op.execute("DROP FUNCTION IF EXISTS nova_reject_modification()")

    for table in (
        "rate_limit_events", "email_notifications", "ledger_opening_balances", "ledger_entries",
        "stripe_webhook_events", "payments", "audit_events", "auth_sessions",
    ):
        op.drop_table(table)

    # Codes other than password resets have no home in the old table
    op.execute("DELETE FROM email_challenges WHERE purpose <> 'password_reset'")
    op.drop_constraint("uq_email_challenges_user_purpose", "email_challenges", type_="unique")
    op.drop_column("email_challenges", "purpose")
    op.create_unique_constraint("password_reset_codes_user_id_key", "email_challenges", ["user_id"])
    if _is_postgres():
        op.execute("ALTER SEQUENCE email_challenges_id_seq RENAME TO password_reset_codes_id_seq")
        op.execute("ALTER TABLE email_challenges RENAME CONSTRAINT email_challenges_user_id_fkey TO password_reset_codes_user_id_fkey")
        op.execute("ALTER INDEX email_challenges_pkey RENAME TO password_reset_codes_pkey")
        op.execute("ALTER INDEX ix_email_challenges_id RENAME TO ix_password_reset_codes_id")
    op.rename_table("email_challenges", "password_reset_codes")

    op.drop_index("ix_transactions_receiver_created", "transactions")
    op.drop_index("ix_transactions_sender_created", "transactions")
    op.drop_constraint("ck_transactions_status", "transactions", type_="check")
    op.drop_constraint("ck_transactions_type", "transactions", type_="check")
    op.drop_constraint("ck_transactions_amount_positive", "transactions", type_="check")
    op.drop_constraint("transactions_idempotency_key_key", "transactions", type_="unique")
    op.drop_column("transactions", "idempotency_key")
    op.drop_constraint("ck_accounts_balance_non_negative", "accounts", type_="check")

    op.drop_constraint("ck_users_role", "users", type_="check")
    for column in (
        "mfa_last_used_step", "mfa_secret_encrypted", "mfa_enabled", "last_login_at",
        "password_changed_at", "email_verified_at", "email_verified", "role",
    ):
        op.drop_column("users", column)
