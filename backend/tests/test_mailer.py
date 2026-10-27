import asyncio

from app.core.config import settings
from app.services import mailer
from app.services import notify as notify_mod
from app.services.mailer import render_notification_email


class CaptureMailer(mailer.Mailer):
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    def send(self, to, subject, body, html=None):
        if self.fail:
            raise RuntimeError("smtp down")
        self.sent.append((to, subject, body, html))


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _n):
        return self.docs


class _Users:
    def find(self, *_a, **_k):
        return _Cursor([{"email": "a@x.com"}, {"email": ""}, {"email": "b@x.com"}])


class _Db:
    users = _Users()


def _patch(monkeypatch, cap):
    monkeypatch.setattr(notify_mod.mailer, "get_mailer", lambda: cap)
    monkeypatch.setattr(notify_mod, "get_db", lambda: _Db())


def test_render_escapes_html():
    plain, html = render_notification_email("<script>x</script>", "http://a/?b=1&c=2")
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "&amp;" in html
    assert "http://a" in plain


def test_email_recipients_sends_to_each_valid_address(monkeypatch):
    cap = CaptureMailer()
    _patch(monkeypatch, cap)
    asyncio.run(notify_mod._email_recipients(["64b000000000000000000001"], "hello"))
    assert [m[0] for m in cap.sent] == ["a@x.com", "b@x.com"]
    assert cap.sent[0][3] is not None


def test_email_failure_does_not_raise(monkeypatch):
    _patch(monkeypatch, CaptureMailer(fail=True))
    asyncio.run(notify_mod._email_recipients(["64b000000000000000000001"], "hello"))


def test_smtp_configured_follows_host(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp-relay.brevo.com")
    assert mailer.smtp_configured()
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    assert not mailer.smtp_configured()
