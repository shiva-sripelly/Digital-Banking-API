"""Protect historical financial transactions from mutation or removal.

Revision ID: 0003_protect_transactions
Revises: 0002_phase1
Create Date: 2026-10-18

This migration is additive. It does not rewrite transaction rows, balances,
opening balances, ledger entries, or payment records.
"""

from alembic import op


revision = "0003_protect_transactions"
down_revision = "0002_phase1"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not _is_postgres():
        return

    # The function is introduced by 0002 and raises before any row or table
    # removal or mutation occurs. The runtime role is separately denied
    # UPDATE/DELETE/TRUNCATE and table ownership; these triggers provide a
    # second layer for privileged maintenance mistakes.
    op.execute(
        "CREATE TRIGGER transactions_no_update_or_delete BEFORE UPDATE OR DELETE ON transactions "
        "FOR EACH ROW EXECUTE FUNCTION nova_reject_modification()"
    )
    op.execute(
        "CREATE TRIGGER transactions_no_truncate BEFORE TRUNCATE ON transactions "
        "FOR EACH STATEMENT EXECUTE FUNCTION nova_reject_modification()"
    )
    op.execute("REVOKE UPDATE, DELETE, TRUNCATE ON TABLE transactions FROM PUBLIC")


def downgrade() -> None:
    if not _is_postgres():
        return
    op.execute("DROP TRIGGER IF EXISTS transactions_no_truncate ON transactions")
    op.execute("DROP TRIGGER IF EXISTS transactions_no_update_or_delete ON transactions")

