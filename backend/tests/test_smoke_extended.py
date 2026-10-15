"""Extended smoke: OpenAPI, seed idempotency, indexes, no password leakage."""

from __future__ import annotations

import pytest
from pymongo import AsyncMongoClient

from app.core.config import settings
from app.main import app
from tests.support.world import TEST_PASSWORD, main as world_main
from tests.helpers import login_as

pytestmark = pytest.mark.api


def _assert_no_password_keys(obj, path="$"):
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert k not in ("password", "password_hash"), f"leaked {k} at {path}"
            _assert_no_password_keys(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _assert_no_password_keys(item, f"{path}[{i}]")


def test_openapi_schema_generates():
    schema = app.openapi()
    assert schema["openapi"].startswith("3.")
    assert "paths" in schema
    assert "/api/health" in schema["paths"]
    assert "/api/auth/login" in schema["paths"]
    # sanity: we expect dozens of operations
    ops = sum(len(methods) for methods in schema["paths"].values())
    assert ops >= 40


async def test_seed_idempotent_user_counts(client):
    """Running seed twice yields the same user count (full recreate, stable)."""
    conn = AsyncMongoClient(settings.MONGO_URI)
    db = conn[settings.MONGO_DB]
    await world_main(force=False)
    count1 = await db.users.count_documents({})
    await world_main(force=False)
    count2 = await db.users.count_documents({})
    await conn.close()
    assert count1 == count2
    assert count1 >= 12


async def test_indexes_unique_email_and_join_code(client):
    conn = AsyncMongoClient(settings.MONGO_URI)
    db = conn[settings.MONGO_DB]
    user_indexes = await db.users.index_information()
    class_indexes = await db.classes.index_information()
    await conn.close()

    def _has_unique(indexes, field: str) -> bool:
        for meta in indexes.values():
            keys = meta.get("key", [])
            if keys == [(field, 1)] and meta.get("unique"):
                return True
        return False

    assert _has_unique(user_indexes, "email"), user_indexes
    assert _has_unique(class_indexes, "join_code"), class_indexes


def test_responses_never_leak_password_keys(client):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@cogni.pk", "password": TEST_PASSWORD},
    )
    assert login.status_code == 200
    _assert_no_password_keys(login.json())

    admin = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = client.get("/api/auth/me", headers=admin)
    assert me.status_code == 200
    _assert_no_password_keys(me.json())

    users = client.get("/api/admin/users", headers=admin)
    assert users.status_code == 200
    _assert_no_password_keys(users.json())

    cfg = client.get("/api/public/config")
    assert cfg.status_code == 200
    _assert_no_password_keys(cfg.json())

    # also a non-admin sample
    teacher = login_as(client, "teacher")
    t_me = client.get("/api/auth/me", headers=teacher)
    _assert_no_password_keys(t_me.json())
