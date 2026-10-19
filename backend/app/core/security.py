import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
import jwt
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Verified against when an email is unknown, so login takes the same time
# whether or not the account exists (prevents timing-based enumeration).
_DUMMY_HASH = pwd_context.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        pwd_context.verify(plain_password, _DUMMY_HASH)
        return False
    return pwd_context.verify(plain_password, hashed_password)


# --- Session tokens ----------------------------------------------------------

def create_session_token(user_id: int, session_id: str, role: str, expires_at: datetime) -> str:
    """Signed JWT carrying the server-side session id. The session row is the
    source of truth: revoking it invalidates the token immediately."""
    return jwt.encode(
        {
            "sub": str(user_id),
            "sid": session_id,
            "role": role,
            "typ": "session",
            "iat": int(time.time()),
            "exp": expires_at,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def create_purpose_token(user_id: int, purpose: str, minutes: int, session_id: str | None = None) -> str:
    """Short-lived signed token for a single step (e.g. admin MFA)."""
    claims = {
        "sub": str(user_id),
        "typ": purpose,
        "jti": secrets.token_urlsafe(12),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
    }
    if session_id is not None:
        claims["sid"] = session_id
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict | None:
    """Returns the claims if the signature, expiry and type are valid."""
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != expected_type or not claims.get("sub"):
        return None
    return claims


def csrf_token_for(session_id: str) -> str:
    """CSRF token bound to the session; returned to the SPA, sent back in a header."""
    return hmac.new(settings.SECRET_KEY.encode(), f"csrf:{session_id}".encode(), hashlib.sha256).hexdigest()


# --- One-time email codes ------------------------------------------------------

def generate_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_email_code(code: str, purpose: str, user_id: int) -> str:
    # Bound to purpose + user so a code can never be replayed for another flow or account
    message = f"{purpose}:{user_id}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def verify_email_code(code: str, purpose: str, user_id: int, code_hash: str) -> bool:
    return hmac.compare_digest(hash_email_code(code, purpose, user_id), code_hash)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# --- TOTP (RFC 6238) for admin MFA ------------------------------------------------

TOTP_STEP_SECONDS = 30
TOTP_DIGITS = 6


class MFAConfigurationError(RuntimeError):
    pass


def _fernet() -> Fernet:
    if not settings.MFA_ENCRYPTION_KEY:
        raise MFAConfigurationError("MFA_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(settings.MFA_ENCRYPTION_KEY.encode())
    except (ValueError, TypeError) as exc:
        raise MFAConfigurationError("MFA_ENCRYPTION_KEY is not a valid Fernet key") from exc


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise MFAConfigurationError("Stored MFA secret cannot be decrypted with MFA_ENCRYPTION_KEY") from exc


def _hotp(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** TOTP_DIGITS)
    return f"{code:0{TOTP_DIGITS}d}"


def totp_at(secret: str, for_time: float | None = None) -> str:
    return _hotp(secret, int((for_time or time.time()) // TOTP_STEP_SECONDS))


def verify_totp(secret: str, code: str, last_used_step: int | None, window: int = 1) -> int | None:
    """Returns the matched time step, or None. Steps at or before `last_used_step`
    are rejected so an observed code can't be replayed."""
    if not code or not code.isdigit() or len(code) != TOTP_DIGITS:
        return None
    current = int(time.time() // TOTP_STEP_SECONDS)
    for step in range(current - window, current + window + 1):
        if last_used_step is not None and step <= last_used_step:
            continue
        if hmac.compare_digest(_hotp(secret, step), code):
            return step
    return None


def totp_provisioning_uri(secret: str, account_email: str) -> str:
    issuer = quote(settings.MFA_ISSUER)
    return f"otpauth://totp/{issuer}:{quote(account_email)}?secret={secret}&issuer={issuer}&digits=6&period=30"
