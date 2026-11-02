"""Curated free chat models for teacher BYOK (exam generation).

Embeddings, rerank, TTS, and safety-only models are intentionally omitted.
"""

from __future__ import annotations

from typing import Literal

LlmProviderChoice = Literal["platform", "openrouter", "groq"]

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Chat / instruct free models that can return exam JSON.
OPENROUTER_FREE_CHAT_MODELS: list[dict[str, str]] = [
    {"id": "openrouter/free", "label": "Free Models Router"},
    {"id": "google/gemma-4-26b-a4b-it:free", "label": "Google Gemma 4 26B A4B (free)"},
    {"id": "google/gemma-4-31b-it:free", "label": "Google Gemma 4 31B (free)"},
    {"id": "poolside/laguna-s-2.1:free", "label": "Poolside Laguna S 2.1 (free)"},
    {"id": "nvidia/nemotron-3.5-lightning:free", "label": "NVIDIA Nemotron 3.5 Lightning (free)"},
    {"id": "liquid/lfm-2.5-2.6b:free", "label": "LiquidAI LFM 2.5 2.6B (free)"},
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
