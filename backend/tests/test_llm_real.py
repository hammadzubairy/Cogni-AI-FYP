"""Optional real-LLM smoke. Skipped unless a provider key is already configured."""

from __future__ import annotations

import os

import pytest

from app.core.config import settings

pytestmark = pytest.mark.llm_real


def _has_real_key() -> bool:
    provider = (os.environ.get("LLM_PROVIDER") or settings.LLM_PROVIDER or "mock").lower()
    if provider in ("", "mock"):
        return False
    return bool(
        os.environ.get("LLM_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or os.environ.get("ANTHROPIC_API_KEY")
        or settings.LLM_API_KEY
    )


@pytest.mark.skipif(not _has_real_key(), reason="SKIPPED: no key")
def test_real_llm_smoke_placeholder():
    """Budget-limited real provider checks live here when a key is present.

    Not expanded in this run: no API key was configured in the environment.
    """
    pytest.fail("unreachable without a key")
