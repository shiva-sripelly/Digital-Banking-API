"""Baseline: the schema as it existed before Alembic (created by create_all).

Existing databases already have these tables: mark them with
`alembic stamp 0001_baseline` (no changes are made). New databases get them
from `alembic upgrade head`.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(150), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", name="accounts_user_id_fkey"), nullable=False),
        sa.Column("account_number", sa.String(20), nullable=False),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", name="accounts_user_id_key"),
    )
    op.create_index("ix_accounts_id", "accounts", ["id"])
    op.create_index("ix_accounts_account_number", "accounts", ["account_number"], unique=True)

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sender_account_id", sa.Integer(), sa.ForeignKey("accounts.id", name="transactions_sender_account_id_fkey"), nullable=True),
        sa.Column("receiver_account_id", sa.Integer(), sa.ForeignKey("accounts.id", name="transactions_receiver_account_id_fkey"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_transactions_id", "transactions", ["id"])
    op.create_index("ix_transactions_reference", "transactions", ["reference"], unique=True)

    op.create_table(
        "password_reset_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="password_reset_codes_user_id_fkey"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", name="password_reset_codes_user_id_key"),
    )
    op.create_index("ix_password_reset_codes_id", "password_reset_codes", ["id"])


def downgrade() -> None:
    op.drop_table("password_reset_codes")
    op.drop_table("transactions")
    op.drop_table("accounts")
    op.drop_table("users")
