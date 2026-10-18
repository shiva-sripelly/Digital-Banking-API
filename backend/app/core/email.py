import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import settings


@dataclass
class OutgoingEmail:
    to_email: str
    subject: str
    text: str
    html: str


class EmailDeliveryError(Exception):
    """`permanent` errors (bad recipient, rejected credentials) are not retried."""

    def __init__(self, reason: str, permanent: bool = False):
        super().__init__(reason)
        self.reason = reason[:250]
        self.permanent = permanent


class SMTPTransport:
    """Sends through the configured SMTP provider. Success means the provider
    accepted the message for delivery, not that it reached the inbox."""

    def send(self, email: OutgoingEmail) -> str:
        message = EmailMessage()
        message["Subject"] = email.subject
        message["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM))
        message["To"] = email.to_email
        message_id = make_msgid(domain=settings.SMTP_FROM.split("@")[-1] or None)
        message["Message-ID"] = message_id
        message.set_content(email.text)
        message.add_alternative(email.html, subtype="html")

        try:
            if settings.SMTP_SECURITY == "ssl":
                server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS)
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS)
            with server:
                if settings.SMTP_SECURITY == "starttls":
                    server.starttls()
                if settings.SMTP_USERNAME:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                refused = server.send_message(message)
        except smtplib.SMTPAuthenticationError as exc:
            raise EmailDeliveryError(f"SMTP authentication rejected (code {exc.smtp_code})", permanent=True) from exc
        except smtplib.SMTPRecipientsRefused as exc:
            raise EmailDeliveryError("Recipient address refused by provider", permanent=True) from exc
        except smtplib.SMTPServerDisconnected as exc:
            # Gmail closes the connection on rejected credentials instead of returning 535
            raise EmailDeliveryError(f"SMTP server disconnected: {exc}") from exc
        except (smtplib.SMTPException, OSError) as exc:
            raise EmailDeliveryError(f"{type(exc).__name__}: {exc}") from exc

        if refused:
            raise EmailDeliveryError("Recipient address refused by provider", permanent=True)
        return message_id
