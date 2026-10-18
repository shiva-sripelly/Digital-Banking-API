import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

CODE_PATTERN = r"^\d{6}$"


def check_customer_password(value: str) -> str:
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one number")
    return value


class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Full name must be at least 2 characters")
        # Letters only (any language), single spaces between words
        if not all(word.isalpha() for word in value.split(" ")):
            raise ValueError("Full name can contain only letters and spaces")
        return value

    _password = field_validator("password")(check_customer_password)


class EmailRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., pattern=CODE_PATTERN)


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., pattern=CODE_PATTERN)
    new_password: str = Field(..., min_length=8, max_length=72)

    _password = field_validator("new_password")(check_customer_password)


class MessageResponse(BaseModel):
    message: str


class CodeSentResponse(BaseModel):
    """Identical for known and unknown emails (no account enumeration)."""
    message: str
    email: EmailStr
    code_expires_in: int
    resend_available_in: int


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    is_active: bool
    email_verified: bool
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    user: UserResponse
    csrf_token: str
    expires_at: datetime
