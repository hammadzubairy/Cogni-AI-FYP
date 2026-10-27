"""Outbound mail. ConsoleMailer for development/test; SmtpMailer when configured
(works with any SMTP relay, e.g. Brevo: smtp-relay.brevo.com:587)."""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from html import escape

from app.core.config import settings

logger = logging.getLogger("app.mailer")


class Mailer:
    def send(self, to: str, subject: str, body: str, html: str | None = None) -> None:
        raise NotImplementedError

    async def send_async(
        self, to: str, subject: str, body: str, html: str | None = None
    ) -> None:
        """Run the blocking send off the event loop."""
        await asyncio.to_thread(self.send, to, subject, body, html)


class ConsoleMailer(Mailer):
    def send(self, to: str, subject: str, body: str, html: str | None = None) -> None:
        logger.warning("CONSOLE MAIL to=%s subject=%s\n%s", to, subject, body)
        print(f"\n=== MAIL to={to} subject={subject} ===\n{body}\n=== END MAIL ===\n")


class SmtpMailer(Mailer):
    def send(self, to: str, subject: str, body: str, html: str | None = None) -> None:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
        msg["To"] = to
        msg.set_content(body)
        if html:
            msg.add_alternative(html, subtype="html")
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


def render_notification_email(text: str, link: str | None) -> tuple[str, str]:
    """Return (plain, html) bodies for a notification. All text is escaped."""
    plain = text + (f"\n\nOpen Cogni.ai: {link}" if link else "")
    button = (
        f'<p><a href="{escape(link, quote=True)}" style="display:inline-block;'
        "padding:10px 18px;background:#4f46e5;color:#fff;border-radius:6px;"
        'text-decoration:none">Open Cogni.ai</a></p>'
        if link
        else ""
    )
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">'
        '<h2 style="color:#4f46e5">Cogni.ai</h2>'
        f"<p>{escape(text)}</p>{button}"
        '<p style="color:#888;font-size:12px">You are receiving this because of '
        "activity on your Cogni.ai account.</p></div>"
    )
    return plain, html
