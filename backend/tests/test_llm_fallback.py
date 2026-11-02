"""Fallback tests for OpenAIClient: 429 on primary tries the next model."""
import pytest

from app.services.llm import LLMRequestError, OpenAIClient


class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)


class _Resp:
    def __init__(self, content):
        self.choices = [_Choice(content)]
        self.usage = None


def _client(monkeypatch):
    client = OpenAIClient(
        api_key="test-key",
        base_url="https://openrouter.ai/api/v1",
        model="google/gemma-4-31b-it:free",
    )
    return client


@pytest.mark.asyncio
async def test_fallback_after_429(monkeypatch):
    client = _client(monkeypatch)
    assert client._fallback_models[0] == "openrouter/free"
    calls = []

    async def fake_chat(messages, *, max_tokens, temperature, json_object, model=None):
        calls.append(model)
        if model == "google/gemma-4-31b-it:free":
            raise Exception("Error code: 429 - temporarily rate-limited upstream")
        return _Resp('{"questions": []}')

    monkeypatch.setattr(client, "_chat", fake_chat)
    result = await client.json_complete("sys", "user")
    assert result == {"questions": []}
    assert calls == ["google/gemma-4-31b-it:free", "openrouter/free"]
    assert client.last_model_used == "openrouter/free"
    assert client.primary_model == "google/gemma-4-31b-it:free"


@pytest.mark.asyncio
async def test_all_fallbacks_busy_reports_all_models(monkeypatch):
    client = _client(monkeypatch)

    async def fake_chat(messages, *, max_tokens, temperature, json_object, model=None):
        raise Exception("Error code: 429 - rate limit")

    monkeypatch.setattr(client, "_chat", fake_chat)
    with pytest.raises(LLMRequestError, match="all available free models"):
        await client.json_complete("sys", "user")


@pytest.mark.asyncio
async def test_auth_error_does_not_fallback(monkeypatch):
    client = _client(monkeypatch)
    calls = []

    async def fake_chat(messages, *, max_tokens, temperature, json_object, model=None):
        calls.append(model)
        raise Exception("Error code: 401 - invalid api key")

    monkeypatch.setattr(client, "_chat", fake_chat)
    with pytest.raises(LLMRequestError, match="not configured correctly"):
        await client.json_complete("sys", "user")
    assert calls == ["google/gemma-4-31b-it:free"]
