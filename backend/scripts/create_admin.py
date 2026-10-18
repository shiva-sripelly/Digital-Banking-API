"""Provision a VELQORIN administrator. Safe to commit: contains no credentials.

Usage (from the backend/ directory, with the database migrated):

    python scripts/create_admin.py                 # prompts for name, email, password
    python scripts/create_admin.py --email ops@example.com --name "Ops Admin"
    python scripts/create_admin.py --resend-verification --email ops@example.com

Credentials can instead come from the environment (never commit them):
    ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME (optional)

What it does:
  * validates the email and password strength (12+ chars, mixed classes)
  * creates the account with role=admin and a bcrypt-hashed password
  * never deletes, overwrites or promotes existing accounts (idempotent:
    re-running for an existing admin changes nothing)
  * emails a one-time verification code; the admin verifies at /verify-email
  * MFA (authenticator app) enrollment is enforced on first admin sign-in
  * records an audit event; prints no secrets
"""
import argparse
import getpass
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from email_validator import EmailNotValidError, validate_email  # noqa: E402

PASSWORD_RULES = (
    (lambda p: len(p) >= 12, "at least 12 characters"),
    (lambda p: re.search(r"[a-z]", p), "a lowercase letter"),
    (lambda p: re.search(r"[A-Z]", p), "an uppercase letter"),
    (lambda p: re.search(r"\d", p), "a number"),
    (lambda p: re.search(r"[^A-Za-z0-9]", p), "a symbol"),
    (lambda p: len(p) <= 72, "at most 72 characters"),
)


def password_problems(password: str, email: str) -> list[str]:
    problems = [f"must contain {rule}" for check, rule in PASSWORD_RULES if not check(password)]
    local_part = email.split("@")[0].lower()
    if len(local_part) >= 3 and local_part in password.lower():
        problems.append("must not contain the email name")
    return problems


def mask(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def prompt_password(email: str) -> str:
    while True:
        password = getpass.getpass("Admin password (input hidden): ")
        problems = password_problems(password, email)
        if problems:
            print("Password rejected: " + "; ".join(problems))
            continue
        if getpass.getpass("Confirm password: ") != password:
            print("Passwords do not match.")
            continue
        return password


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a VELQORIN administrator (never modifies existing accounts).")
    parser.add_argument("--email", help="Admin email (or ADMIN_EMAIL)")
    parser.add_argument("--name", help="Admin full name (or ADMIN_NAME)")
    parser.add_argument("--resend-verification", action="store_true", help="Send a new verification code to an existing, unverified admin")
    args = parser.parse_args()

    interactive = sys.stdin.isatty()
    email = args.email or os.environ.get("ADMIN_EMAIL") or (input("Admin email: ").strip() if interactive else "")
    if not email:
        print("Error: provide --email or ADMIN_EMAIL.")
        return 2
    try:
        email = validate_email(email, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        print(f"Error: invalid email: {exc}")
        return 2

    # Imported late so --help works without a configured environment
    from app.core.database import SessionLocal
    from app.core.security import hash_password
    from app.models.email_challenge import PURPOSE_EMAIL_VERIFICATION
    from app.models.email_notification import EmailNotification
    from app.models.user import ROLE_ADMIN
    from app.repositories.user_repository import UserRepository
    from app.services.audit_service import AuditService
    from app.services.challenge_service import ChallengeService
    from app.services.notification_service import dispatcher
    from app.core.config import settings

    # The script exits right away, so deliver inline instead of on a worker thread
    settings.EMAIL_DELIVERY_MODE = "sync"

    db = SessionLocal()
    try:
        existing = UserRepository.get_by_email(db, email)

        if args.resend_verification:
            if not existing or existing.role != ROLE_ADMIN:
                print("Error: no administrator with that email.")
                return 1
            if existing.email_verified:
                print("This administrator's email is already verified. No changes made.")
                return 0
            user = existing
        elif existing:
            if existing.role == ROLE_ADMIN:
                print(f"Administrator {mask(email)} already exists. No changes made.")
                return 0
            # Never promote a customer: privilege must not be granted to an existing login
            print("Error: this email belongs to a customer account. Use a separate email for the administrator.")
            return 1
        else:
            name = (args.name or os.environ.get("ADMIN_NAME") or (input("Admin full name: ").strip() if interactive else "") or "Administrator").strip()
            if len(name) < 2:
                print("Error: name must be at least 2 characters.")
                return 2

            password = os.environ.get("ADMIN_PASSWORD")
            if password:
                problems = password_problems(password, email)
                if problems:
                    print("Error: ADMIN_PASSWORD rejected: " + "; ".join(problems))
                    return 2
            elif interactive:
                password = prompt_password(email)
            else:
                print("Error: set ADMIN_PASSWORD or run interactively.")
                return 2

            user = UserRepository.create_user(db, name, email, hash_password(password), role=ROLE_ADMIN, commit=False)
            AuditService.record(db, "admin.created", "system", None, "user", user.id, details={"via": "create_admin.py"})
            db.commit()
            db.refresh(user)
            print(f"Administrator {mask(email)} created (id {user.id}). Email not yet verified; MFA enrollment pending.")

        sent = ChallengeService.issue(db, user, PURPOSE_EMAIL_VERIFICATION, "verify_email", resend=args.resend_verification)
        if not sent:
            print("A verification code was sent less than a minute ago. Try again shortly.")
            return 0

        latest = (
            db.query(EmailNotification)
            .filter(EmailNotification.user_id == user.id, EmailNotification.template == "verify_email")
            .order_by(EmailNotification.id.desc())
            .first()
        )
        if latest and latest.status == "accepted":
            print(f"Verification code emailed to {mask(email)} (accepted by the email provider).")
            print("Next: verify at <FRONTEND_URL>/verify-email, then sign in at <FRONTEND_URL>/admin/login to enroll MFA.")
        else:
            reason = latest.last_error if latest else "unknown error"
            print(f"WARNING: the verification email could not be sent: {reason}")
            print("Fix the SMTP settings, then run: python scripts/create_admin.py --resend-verification --email <email>")
            return 3
        return 0
    finally:
        dispatcher.stop()
        db.close()


if __name__ == "__main__":
    sys.exit(main())
