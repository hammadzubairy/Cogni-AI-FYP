import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.middleware import RequestSizeLimitMiddleware
from app.core.ratelimit import login_limiter
from app.main import app
from tests.support.world import TEST_PASSWORD, main as world_main
from tests.helpers import portal_for

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")


@pytest.fixture
async def client():
    settings.MONGO_DB = TEST_DB
    await world_main(force=False)
    # raise_server_exceptions=False: this file specifically exercises error
    # paths (a 500 from an unhandled exception, a 429 from the rate
    # limiter), and TestClient's default of re-raising any exception that
    # reaches Starlette's ServerErrorMiddleware would otherwise surface our
    # own already-correct 500 response as a test failure instead.
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_login_is_rate_limited_after_10_per_minute(client, monkeypatch):
    # The autouse fixture raises this ceiling so other tests' many logins
    # (TestClient shares one fake IP) don't trip it; this test restores the
    # real production value to verify the limiter itself.
    monkeypatch.setattr(login_limiter, "max_calls", 10)
    for _ in range(10):
        resp = client.post(
            "/api/auth/login", json={"email": "nobody@umt.edu.pk", "password": "wrong", "role": portal_for("nobody@umt.edu.pk")}
        )
        assert resp.status_code == 401

    resp = client.post("/api/auth/login", json={"email": "nobody@umt.edu.pk", "password": "wrong", "role": portal_for("nobody@umt.edu.pk")})
    assert resp.status_code == 429
    assert resp.json()["code"] == "RATE_LIMITED"


def test_unhandled_exception_returns_generic_500(client, monkeypatch):
    async def boom(*args, **kwargs):
        raise RuntimeError("something exploded deep in a service")

    monkeypatch.setattr("app.services.admin.summary", boom)
    token = client.post(
        "/api/auth/login", json={"email": "admin@cogni.pk", "password": TEST_PASSWORD, "role": portal_for("admin@cogni.pk")}
    ).json()["access_token"]

    resp = client.get("/api/admin/summary", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 500
    body = resp.json()
    assert body["code"] == "SERVER_ERROR"
    assert "RuntimeError" not in body["detail"]
    assert "Traceback" not in body["detail"]


async def test_request_size_limit_middleware_rejects_oversized_declared_length():
    calls = []

    async def inner_app(scope, receive, send):
        calls.append(scope)

    middleware = RequestSizeLimitMiddleware(inner_app, max_bytes=1000)
    scope = {
        "type": "http",
        "headers": [(b"content-length", b"999999")],
    }
    sent = []

    async def send(message):
        sent.append(message)

    await middleware(scope, None, send)
    assert calls == []  # inner app never ran
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    assert status == 413


async def test_request_size_limit_middleware_allows_small_declared_length():
    calls = []

    async def inner_app(scope, receive, send):
        calls.append(scope)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = RequestSizeLimitMiddleware(inner_app, max_bytes=1000)
    scope = {"type": "http", "headers": [(b"content-length", b"10")]}

    async def receive():
        return {"type": "http.request", "body": b""}

    async def send(message):
        pass

    await middleware(scope, receive, send)
    assert len(calls) == 1
