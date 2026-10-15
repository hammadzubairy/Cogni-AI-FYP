"""Shared pytest fixtures for the Cogni.ai backend suite.

Decisions (see TEST_REPORT.md):
- Sync FastAPI TestClient is the default `client` fixture (existing domain
  tests depend on it). An async `async_client` via httpx ASGITransport is
  also provided for concurrency tests.
- Test DB name is `cogni_test_<hex>_dev` (random per session) so the fixture
  world's `_dev` safety guard passes and parallel sessions do not collide.
- LLM_PROVIDER is forced to `mock` for the whole suite.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

# Env overrides MUST land before app.core.config.settings is first imported
# by anything that pulls in app.main. pytest loads conftest first.
_TEST_DB = os.environ.get("TEST_MONGO_DB") or f"cogni_test_{uuid.uuid4().hex[:10]}_dev"
os.environ["TEST_MONGO_DB"] = _TEST_DB
os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017")
os.environ["MONGO_DB"] = _TEST_DB
os.environ["APP_ENV"] = "test"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["JWT_SECRET"] = "test-secret-key-at-least-32-bytes!!"
os.environ.setdefault("JWT_EXPIRE_MIN", "60")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("LOGIN_RATE_LIMIT_MAX", "10000")
os.environ.setdefault("LLM_RATE_LIMIT_MAX", "10000")
os.environ.setdefault("LOGIN_LOCKOUT_FAILURES", "1000")

from app.core import db as db_module  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.ratelimit import llm_limiter, login_limiter  # noqa: E402
from app.main import app  # noqa: E402
from tests.support.world import main as world_main  # noqa: E402

settings.MONGO_DB = _TEST_DB
settings.APP_ENV = "test"
settings.LLM_PROVIDER = "mock"
settings.JWT_SECRET = os.environ["JWT_SECRET"]
settings.JWT_EXPIRE_MIN = int(os.environ["JWT_EXPIRE_MIN"])
settings.LOGIN_LOCKOUT_FAILURES = int(os.environ["LOGIN_LOCKOUT_FAILURES"])

_REAL_LOGIN_MAX_CALLS = login_limiter.max_calls
_REAL_LLM_MAX_CALLS = llm_limiter.max_calls

# Paths hit during the run — used by the route-coverage gate.
_HIT_ROUTES: set[tuple[str, str]] = set()


@app.middleware("http")
async def _record_hit_routes(request, call_next):
    response = await call_next(request)
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    _HIT_ROUTES.add((request.method.upper(), path))
    return response


@pytest.fixture(scope="session")
def test_db_name() -> str:
    return _TEST_DB


@pytest.fixture(scope="session", autouse=True)
async def _session_db(test_db_name: str) -> AsyncIterator[None]:
    """Load fixture world into the session DB once; drop it when the suite ends."""
    settings.MONGO_DB = test_db_name
    settings.LLM_PROVIDER = "mock"
    await world_main(force=False)
    yield
    from pymongo import AsyncMongoClient

    conn = AsyncMongoClient(settings.MONGO_URI)
    await conn.drop_database(test_db_name)
    await conn.close()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Raise rate-limit ceilings so TestClient's shared identity does not
    trip production limits across many tests. test_hardening restores the
    real ceilings for the tests that verify them."""
    login_limiter._hits.clear()
    llm_limiter._hits.clear()
    login_limiter.max_calls = 10_000
    llm_limiter.max_calls = 10_000
    yield
    login_limiter.max_calls = _REAL_LOGIN_MAX_CALLS
    llm_limiter.max_calls = _REAL_LLM_MAX_CALLS


@pytest.fixture
def hit_routes() -> set[tuple[str, str]]:
    return _HIT_ROUTES


@pytest.fixture
async def client() -> AsyncIterator[TestClient]:
    """Fresh fixture-world DB + sync TestClient for each test."""
    settings.MONGO_DB = _TEST_DB
    settings.LLM_PROVIDER = "mock"
    # Lifespan may have opened a client against a previous DB name; ensure
    # get_db() reads settings.MONGO_DB (it does). Reseed for isolation.
    await world_main(force=False)
    with TestClient(app) as c:
        yield c


@pytest.fixture
async def async_client() -> AsyncIterator[AsyncClient]:
    """httpx AsyncClient over ASGITransport (no real server)."""
    settings.MONGO_DB = _TEST_DB
    settings.LLM_PROVIDER = "mock"
    await world_main(force=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Ensure lifespan-connected mongo client exists (TestClient does this
        # automatically; AsyncClient does not enter lifespan unless we do).
        if db_module.client is None:
            db_module.client = __import__("pymongo", fromlist=["AsyncMongoClient"]).AsyncMongoClient(
                settings.MONGO_URI
            )
        yield ac


# ---- persona header fixtures ---------------------------------------------

from tests.helpers import PERSONAS, login_as  # noqa: E402


@pytest.fixture
def admin_headers(client) -> dict[str, str]:
    return login_as(client, "admin")


@pytest.fixture
def hod_headers(client) -> dict[str, str]:
    return login_as(client, "hod")


@pytest.fixture
def teacher_headers(client) -> dict[str, str]:
    return login_as(client, "teacher")


@pytest.fixture
def teacher_other_dept_headers(client) -> dict[str, str]:
    return login_as(client, "teacher_other_dept")


@pytest.fixture
def student_headers(client) -> dict[str, str]:
    return login_as(client, "student")


@pytest.fixture
def student_other_class_headers(client) -> dict[str, str]:
    """Student not enrolled in CS-201-A (DSC student)."""
    return login_as(client, "student_dsc")
