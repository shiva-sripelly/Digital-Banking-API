import secrets
import string


def generate_account_number(length: int = 10) -> str:
    # Cryptographic randomness so account numbers can't be predicted;
    # no leading zero so the number keeps its length when displayed.
    first = secrets.choice("123456789")
    return first + "".join(secrets.choice(string.digits) for _ in range(length - 1))


def generate_transaction_reference(length: int = 12) -> str:
    chars = string.ascii_uppercase + string.digits
    return "TXN" + "".join(secrets.choice(chars) for _ in range(length))


def mask_account_number(account_number: str | None) -> str | None:
    if not account_number:
        return None
    return f"••••{account_number[-4:]}"
