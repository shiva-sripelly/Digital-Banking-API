import random
import string


def generate_account_number(length: int = 10) -> str:
    return "".join(random.choices(string.digits, k=length))


def generate_transaction_reference(length: int = 12) -> str:
    chars = string.ascii_uppercase + string.digits
    return "TXN" + "".join(random.choices(chars, k=length))