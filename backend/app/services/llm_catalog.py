"""Curated free chat models for teacher BYOK (exam generation).

Embeddings, rerank, TTS, and safety-only models are intentionally omitted.
"""

from __future__ import annotations

from typing import Literal

LlmProviderChoice = Literal["platform", "openrouter", "groq"]

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Chat / instruct free models that can return exam JSON.
# Laguna S was removed from OpenRouter; Nemotron Lightning often returns empty.
OPENROUTER_FREE_CHAT_MODELS: list[dict[str, str]] = [
    {"id": "openrouter/free", "label": "Free Models Router"},
    {
        "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "label": "NVIDIA Nemotron 3 Ultra 550B (free)",
    },
    {"id": "google/gemma-4-26b-a4b-it:free", "label": "Google Gemma 4 26B A4B (free)"},
    {"id": "google/gemma-4-31b-it:free", "label": "Google Gemma 4 31B (free)"},
]

GROQ_FREE_CHAT_MODELS: list[dict[str, str]] = [
    {"id": "llama-3.1-8b-instant", "label": "Llama 3.1 8B Instant"},
    {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B Versatile"},
    {"id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B"},
    {"id": "gemma2-9b-it", "label": "Gemma 2 9B IT"},
]

_OPENROUTER_IDS = frozenset(m["id"] for m in OPENROUTER_FREE_CHAT_MODELS)
_GROQ_IDS = frozenset(m["id"] for m in GROQ_FREE_CHAT_MODELS)


def models_for_provider(provider: str) -> list[dict[str, str]]:
    p = (provider or "").strip().lower()
    if p == "openrouter":
        return list(OPENROUTER_FREE_CHAT_MODELS)
    if p == "groq":
        return list(GROQ_FREE_CHAT_MODELS)
    return []


def fallback_models_for_provider(provider: str, primary_model: str) -> list[str]:
    """Ordered fallback models for a provider, excluding the primary.

    OpenRouter first tries the free router (it picks an available free
    model), then the Nemotron Ultra free model that was verified working
    on 2026-11-03, then any remaining catalog model. Gemma models are
    therefore not tried first after a Gemma 429, because both Gemma free
    models share the same upstream pool.
    """
    primary = (primary_model or "").strip()
    ordered: list[str] = []
    if (provider or "").strip().lower() == "openrouter":
        preferred = ["openrouter/free", "nvidia/nemotron-3-ultra-550b-a55b:free"]
        ordered = preferred + [m["id"] for m in OPENROUTER_FREE_CHAT_MODELS]
    elif (provider or "").strip().lower() == "groq":
        ordered = [m["id"] for m in GROQ_FREE_CHAT_MODELS]
    seen: set[str] = set()
    out: list[str] = []
    for mid in ordered:
        if mid and mid != primary and mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out


def is_allowed_model(provider: str, model: str) -> bool:
    p = (provider or "").strip().lower()
    mid = (model or "").strip()
    if not mid:
        return False
    if p == "openrouter":
        return mid in _OPENROUTER_IDS
    if p == "groq":
        return mid in _GROQ_IDS
    return False


def base_url_for_provider(provider: str) -> str:
    p = (provider or "").strip().lower()
    if p == "openrouter":
        return OPENROUTER_BASE_URL
    if p == "groq":
        return GROQ_BASE_URL
    return ""


def catalog_payload() -> dict:
    return {
        "providers": [
            {
                "id": "platform",
                "label": "Platform default",
                "models": [],
                "needs_api_key": False,
            },
            {
                "id": "openrouter",
                "label": "OpenRouter",
                "models": OPENROUTER_FREE_CHAT_MODELS,
                "needs_api_key": True,
                "key_help_url": "https://openrouter.ai/keys",
            },
            {
                "id": "groq",
                "label": "Groq",
                "models": GROQ_FREE_CHAT_MODELS,
                "needs_api_key": True,
                "key_help_url": "https://console.groq.com/keys",
            },
        ]
    }
