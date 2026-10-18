"""Transactional email templates (HTML + plain text).

Every value interpolated into HTML is escaped. Templates never include
passwords or tokens; one-time codes appear only in the code emails themselves.
"""
from html import escape

BRAND = "VELQORIN"
SANDBOX_NOTE = "VELQORIN is a sandbox: all balances are simulated and payments run in Stripe test mode."


def _layout(title: str, paragraphs: list[str], code: str | None = None) -> str:
    body = "".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#381932">{p}</p>' for p in paragraphs
    )
    code_block = (
        f'<p style="margin:8px 0 22px;font-size:32px;font-weight:800;letter-spacing:8px;color:#381932">{escape(code)}</p>'
        if code
        else ""
    )
    return (
        '<!doctype html><html><body style="margin:0;background:#FFF3E6;font-family:Segoe UI,Arial,sans-serif">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">'
        '<tr><td align="center">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="max-width:520px;background:#FFFFFF;border:1px solid #E8D9D8;border-radius:16px">'
        f'<tr><td style="background:#381932;border-radius:16px 16px 0 0;padding:20px 28px;color:#FFF3E6;'
        f'font-size:20px;font-weight:800">{BRAND}</td></tr>'
        f'<tr><td style="padding:28px">'
        f'<h1 style="margin:0 0 16px;font-size:22px;color:#381932">{escape(title)}</h1>'
        f"{body}{code_block}"
        f'<p style="margin:24px 0 0;font-size:12px;color:#70646D">{SANDBOX_NOTE}</p>'
        "</td></tr></table></td></tr></table></body></html>"
    )


def _text(title: str, lines: list[str], code: str | None = None) -> str:
    parts = [title, ""] + lines
    if code:
        parts += ["", f"    {code}"]
    return "\n".join(parts + ["", SANDBOX_NOTE, ""])


def render(template: str, ctx: dict) -> tuple[str, str, str]:
    """Returns (subject, text, html)."""
    name = ctx.get("name", "there")
    h = {k: escape(str(v)) for k, v in ctx.items()}
    hn = h.get("name", "there")

    if template == "verify_email":
        minutes = ctx["minutes"]
        subject = f"Your {BRAND} verification code"
        title = "Verify your email"
        intro = "Use this code to verify your email address" + (" again" if ctx.get("resend") else "") + "."
        tail = f"It expires in {minutes} minutes and can be used once. If you didn't request it, ignore this email."
        return (
            subject,
            _text(title, [f"Hi {name},", intro, tail], code=ctx["code"]),
            _layout(title, [f"Hi {hn},", escape(intro), escape(tail)], code=ctx["code"]),
        )

    if template == "password_reset":
        minutes = ctx["minutes"]
        subject = f"Your {BRAND} password reset code"
        title = "Reset your password"
        tail = f"It expires in {minutes} minutes. If you didn't ask to reset your password, you can ignore this email."
        return (
            subject,
            _text(title, [f"Hi {name},", "Use this code to reset your password.", tail], code=ctx["code"]),
            _layout(title, [f"Hi {hn},", "Use this code to reset your password.", escape(tail)], code=ctx["code"]),
        )

    simple = {
        "welcome": (
            f"Welcome to {BRAND}",
            "Your email is verified",
            [f"Hi {{name}},", "Your email address is verified and your account is ready. You can now log in."],
        ),
        "registration_attempt": (
            f"Sign-up attempt on {BRAND}",
            "Someone tried to register with your email",
            [
                f"Hi {{name}},",
                "Someone tried to create a new account with this email address, which already has an account.",
                "No changes were made. If this was you, just log in or reset your password.",
            ],
        ),
        "password_changed": (
            f"Your {BRAND} password was changed",
            "Password changed",
            [
                f"Hi {{name}},",
                "Your password was changed and all your sessions were signed out.",
                "If this wasn't you, reset your password immediately.",
            ],
        ),
        "login_alert": (
            f"New sign-in to {BRAND}",
            "New sign-in to your account",
            ["Hi {name},", "Your account was signed in to at {time} from IP {ip} ({agent}).",
             "If this wasn't you, reset your password now."],
        ),
        "admin_login_alert": (
            f"Admin sign-in to {BRAND}",
            "Administrator sign-in",
            ["Hi {name},", "Your administrator account completed MFA sign-in at {time} from IP {ip} ({agent}).",
             "If this wasn't you, contact your security team immediately."],
        ),
        "payment_succeeded": (
            "Your test payment was successful",
            "Money added to your wallet",
            ["Hi {name},", "{amount} was added to your wallet by a Stripe test payment.",
             "Reference: {reference}. New balance: {balance}."],
        ),
        "payment_failed": (
            "Your test payment did not go through",
            "Payment failed",
            ["Hi {name},", "Your Stripe test payment of {amount} did not complete: {reason}.",
             "No money was taken from your wallet. You can try again from the Payments page."],
        ),
        "transfer_sent": (
            "Transfer confirmation",
            "Money sent",
            ["Hi {name},", "You sent {amount} to account {counterparty}.", "Reference: {reference}."],
        ),
        "transfer_received": (
            "You received money",
            "Money received",
            ["Hi {name},", "You received {amount} from account {counterparty}.", "Reference: {reference}."],
        ),
        "withdrawal": (
            "Withdrawal confirmation",
            "Withdrawal successful",
            ["Hi {name},", "You withdrew {amount}.", "Reference: {reference}. New balance: {balance}."],
        ),
        "account_status_changed": (
            f"Your {BRAND} account status changed",
            "Account status updated",
            ["Hi {name},", "Your account has been {state} by our operations team.", "Reason: {reason}."],
        ),
    }

    if template not in simple:
        raise ValueError(f"Unknown email template: {template}")

    subject, title, lines = simple[template]
    text_values = {**{k: str(v) for k, v in ctx.items()}, "name": name}
    html_values = {**h, "name": hn}
    text_lines = [line.format(**text_values) for line in lines]
    html_lines = [line.format(**html_values) for line in lines]
    return subject, _text(title, text_lines), _layout(title, html_lines)
