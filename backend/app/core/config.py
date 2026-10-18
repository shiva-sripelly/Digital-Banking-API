import logging
from pathlib import Path
from typing import List, Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("app.config")

# Fragments that indicate a copied example value rather than a real secret
PLACEHOLDER_MARKERS = ("your_", "your-", "changeme", "change_me", "placeholder", "example", "secret_key_here")
MIN_SECRET_LENGTH = 32
BACKEND_DIR = Path(__file__).resolve().parents[2]


def looks_like_placeholder(value: str) -> bool:
    lowered = (value or "").lower()
    return any(marker in lowered for marker in PLACEHOLDER_MARKERS)


class Settings(BaseSettings):
    # --- Environment -------------------------------------------------------
    APP_ENV: Literal["development", "test", "production"] = "development"
    # Sandbox mode keeps all money simulated and refuses live Stripe keys
    SANDBOX_MODE: bool = True
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str

    # --- Database ----------------------------------------------------------
    DATABASE_URL: str
    # Alembic-only connection. Runtime code must never use this value.
    MIGRATION_DATABASE_URL: str | None = None

    # --- Sessions / tokens -------------------------------------------------
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ADMIN_SESSION_EXPIRE_MINUTES: int = 30
    COOKIE_SECURE: bool = True
    # Key used to encrypt admin TOTP secrets at rest (Fernet, urlsafe base64)
    MFA_ENCRYPTION_KEY: str = ""
    MFA_ISSUER: str = "VELQORIN Admin"
    # Authenticator-app step for admin sign-in. Can be turned off for local
    # development only; production refuses to start without it.
    ADMIN_MFA_REQUIRED: bool = True

    # --- One-time email codes ------------------------------------------------
    EMAIL_CODE_EXPIRE_MINUTES: int = 10
    PASSWORD_RESET_CODE_EXPIRE_MINUTES: int = 15
    EMAIL_CODE_MAX_ATTEMPTS: int = 5
    EMAIL_CODE_RESEND_COOLDOWN_SECONDS: int = 60

    # --- Email delivery ------------------------------------------------------
    EMAIL_PROVIDER: Literal["smtp"] = "smtp"
    # "background": delivered by a worker thread with retries; "sync": inline (scripts/tests)
    EMAIL_DELIVERY_MODE: Literal["background", "sync"] = "background"
    EMAIL_MAX_ATTEMPTS: int = 4
    SMTP_HOST: str
    SMTP_PORT: int
    SMTP_USERNAME: str
    SMTP_PASSWORD: str
    SMTP_FROM: str
    SMTP_FROM_NAME: str = "VELQORIN"
    SMTP_SECURITY: Literal["starttls", "ssl", "none"] = "starttls"
    SMTP_TIMEOUT_SECONDS: int = 15

    # --- AI ------------------------------------------------------------------
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # --- Stripe (the only active payment provider) ---------------------------
    STRIPE_SECRET_KEY: str
    STRIPE_PUBLISHABLE_KEY: str
    STRIPE_WEBHOOK_SECRET: str
    STRIPE_CURRENCY: str = "inr"
    PAYMENT_MIN_AMOUNT_MINOR: int = 5000          # ₹50.00
    PAYMENT_MAX_AMOUNT_MINOR: int = 10_000_000    # ₹1,00,000.00

    # --- Development-only demo funding ---------------------------------------
    # Lets a signed-in customer add simulated money without a payment. Never
    # available when APP_ENV=production. Every use is audited.
    DEMO_FUNDING_ENABLED: bool = False

    # Resolve the environment file independently of the shell working
    # directory. This keeps FastAPI, Alembic, and maintenance scripts on the
    # same database/configuration when they are launched from the repository
    # root instead of backend/.
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def secret_key_is_weak(self) -> bool:
        return len(self.SECRET_KEY) < MIN_SECRET_LENGTH or looks_like_placeholder(self.SECRET_KEY)

    @model_validator(mode="after")
    def check_safety(self):
        if self.SANDBOX_MODE:
            for name in ("STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"):
                if "_live_" in getattr(self, name):
                    raise ValueError(f"{name} is a live-mode key but SANDBOX_MODE is enabled. Use Stripe test keys.")

        if self.is_production:
            problems = []
            if self.secret_key_is_weak:
                problems.append(f"SECRET_KEY must be at least {MIN_SECRET_LENGTH} random characters")
            if not self.MFA_ENCRYPTION_KEY or looks_like_placeholder(self.MFA_ENCRYPTION_KEY):
                problems.append("MFA_ENCRYPTION_KEY must be set")
            if not self.COOKIE_SECURE:
                problems.append("COOKIE_SECURE must be true")
            if self.DEMO_FUNDING_ENABLED:
                problems.append("DEMO_FUNDING_ENABLED must be false")
            if not self.ADMIN_MFA_REQUIRED:
                problems.append("ADMIN_MFA_REQUIRED must be true")
            if problems:
                raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        elif self.secret_key_is_weak:
            logger.warning(
                "SECRET_KEY is weak or a placeholder. This is refused when APP_ENV=production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return self

    @property
    def demo_funding_allowed(self) -> bool:
        return self.DEMO_FUNDING_ENABLED and not self.is_production


settings = Settings()
