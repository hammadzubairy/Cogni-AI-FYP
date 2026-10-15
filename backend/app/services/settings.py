from app.core.config import settings as app_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.services.notify import log_activity, notify

APPROVAL_LABELS = {"all": "all papers", "major": "midterms and finals", "none": "no papers"}

DEFAULTS: dict = {
    "approval": "major",
    "ai_threshold_default": 70,
    "institution_name": "",
    "current_term": "",
    "student_signup_enabled": True,
    "allowed_email_domains": [],
    "singleton": True,
}


def _merged(doc: dict | None) -> dict:
    base = dict(DEFAULTS)
    base["max_upload_mb"] = app_settings.MAX_UPLOAD_MB
    if doc:
        for k, v in doc.items():
            if k == "_id":
                continue
            base[k] = v
    if "max_upload_mb" not in (doc or {}):
        base["max_upload_mb"] = app_settings.MAX_UPLOAD_MB
    return base


async def get_settings() -> dict:
    """Always returns merged defaults — never an empty fail-open dict."""
    db = get_db()
    doc = await db.settings.find_one({"singleton": True}) or await db.settings.find_one()
    return _merged(doc)


async def ensure_settings_document(**extra) -> dict:
    """Insert settings with defaults if missing; return merged view."""
    db = get_db()
    doc = await db.settings.find_one({"singleton": True}) or await db.settings.find_one()
    if doc is None:
        payload = dict(DEFAULTS)
        payload["max_upload_mb"] = app_settings.MAX_UPLOAD_MB
        payload.update({k: v for k, v in extra.items() if v is not None})
        await db.settings.insert_one(payload)
        return _merged(payload)
    if extra:
        await db.settings.update_one({"_id": doc["_id"]}, {"$set": {**extra, "singleton": True}})
        doc = await db.settings.find_one({"_id": doc["_id"]})
    return _merged(doc)


async def update_settings(actor: CurrentUser, fields: dict) -> dict:
    db = get_db()
    doc = await db.settings.find_one({"singleton": True}) or await db.settings.find_one()
    old_approval = doc.get("approval") if doc else None

    allowed = {
        "approval",
        "max_upload_mb",
        "ai_threshold_default",
        "institution_name",
        "current_term",
        "student_signup_enabled",
        "allowed_email_domains",
    }
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if "max_upload_mb" in updates:
        updates["max_upload_mb"] = max(1, int(updates["max_upload_mb"]))
    if "ai_threshold_default" in updates:
        updates["ai_threshold_default"] = max(50, min(95, int(updates["ai_threshold_default"])))
    if "institution_name" in updates:
        updates["institution_name"] = str(updates["institution_name"]).strip()
    if "current_term" in updates:
        updates["current_term"] = str(updates["current_term"]).strip()
    if "allowed_email_domains" in updates:
        domains = []
        for d in updates["allowed_email_domains"] or []:
            d = str(d).strip().lower().lstrip("@")
            if d:
                domains.append(d)
        updates["allowed_email_domains"] = domains
    updates["singleton"] = True

    if doc:
        await db.settings.update_one({"_id": doc["_id"]}, {"$set": updates})
    else:
        payload = dict(DEFAULTS)
        payload["max_upload_mb"] = app_settings.MAX_UPLOAD_MB
        payload.update(updates)
        await db.settings.insert_one(payload)

    approval = updates.get("approval", (doc or {}).get("approval", DEFAULTS["approval"]))
    if old_approval is not None and "approval" in updates and old_approval != updates["approval"]:
        recipients = [
            str(u["_id"]) async for u in db.users.find({"role": {"$in": ["teacher", "hod"]}})
        ]
        await notify(
            recipients,
            f"Admin changed HOD approval to: {APPROVAL_LABELS.get(approval, approval)}",
            actor_id=actor.id,
        )

    await log_activity(
        actor,
        f"Updated settings: approval {approval}, "
        f"threshold {updates.get('ai_threshold_default', (doc or {}).get('ai_threshold_default', 70))}%, "
        f"upload {updates.get('max_upload_mb', (doc or {}).get('max_upload_mb', app_settings.MAX_UPLOAD_MB))} MB",
    )
    return await get_settings()
