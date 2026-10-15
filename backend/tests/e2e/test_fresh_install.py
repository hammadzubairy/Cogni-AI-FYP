"""HTTP journey on an empty DB: needs_setup → create admin → locked."""

from __future__ import annotations

import os
import subprocess
import sys

import pytest
from pymongo import MongoClient

from app.core.config import settings


def _clear_users_and_settings() -> None:
    """Sync clear so we stay off AsyncMongoClient event-loop issues with TestClient."""
    conn = MongoClient(settings.MONGO_URI)
    db = conn[settings.MONGO_DB]
    db.users.delete_many({})
    db.settings.delete_many({})
    db.email_verifications.delete_many({})
    db.password_resets.delete_many({})
    conn.close()


def _reseed_fixture_world() -> None:
    env = {
        **os.environ,
        "MONGO_URI": settings.MONGO_URI,
        "MONGO_DB": settings.MONGO_DB,
        "APP_ENV": "test",
        "LLM_PROVIDER": "mock",
        "JWT_SECRET": settings.JWT_SECRET,
    }
    subprocess.check_call(
        [sys.executable, "-m", "tests.support.world", "--force"],
        cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
        env=env,
    )


@pytest.mark.api
def test_fresh_install_setup_admin_http(client):
    _clear_users_and_settings()
    try:
        cfg = client.get("/api/public/config")
        assert cfg.status_code == 200
        assert cfg.json()["needs_setup"] is True

        created = client.post(
            "/api/setup/admin",
            json={
                "name": "Fresh Admin",
                "email": "fresh.admin@school.edu",
                "password": "Strong-Passw0rd!",
                "institution_name": "Fresh University",
                "current_term": "Spring 2027",
            },
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["user"]["role"] == "admin"
        assert body["access_token"]

        cfg2 = client.get("/api/public/config")
        assert cfg2.json()["needs_setup"] is False
        assert cfg2.json()["institution_name"] == "Fresh University"

        again = client.post(
            "/api/setup/admin",
            json={
                "name": "Second",
                "email": "second@school.edu",
                "password": "Strong-Passw0rd!",
                "institution_name": "X",
                "current_term": "Y",
            },
        )
        assert again.status_code == 409
    finally:
        _reseed_fixture_world()
