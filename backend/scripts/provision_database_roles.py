"""Provision least-privilege PostgreSQL roles for one VELQORIN database.

Passwords are accepted only through environment variables and are never
printed. Run this script with the existing database-owner URL in
``VELQORIN_DB_ADMIN_URL`` and separate generated values in
``VELQORIN_APP_DB_PASSWORD`` and ``VELQORIN_MIGRATOR_DB_PASSWORD``.
"""

from __future__ import annotations

import argparse
import os
import re
import tempfile
from pathlib import Path

import psycopg2
from psycopg2 import sql
from sqlalchemy.engine import make_url


APP_ROLE = "velqorin_app"
MIGRATOR_ROLE = "velqorin_migrator"
NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

READ_TABLES = (
    "users",
    "accounts",
    "transactions",
    "email_challenges",
    "auth_sessions",
    "audit_events",
    "payments",
    "stripe_webhook_events",
    "ledger_entries",
    "ledger_opening_balances",
    "email_notifications",
    "rate_limit_events",
)
INSERT_TABLES = (
    "users",
    "accounts",
    "transactions",
    "email_challenges",
    "auth_sessions",
    "audit_events",
    "payments",
    "stripe_webhook_events",
    "ledger_entries",
    "email_notifications",
    "rate_limit_events",
)
UPDATE_TABLES = (
    "users",
    "accounts",
    "email_challenges",
    "auth_sessions",
    "payments",
    "stripe_webhook_events",
    "email_notifications",
)
DELETE_TABLES = ("email_challenges", "rate_limit_events")


def required_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise SystemExit(f"Required environment variable is not set: {name}")
    return value


def connect_url(url: str, database: str):
    parsed = make_url(url).set(database=database)
    return psycopg2.connect(parsed.render_as_string(hide_password=False))


def ensure_role(cursor, role: str, password: str) -> None:
    cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
    if cursor.fetchone() is None:
        cursor.execute(
            sql.SQL(
                "CREATE ROLE {} LOGIN PASSWORD %s NOSUPERUSER NOCREATEDB "
                "NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT"
            ).format(sql.Identifier(role)),
            (password,),
        )
    else:
        cursor.execute(
            sql.SQL(
                "ALTER ROLE {} WITH LOGIN PASSWORD %s NOSUPERUSER NOCREATEDB "
                "NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT"
            ).format(sql.Identifier(role)),
            (password,),
        )

    cursor.execute(
        """
        SELECT parent.rolname
        FROM pg_auth_members membership
        JOIN pg_roles parent ON parent.oid = membership.roleid
        JOIN pg_roles member ON member.oid = membership.member
        WHERE member.rolname = %s
        """,
        (role,),
    )
    for (parent,) in cursor.fetchall():
        cursor.execute(
            sql.SQL("REVOKE {} FROM {}").format(sql.Identifier(parent), sql.Identifier(role))
        )


def alter_owned_objects(cursor) -> None:
    cursor.execute(
        """
        SELECT n.nspname, c.relname, c.relkind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
          AND (
              c.relkind <> 'S'
              OR NOT EXISTS (
                  SELECT 1
                  FROM pg_depend d
                  WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass
                    AND d.refclassid = 'pg_class'::regclass
                    AND d.deptype IN ('a', 'i')
              )
          )
        ORDER BY CASE WHEN c.relkind IN ('r', 'p') THEN 0 ELSE 1 END, c.relname
        """
    )
    for schema, name, kind in cursor.fetchall():
        keyword = "SEQUENCE" if kind == "S" else "TABLE"
        if kind in ("v", "m"):
            keyword = "MATERIALIZED VIEW" if kind == "m" else "VIEW"
        cursor.execute(
            sql.SQL("ALTER {} {}.{} OWNER TO {}").format(
                sql.SQL(keyword),
                sql.Identifier(schema),
                sql.Identifier(name),
                sql.Identifier(MIGRATOR_ROLE),
            )
        )

    cursor.execute(
        """
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        """
    )
    for schema, name, arguments in cursor.fetchall():
        cursor.execute(
            sql.SQL("ALTER FUNCTION {}.{}({}) OWNER TO {}").format(
                sql.Identifier(schema),
                sql.Identifier(name),
                sql.SQL(arguments),
                sql.Identifier(MIGRATOR_ROLE),
            )
        )


def grant_tables(cursor, privilege: str, tables: tuple[str, ...]) -> None:
    for table in tables:
        cursor.execute("SELECT to_regclass(%s)", (f"public.{table}",))
        if cursor.fetchone()[0] is None:
            continue
        cursor.execute(
            sql.SQL("GRANT {} ON TABLE public.{} TO {}").format(
                sql.SQL(privilege), sql.Identifier(table), sql.Identifier(APP_ROLE)
            )
        )


def provision_database(admin_url: str, database: str, app_password: str, migrator_password: str) -> None:
    if not NAME_RE.fullmatch(database):
        raise SystemExit("Unsafe database name")

    with connect_url(admin_url, "postgres") as connection:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")
            row = cursor.fetchone()
            if row is None or not row[0]:
                raise SystemExit("Role provisioning requires the existing PostgreSQL administrator")
            cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database,))
            if cursor.fetchone() is None:
                raise SystemExit(f"Database does not exist: {database}")
            ensure_role(cursor, APP_ROLE, app_password)
            ensure_role(cursor, MIGRATOR_ROLE, migrator_password)

    with connect_url(admin_url, database) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database()")
            if cursor.fetchone()[0] != database:
                raise SystemExit("Connected to the wrong database")

            alter_owned_objects(cursor)

            cursor.execute(
                sql.SQL("REVOKE ALL ON DATABASE {} FROM {}, {}").format(
                    sql.Identifier(database), sql.Identifier(APP_ROLE), sql.Identifier(MIGRATOR_ROLE)
                )
            )
            cursor.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}, {}").format(
                    sql.Identifier(database), sql.Identifier(APP_ROLE), sql.Identifier(MIGRATOR_ROLE)
                )
            )
            cursor.execute(
                sql.SQL("REVOKE ALL ON SCHEMA public FROM {}").format(sql.Identifier(APP_ROLE))
            )
            cursor.execute(
                sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(APP_ROLE))
            )
            cursor.execute(
                sql.SQL("GRANT USAGE, CREATE ON SCHEMA public TO {}").format(sql.Identifier(MIGRATOR_ROLE))
            )

            cursor.execute(
                sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}").format(sql.Identifier(APP_ROLE))
            )
            cursor.execute(
                sql.SQL("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {}").format(sql.Identifier(APP_ROLE))
            )
            cursor.execute(
                sql.SQL("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM {}").format(sql.Identifier(APP_ROLE))
            )

            grant_tables(cursor, "SELECT", READ_TABLES)
            grant_tables(cursor, "INSERT", INSERT_TABLES)
            grant_tables(cursor, "UPDATE", UPDATE_TABLES)
            grant_tables(cursor, "DELETE", DELETE_TABLES)
            cursor.execute(
                sql.SQL("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(
                    sql.Identifier(APP_ROLE)
                )
            )

            # Trigger functions are not SECURITY DEFINER and are never called
            # directly by the runtime role. Remove PostgreSQL's default PUBLIC
            # EXECUTE grant to keep the surface explicit.
            cursor.execute("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC")
            cursor.execute(
                sql.SQL(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public "
                    "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC"
                ).format(sql.Identifier(MIGRATOR_ROLE))
            )

            for role in (APP_ROLE, MIGRATOR_ROLE):
                cursor.execute(
                    sql.SQL("ALTER ROLE {} IN DATABASE {} SET search_path = public, pg_catalog").format(
                        sql.Identifier(role), sql.Identifier(database)
                    )
                )


def write_env_urls(env_path: Path, admin_url: str, database: str, app_password: str, migrator_password: str) -> None:
    parsed = make_url(admin_url).set(database=database)
    app_url = parsed.set(username=APP_ROLE, password=app_password).render_as_string(hide_password=False)
    migrator_url = parsed.set(username=MIGRATOR_ROLE, password=migrator_password).render_as_string(hide_password=False)

    original = env_path.read_text(encoding="utf-8")
    replacements = {
        "DATABASE_URL": app_url,
        "MIGRATION_DATABASE_URL": migrator_url,
    }
    found: set[str] = set()
    output: list[str] = []
    for line in original.splitlines():
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
        if key in replacements:
            output.append(f"{key}={replacements[key]}")
            found.add(key)
        else:
            output.append(line)
    for key, value in replacements.items():
        if key not in found:
            output.append(f"{key}={value}")

    env_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=env_path.name + ".", dir=env_path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("\n".join(output) + "\n")
        os.replace(temporary, env_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--write-env", type=Path)
    args = parser.parse_args()

    admin_url = required_env("VELQORIN_DB_ADMIN_URL")
    app_password = required_env("VELQORIN_APP_DB_PASSWORD")
    migrator_password = required_env("VELQORIN_MIGRATOR_DB_PASSWORD")
    if app_password == migrator_password:
        raise SystemExit("Runtime and migration passwords must be different")
    if min(len(app_password), len(migrator_password)) < 40:
        raise SystemExit("Database role passwords must be at least 40 characters")

    provision_database(admin_url, args.database, app_password, migrator_password)
    if args.write_env:
        write_env_urls(args.write_env.resolve(), admin_url, args.database, app_password, migrator_password)
    print(f"Provisioned restricted roles for database {args.database}")


if __name__ == "__main__":
    main()
