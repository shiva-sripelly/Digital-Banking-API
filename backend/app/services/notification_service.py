"""Email notifications with delivery tracking and retries.

Each notification gets an `email_notifications` row (metadata only, never the
body). Delivery happens on a background worker thread with exponential
backoff; the rendered message lives only in memory, so one-time codes are
never persisted. If the process restarts before delivery, the row is marked
failed on startup and the user can request a new code.
"""
import heapq
import itertools
import logging
import threading
import time
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.email import EmailDeliveryError, OutgoingEmail, SMTPTransport
from app.models.email_notification import EmailNotification
from app.services.email_templates import render

logger = logging.getLogger("app.email")

RETRY_DELAYS_SECONDS = (5, 30, 120, 600)


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


class EmailDispatcher:
    def __init__(self):
        self.transport = SMTPTransport()
        self._queue: list = []
        self._counter = itertools.count()
        self._cv = threading.Condition()
        self._thread: threading.Thread | None = None
        self._stopping = False

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        if settings.EMAIL_DELIVERY_MODE != "background" or (self._thread and self._thread.is_alive()):
            return
        self._mark_orphans_failed()
        self._stopping = False
        self._thread = threading.Thread(target=self._run, name="email-dispatcher", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        with self._cv:
            self._stopping = True
            self._cv.notify_all()
        if self._thread:
            self._thread.join(timeout)

    # -- public API ----------------------------------------------------------
    def submit(self, notification_id: int, email: OutgoingEmail) -> None:
        if settings.EMAIL_DELIVERY_MODE == "sync":
            self._deliver(notification_id, email, attempt=1, allow_retry=False)
            return
        self._schedule(notification_id, email, attempt=1, delay=0)
        if not (self._thread and self._thread.is_alive()):
            self.start()

    # -- internals -------------------------------------------------------------
    def _schedule(self, notification_id: int, email: OutgoingEmail, attempt: int, delay: float) -> None:
        with self._cv:
            heapq.heappush(self._queue, (time.monotonic() + delay, next(self._counter), notification_id, email, attempt))
            self._cv.notify()

    def _run(self) -> None:
        while True:
            with self._cv:
                while not self._stopping and (not self._queue or self._queue[0][0] > time.monotonic()):
                    timeout = (self._queue[0][0] - time.monotonic()) if self._queue else None
                    self._cv.wait(timeout=timeout)
                if self._stopping:
                    return
                _, _, notification_id, email, attempt = heapq.heappop(self._queue)
            try:
                self._deliver(notification_id, email, attempt, allow_retry=True)
            except Exception:  # never let the worker die
                logger.exception("email worker error for notification %s", notification_id)

    def _deliver(self, notification_id: int, email: OutgoingEmail, attempt: int, allow_retry: bool) -> None:
        db = SessionLocal()
        try:
            row = db.get(EmailNotification, notification_id)
            if row is None:
                return
            row.attempts = attempt
            try:
                self.transport.send(email)
            except EmailDeliveryError as exc:
                can_retry = allow_retry and not exc.permanent and attempt < settings.EMAIL_MAX_ATTEMPTS
                row.status = "retrying" if can_retry else "failed"
                row.last_error = exc.reason
                db.commit()
                logger.warning(
                    "email %s (%s to %s) attempt %s failed: %s",
                    notification_id, row.template, mask_email(row.to_email), attempt, exc.reason,
                )
                if can_retry:
                    delay = RETRY_DELAYS_SECONDS[min(attempt - 1, len(RETRY_DELAYS_SECONDS) - 1)]
                    self._schedule(notification_id, email, attempt + 1, delay)
                return
            row.status = "accepted"
            row.last_error = None
            row.accepted_at = datetime.now(timezone.utc)
            db.commit()
            logger.info("email %s (%s) accepted by provider", notification_id, row.template)
        finally:
            db.close()

    def _mark_orphans_failed(self) -> None:
        """Messages queued by a previous process can't be resent (bodies are not stored)."""
        db = SessionLocal()
        try:
            db.query(EmailNotification).filter(EmailNotification.status.in_(("queued", "retrying"))).update(
                {"status": "failed", "last_error": "Process restarted before delivery"}, synchronize_session=False
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("could not mark orphaned email notifications")
            # Recovery is part of application startup. Continuing here would
            # make a missing/misconfigured schema look healthy and defer the
            # failure until a user requests an email.
            raise
        finally:
            db.close()


dispatcher = EmailDispatcher()


class Notifier:
    @staticmethod
    def send(
        db: Session,
        template: str,
        to_email: str,
        context: dict,
        user_id: int | None = None,
        dedupe_key: str | None = None,
    ) -> EmailNotification | None:
        """Queue an email. Call after the business transaction has committed.
        A repeated `dedupe_key` is ignored, which prevents notification storms."""
        subject, text, html = render(template, context)
        row = EmailNotification(
            user_id=user_id, to_email=to_email, template=template, subject=subject, dedupe_key=dedupe_key
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return None
        dispatcher.submit(row.id, OutgoingEmail(to_email=to_email, subject=subject, text=text, html=html))
        db.refresh(row)
        return row
