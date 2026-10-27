import asyncio
import logging
from collections.abc import Iterable
from datetime import UTC, datetime

from bson import ObjectId
from bson.errors import InvalidId

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.services import mailer

logger = logging.getLogger("app.notify")


async def _email_recipients(user_ids: list[str], text: str) -> None:
    """Best-effort email copy of a notification. Never raises."""
    try:
        oids = []
        for uid in user_ids:
            try:
                oids.append(ObjectId(uid))
            except (InvalidId, TypeError):
                continue
        users = await get_db().users.find({"_id": {"$in": oids}}, {"email": 1}).to_list(None)
        plain, html = mailer.render_notification_email(text, settings.PUBLIC_BASE_URL)
        sender = mailer.get_mailer()

        async def _send(email: str) -> None:
            try:
                await sender.send_async(email, "Cogni.ai notification", plain, html)
            except Exception:
                logger.exception("notification email failed")

        emails = [(u.get("email") or "").strip() for u in users]
        await asyncio.gather(*(_send(e) for e in emails if e))
    except Exception:
        logger.exception("notification email batch failed")


async def notify(
    to_user_ids: str | Iterable[str | None] | None,
    text: str,
    page: str | None = None,
    ref_id: str | None = None,
    actor_id: str | None = None,
) -> None:
    """Create one notification per recipient. Skips the actor and
    de-duplicates recipient ids. Mirrors v7's `notify(to, text, go, gid)`."""
    db = get_db()
    ids = {to_user_ids} if isinstance(to_user_ids, str) else set(to_user_ids or [])
    ids.discard(None)
    ids.discard(actor_id)
    if not ids:
        return
    link = {"page": page, "id": ref_id} if page and ref_id else None
    now = datetime.now(UTC)
    await db.notifications.insert_many(
        [
            {"to_user_id": uid, "text": text, "link": link, "read": False, "created_at": now}
            for uid in ids
        ]
    )
    if settings.NOTIFY_EMAIL_ENABLED and mailer.smtp_configured():
        # Awaited (not a background task): serverless hosts like Vercel can
        # freeze the process once the response is sent. Never raises.
        await _email_recipients(sorted(ids), text)


async def log_activity(
    actor: CurrentUser | None,
    text: str,
    *,
    actor_override: dict | None = None,
) -> None:
    db = get_db()
    if actor_override:
        actor_id = actor_override.get("id")
        actor_name = actor_override.get("name", "System")
        role = actor_override.get("role", "system")
    elif actor is not None:
        actor_id = actor.id
        actor_name = actor.name
        role = actor.role
    else:
        actor_id = None
        actor_name = "System"
        role = "system"
    await db.activity_log.insert_one(
        {
            "at": datetime.now(UTC),
            "actor_id": actor_id,
            "actor_name": actor_name,
            "role": role,
            "text": text,
        }
    )
