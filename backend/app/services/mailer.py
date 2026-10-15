"""Outbound mail. ConsoleMailer for development/test; SmtpMailer when configured."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("app.mailer")


class Mailer:
    def send(self, to: str, subject: str, body: str) -> None:
        raise NotImplementedError


class ConsoleMailer(Mailer):
    def send(self, to: str, subject: str, body: str) -> None:
        logger.warning("CONSOLE MAIL to=%s subject=%s\n%s", to, subject, body)
        print(f"\n=== MAIL to={to} subject={subject} ===\n{body}\n=== END MAIL ===\n")


class SmtpMailer(Mailer):
    def send(self, to: str, subject: str, body: str) -> None:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
        msg["To"] = to
        msg.set_content(body)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)


def get_mailer() -> Mailer:
    if settings.SMTP_HOST.strip():
        return SmtpMailer()
    return ConsoleMailer()


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST.strip())
