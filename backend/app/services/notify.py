from collections.abc import Iterable
from datetime import UTC, datetime

from app.core.db import get_db
from app.core.deps import CurrentUser


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
