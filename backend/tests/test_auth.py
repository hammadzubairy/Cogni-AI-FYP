import os

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient
from pymongo import AsyncMongoClient

from app.core.config import settings
from app.core.deps import require_role
from app.main import app
from tests.helpers import WORLD_PASSWORD

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")

# Throwaway admin-only route for require_role() proofs. Mounted only inside
# the role-guard tests so it never pollutes app.openapi() for the suite-wide
# RBAC / route-coverage gates (which failed under pytest-randomly when this
# path was registered at import time but not yet hit).
_test_router = APIRouter()


@_test_router.get("/api/_test/admin-only")
async def _admin_only(user=Depends(require_role("admin"))):
    return {"ok": True}


_admin_only_mounted = False


@pytest.fixture
def admin_only_route():
    global _admin_only_mounted
    if not _admin_only_mounted:
        app.include_router(_test_router)
        _admin_only_mounted = True
        app.openapi_schema = None
    yield


async def _set_status(email: str, status: str) -> None:
    conn = AsyncMongoClient(settings.MONGO_URI)
    await conn[TEST_DB].users.update_one({"email": email}, {"$set": {"status": status}})
    await conn.close()


def _login(client, email, password=WORLD_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


@pytest.mark.parametrize(
    "email,role",
    [
        ("admin@cogni.pk", "admin"),
        ("tariq.mehmood@umt.edu.pk", "hod"),
        ("ayesha.khan@umt.edu.pk", "teacher"),
        ("hamza.ali@umt.edu.pk", "student"),
    ],
)
def test_login_ok_for_each_role(client, email, role):
    resp = _login(client, email)
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == email
    assert body["user"]["role"] == role
    assert "access_token" in body


def test_login_email_is_case_insensitive(client):
    resp = _login(client, "ADMIN@Cogni.pk")
    assert resp.status_code == 200


def test_login_wrong_password(client):
    resp = _login(client, "admin@cogni.pk", password="wrong-password")
    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == "UNAUTHORIZED"
    assert "incorrect" in body["detail"].lower()


def test_login_unknown_email(client):
    resp = _login(client, "nobody@cogni.pk")
    assert resp.status_code == 401


async def test_login_inactive_user_blocked(client):
    await _set_status("hamza.ali@umt.edu.pk", "inactive")
    resp = _login(client, "hamza.ali@umt.edu.pk")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "This account is deactivated. Ask an admin to reactivate it."


def test_me_returns_current_user(client):
    token = _login(client, "ayesha.khan@umt.edu.pk").json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "ayesha.khan@umt.edu.pk"
    assert body["role"] == "teacher"
    assert "password_hash" not in body


def test_token_missing_is_unauthorized(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


def test_role_guard_rejects_wrong_role(client, admin_only_route):
    token = _login(client, "hamza.ali@umt.edu.pk").json()["access_token"]  # student
    resp = client.get("/api/_test/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


def test_role_guard_allows_correct_role(client, admin_only_route):
    token = _login(client, "admin@cogni.pk").json()["access_token"]
    resp = client.get("/api/_test/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_demo_accounts_endpoint_removed(client):
    resp = client.get("/api/auth/demo-accounts")
    assert resp.status_code == 404


def test_public_config_available(client):
    resp = client.get("/api/public/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["needs_setup"] is False
    assert "student_signup_enabled" in body
