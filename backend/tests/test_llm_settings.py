"""Teacher LLM BYOK settings — prefs API, masking, client resolution."""

from __future__ import annotations

from app.services import llm_catalog
from app.services.llm import OpenAIClient, get_llm_client, get_llm_client_for_user
from app.services.llm_settings import resolve_teacher_llm_credentials
from app.services.secrets_crypto import decrypt_secret, encrypt_secret, mask_secret
from tests.helpers import WORLD_PASSWORD, portal_for

TEACHER = "ayesha.khan@umt.edu.pk"
STUDENT = "hamza.ali@umt.edu.pk"
HOD = "tariq.mehmood@umt.edu.pk"


def _auth(client, email, password=WORLD_PASSWORD):
    resp = client.post(
        "/api/auth/login",
        json={"email": email, "password": password, "role": portal_for(email)},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_catalog_allows_only_curated_chat_models():
    assert llm_catalog.is_allowed_model("openrouter", "google/gemma-4-31b-it:free")
    assert llm_catalog.is_allowed_model("groq", "llama-3.1-8b-instant")
    assert not llm_catalog.is_allowed_model(
        "openrouter", "nvidia/nemotron-3.5-content-safety:free"
    )
    assert not llm_catalog.is_allowed_model("openrouter", "heygen/heygen-voice-turbo:free")
    assert llm_catalog.base_url_for_provider("openrouter").startswith("https://openrouter.ai")
    assert llm_catalog.base_url_for_provider("groq").startswith("https://api.groq.com")


def test_secrets_crypto_roundtrip_and_mask():
    token = encrypt_secret("sk-or-v1-abcdefghijklmnop")
    assert token != "sk-or-v1-abcdefghijklmnop"
    assert decrypt_secret(token) == "sk-or-v1-abcdefghijklmnop"
    assert mask_secret("sk-or-v1-abcdefghijklmnop").endswith("mnop")
    assert "abcd" not in mask_secret("sk-or-v1-abcdefghijklmnop")


def test_teacher_get_default_platform(client):
    headers = _auth(client, TEACHER)
    resp = client.get("/api/me/llm", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "platform"
    assert body["api_key_set"] is False
    assert body["using_platform"] is True
    assert "api_key" not in body
    assert "api_key_enc" not in body
    providers = {p["id"] for p in body["catalog"]["providers"]}
    assert providers == {"platform", "openrouter", "groq"}


def test_student_and_hod_cannot_access_llm_settings(client):
    for email in (STUDENT, HOD):
        headers = _auth(client, email)
        assert client.get("/api/me/llm", headers=headers).status_code == 403
        assert (
            client.put(
                "/api/me/llm",
                headers=headers,
                json={"provider": "platform", "model": ""},
            ).status_code
            == 403
        )


def test_teacher_put_rejects_bad_model_and_missing_key(client):
    headers = _auth(client, TEACHER)
    bad = client.put(
        "/api/me/llm",
        headers=headers,
        json={
            "provider": "openrouter",
            "model": "nvidia/nemotron-3-embed-1b:free",
            "api_key": "sk-test-key-12345678",
        },
    )
    assert bad.status_code == 400

    missing = client.put(
        "/api/me/llm",
        headers=headers,
        json={
            "provider": "groq",
            "model": "llama-3.1-8b-instant",
            "api_key": "",
        },
    )
    assert missing.status_code == 400


def test_teacher_put_masks_key_and_never_returns_plaintext(client):
    headers = _auth(client, TEACHER)
    key = "sk-or-v1-test-secret-key-9999"
    resp = client.put(
        "/api/me/llm",
        headers=headers,
        json={
            "provider": "openrouter",
            "model": "poolside/laguna-s-2.1:free",
            "api_key": key,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provider"] == "openrouter"
    assert body["model"] == "poolside/laguna-s-2.1:free"
    assert body["api_key_set"] is True
    assert body["using_platform"] is False
    assert body["api_key_masked"] == "••••9999"
    dumped = resp.text
    assert key not in dumped
    assert "api_key_enc" not in dumped

    again = client.get("/api/me/llm", headers=headers)
    assert again.status_code == 200
    assert again.json()["api_key_masked"] == "••••9999"
    assert key not in again.text

    # Blank api_key keeps existing
    keep = client.put(
        "/api/me/llm",
        headers=headers,
        json={
            "provider": "openrouter",
            "model": "google/gemma-4-31b-it:free",
            "api_key": "",
        },
    )
    assert keep.status_code == 200
    assert keep.json()["model"] == "google/gemma-4-31b-it:free"
    assert keep.json()["api_key_set"] is True

    cleared = client.put(
        "/api/me/llm",
        headers=headers,
        json={"provider": "platform", "model": "", "clear_api_key": True},
    )
    assert cleared.status_code == 200
    assert cleared.json()["using_platform"] is True
    assert cleared.json()["api_key_set"] is False


def test_resolve_credentials_and_client_override():
    doc = {
        "llm": {
            "provider": "groq",
            "model": "llama-3.1-8b-instant",
            "api_key_enc": encrypt_secret("gsk_test_key_abcd"),
        }
    }
    creds = resolve_teacher_llm_credentials(doc)
    assert creds is not None
    assert creds["provider"] == "groq"
    assert creds["model"] == "llama-3.1-8b-instant"
    assert creds["api_key"] == "gsk_test_key_abcd"
    assert "groq.com" in creds["base_url"]

    client = get_llm_client_for_user(doc)
    assert isinstance(client, OpenAIClient)
    assert client._model == "llama-3.1-8b-instant"

    assert resolve_teacher_llm_credentials({"llm": {"provider": "platform"}}) is None
    assert isinstance(get_llm_client_for_user({"llm": {"provider": "platform"}}), type(get_llm_client()))
