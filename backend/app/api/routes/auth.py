from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_customer_context, optional_context
from app.models.auth_session import PORTAL_CUSTOMER
from app.core.database import get_db
from app.core.request_context import client_ip, user_agent
from app.schemas.auth import (
    CodeSentResponse,
    EmailRequest,
    MessageResponse,
    ResetPasswordRequest,
    SessionResponse,
    UserRegister,
    VerifyEmailRequest,
)
from app.services.auth_service import AuthService, session_payload


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=CodeSentResponse, status_code=status.HTTP_202_ACCEPTED)
def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)):
    return AuthService.register_user(
        db=db,
        full_name=payload.full_name,
        email=payload.email,
        password=payload.password,
        ip=client_ip(request),
    )


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(payload: VerifyEmailRequest, request: Request, db: Session = Depends(get_db)):
    return AuthService.verify_email(db, payload.email, payload.code, client_ip(request))


@router.post("/resend-verification", response_model=CodeSentResponse)
def resend_verification(payload: EmailRequest, request: Request, db: Session = Depends(get_db)):
    return AuthService.resend_verification(db, payload.email, client_ip(request))


@router.post("/login", response_model=SessionResponse)
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    return AuthService.login_user(
        db=db,
        email=form_data.username,
        password=form_data.password,
        ip=client_ip(request),
        user_agent=user_agent(request),
        response=response,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(response: Response, ctx: AuthContext = Depends(get_customer_context), db: Session = Depends(get_db)):
    return AuthService.logout(db, ctx, response)


@router.post("/forgot-password", response_model=CodeSentResponse)
def forgot_password(payload: EmailRequest, request: Request, db: Session = Depends(get_db)):
    return AuthService.request_password_reset(db=db, email=payload.email, ip=client_ip(request))


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    return AuthService.reset_password(
        db=db,
        email=payload.email,
        code=payload.code,
        new_password=payload.new_password,
        ip=client_ip(request),
    )


@router.get("/session")
def get_session(request: Request, db: Session = Depends(get_db)):
    """Current session if signed in, otherwise {"user": null} (no 401 noise)."""
    ctx = optional_context(request, db, PORTAL_CUSTOMER)
    if ctx is None:
        return {"user": None}
    return SessionResponse.model_validate(session_payload(ctx.user, ctx.session))


@router.get("/me", response_model=SessionResponse)
def get_me(ctx: AuthContext = Depends(get_customer_context)):
    return session_payload(ctx.user, ctx.session)
