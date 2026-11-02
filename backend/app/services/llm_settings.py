"""Teacher personal LLM preferences (BYOK for exam generation)."""

from __future__ import annotations

from fastapi import HTTPException

from app.core.db import get_db, oid
from app.core.deps import CurrentUser
from app.schemas.llm_settings import (
    LlmCatalogOut,
    TeacherLlmSettingsOut,
    TeacherLlmSettingsUpdate,
)
from app.services import llm_catalog
from app.services.secrets_crypto import decrypt_secret, encrypt_secret, mask_secret

LLM_FIELD = "llm"


def _catalog() -> LlmCatalogOut:
    return LlmCatalogOut.model_validate(llm_catalog.catalog_payload())


def _prefs_from_doc(doc: dict | None) -> dict:
    raw = (doc or {}).get(LLM_FIELD) or {}
    if not isinstance(raw, dict):
        return {}
    return raw


def settings_out_from_doc(doc: dict | None) -> TeacherLlmSettingsOut:
    prefs = _prefs_from_doc(doc)
    provider = (prefs.get("provider") or "platform").strip().lower()
    if provider not in ("platform", "openrouter", "groq"):
        provider = "platform"
    model = (prefs.get("model") or "").strip()
    enc = prefs.get("api_key_enc") or ""
    api_key_set = bool(enc)
    masked = None
    if api_key_set:
        try:
            masked = mask_secret(decrypt_secret(enc))
        except ValueError:
            masked = "••••"
            api_key_set = True
    using_platform = provider == "platform" or not api_key_set
    return TeacherLlmSettingsOut(
        provider=provider,  # type: ignore[arg-type]
        model=model,
        api_key_set=api_key_set,
        api_key_masked=masked,
        using_platform=using_platform,
        catalog=_catalog(),
    )


async def get_teacher_llm_settings(actor: CurrentUser) -> TeacherLlmSettingsOut:
    doc = await get_db().users.find_one({"_id": oid(actor.id)})
    if doc is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return settings_out_from_doc(doc)


async def update_teacher_llm_settings(
    actor: CurrentUser, payload: TeacherLlmSettingsUpdate
) -> TeacherLlmSettingsOut:
    db = get_db()
    doc = await db.users.find_one({"_id": oid(actor.id)})
    if doc is None:
        raise HTTPException(status_code=404, detail="User not found.")

    provider = payload.provider
    model = (payload.model or "").strip()

    if provider == "platform":
        model = ""
    else:
        if not llm_catalog.is_allowed_model(provider, model):
            raise HTTPException(
                status_code=400,
                detail="Choose a free chat model from the list for that provider.",
            )

    prefs = dict(_prefs_from_doc(doc))
    prefs["provider"] = provider
    prefs["model"] = model

    if payload.clear_api_key:
        prefs.pop("api_key_enc", None)
    elif payload.api_key is not None:
        key = payload.api_key.strip()
        if key:
            prefs["api_key_enc"] = encrypt_secret(key)
        # blank api_key with clear_api_key=False → keep existing

    if provider != "platform" and not prefs.get("api_key_enc"):
        raise HTTPException(
            status_code=400,
            detail="Paste an API key for OpenRouter or Groq, or switch to Platform default.",
        )

    await db.users.update_one({"_id": oid(actor.id)}, {"$set": {LLM_FIELD: prefs}})
    updated = await db.users.find_one({"_id": oid(actor.id)})
    return settings_out_from_doc(updated)


def resolve_teacher_llm_credentials(user_doc: dict | None) -> dict | None:
    """Return {provider, model, api_key, base_url} when BYOK is active, else None."""
    prefs = _prefs_from_doc(user_doc)
    provider = (prefs.get("provider") or "platform").strip().lower()
    if provider not in ("openrouter", "groq"):
        return None
    enc = prefs.get("api_key_enc") or ""
    if not enc:
        return None
    model = (prefs.get("model") or "").strip()
    if not llm_catalog.is_allowed_model(provider, model):
        return None
    try:
        api_key = decrypt_secret(enc)
    except ValueError:
        return None
    if not api_key.strip():
        return None
    return {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "base_url": llm_catalog.base_url_for_provider(provider),
    }
