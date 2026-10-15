import logging
from contextlib import asynccontextmanager

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException
from pymongo import ASCENDING, AsyncMongoClient
from pymongo.errors import PyMongoError

from app.core.config import assert_production_safe, settings

logger = logging.getLogger("app.db")

client: AsyncMongoClient | None = None


def get_db():
    return client[settings.MONGO_DB]


def oid(id_str: str) -> ObjectId:
    """Parse a string id into an ObjectId, or raise a 404 if it's not valid."""
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="Not found")


def to_out(doc: dict) -> dict:
    """Shape a Mongo document for the API: `_id` (ObjectId) -> `id` (str)."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


async def create_indexes() -> None:
    """Create required indexes. Safe to call repeatedly (idempotent)."""
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.classes.create_index("join_code", unique=True)
    await db.classes.create_index("teacher_id")
    await db.exams.create_index("class_id")
    await db.exams.create_index("status")
    await db.attempts.create_index([("exam_id", 1), ("student_id", 1)], unique=True)
    await db.notifications.create_index([("to_user_id", 1), ("created_at", -1)])
    await db.activity_log.create_index([("at", -1)])
    await db.password_resets.create_index("token_hash", unique=True)
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.login_failures.create_index("email")
    await db.login_failures.create_index("at", expireAfterSeconds=max(60, settings.LOGIN_LOCKOUT_MINUTES * 60))
    # At most one settings document (partial unique on a constant field).
    await db.settings.create_index(
        [("singleton", ASCENDING)], unique=True, partialFilterExpression={"singleton": True}
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    assert_production_safe()
    client = AsyncMongoClient(settings.MONGO_URI)
    try:
        await client.admin.command("ping")
        await create_indexes()
    except PyMongoError as exc:
        if settings.is_production:
            await client.close()
            client = None
            raise RuntimeError(f"MongoDB unavailable or index creation failed: {exc}") from exc
        logger.warning("MongoDB not ready at startup (continuing): %s", exc)
    if settings.is_production and not settings.SMTP_HOST.strip():
        logger.warning(
            "SMTP_HOST is empty in production; password-reset emails will not be delivered "
            "(forgot still returns 202; use admin reset as fallback)."
        )
    yield
    if client is not None:
        await client.close()
        client = None
