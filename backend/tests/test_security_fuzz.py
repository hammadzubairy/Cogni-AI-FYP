"""Security / fuzz checks: injection, mass-assignment, input chaos, concurrency."""

from __future__ import annotations

import concurrent.futures

import pytest
from bson import ObjectId

from tests.helpers import WORLD_PASSWORD, login_as, make_exam_draft, upload_material

pytestmark = pytest.mark.security


@pytest.fixture(autouse=True)
def _fail_on_unexpected_5xx(client, request):
    """Any 5xx fails the test unless marked expect_5xx."""
    allow = request.node.get_closest_marker("expect_5xx") is not None
    original = client.request

    def wrapped(method, url, **kwargs):
        resp = original(method, url, **kwargs)
        if not allow and resp.status_code >= 500:
            body = resp.text[:500]
            pytest.fail(f"unexpected {resp.status_code} on {method} {url}: {body}")
        return resp

    client.request = wrapped
    yield
    client.request = original


def _assert_no_secret_keys(obj, path="$"):
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert k not in ("password", "password_hash"), f"leaked {k} at {path}"
            _assert_no_secret_keys(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _assert_no_secret_keys(item, f"{path}[{i}]")


# ---- NoSQL injection on login ---------------------------------------------


def test_nosql_injection_login_rejected(client):
    payloads = [
        {"email": {"$ne": None}, "password": {"$ne": None}},
        {"email": {"$gt": ""}, "password": "demo123"},
        {"email": "admin@cogni.pk", "password": {"$ne": None}},
        {"email": {"$regex": ".*"}, "password": {"$regex": ".*"}},
    ]
    for body in payloads:
        resp = client.post("/api/auth/login", json=body)
        # Pydantic may surface as 400 or 422 depending on the error handler.
        assert resp.status_code in (400, 401, 422), resp.text
        assert resp.status_code not in (200, 500)


# ---- Mass assignment ------------------------------------------------------


def test_mass_assignment_ignored_on_user_create_and_patch(client):
    admin = login_as(client, "admin")
    depts = client.get("/api/admin/departments", headers=admin).json()
    cs = next(d for d in depts if d["code"] == "CS")
    email = f"mass.assign.{ObjectId()}@umt.edu.pk"

    create = client.post(
        "/api/admin/users",
        json={
            "name": "Mass Assign",
            "email": email,
            "role": "student",
            "dept_id": cs["id"],
            "password": "hacked",
            "password_hash": "x",
            "status": "inactive",
            "score": 100,
        },
        headers=admin,
    )
    assert create.status_code in (201, 422), create.text
    if create.status_code == 201:
        body = create.json()
        user = body.get("user", body)
        temp = body.get("temporary_password")
        assert user["role"] == "student"
        assert user["status"] == "active"  # status not accepted on create
        assert "password" not in user
        assert "password_hash" not in user
        assert "score" not in user
        bad = client.post("/api/auth/login", json={"email": email, "password": "hacked"})
        assert bad.status_code == 401
        ok = client.post("/api/auth/login", json={"email": email, "password": temp})
        assert ok.status_code == 200
        assert ok.json().get("scope") == "change_password"

    # Patch with extra fields
    teacher = login_as(client, "teacher")
    me = client.get("/api/auth/me", headers=teacher).json()
    patch = client.patch(
        f"/api/admin/users/{me['id']}",
        json={"status": "active", "password_hash": "nope", "score": 99, "role": "teacher"},
        headers=admin,
    )
    assert patch.status_code in (200, 422), patch.text
    if patch.status_code == 200:
        assert "password_hash" not in patch.json()
        assert "score" not in patch.json()


def test_mass_assignment_on_exam_and_override(client):
    teacher = login_as(client, "teacher")
    classes = client.get("/api/classes", headers=teacher).json()
    class_id = next(c["id"] for c in classes if c["code"] == "CS-201-A")
    material = upload_material(client, class_id, name="mass-assign-mat")
    exam = make_exam_draft(
        client,
        class_id=class_id,
        material_ids=[material["id"]],
        title="mass-assign-quiz",
        kind="Quiz",
        counts={"MCQ": 1, "Short": 1},
    )
    exam_id = exam["id"]

    patched = client.patch(
        f"/api/exams/{exam_id}",
        json={
            "title": "still draft",
            "status": "published",
            "released": True,
            "teacher_id": "someone-else",
            "score": 100,
        },
        headers=teacher,
    )
    assert patched.status_code in (200, 422), patched.text
    if patched.status_code == 200:
        body = patched.json()
        assert body["status"] == "draft"
        assert body["released"] is False
        assert body["title"] == "still draft"

    client.post(f"/api/exams/{exam_id}/publish", headers=teacher)
    student = login_as(client, "student")
    attempt = client.post(f"/api/exams/{exam_id}/attempts", headers=student).json()
    q = next(q for q in exam["questions"] if q["type"] == "Short")
    client.put(
        f"/api/attempts/{attempt['id']}/answers",
        json={"qid": q["qid"], "value": "short answer text"},
        headers=student,
    )
    client.post(f"/api/attempts/{attempt['id']}/submit", headers=student)

    ov = client.post(
        f"/api/attempts/{attempt['id']}/override",
        json={"qid": q["qid"], "score": 1, "role": "admin", "status": "submitted", "total": 999},
        headers=teacher,
    )
    assert ov.status_code in (200, 422), ov.text
    if ov.status_code == 200:
        assert "role" not in ov.json() or ov.json().get("student_id") == attempt["student_id"]


# ---- Input fuzz -----------------------------------------------------------


def test_input_fuzz_sample_endpoints(client):
    admin = login_as(client, "admin")
    teacher = login_as(client, "teacher")
    student = login_as(client, "student")
    huge = "x" * (100 * 1024)
    bad_oid = "not-an-objectid"
    unicode_name = "测试🌟café"

    samples = [
        ("POST", "/api/auth/login", None, {}),
        ("POST", "/api/auth/login", None, {"email": 123, "password": True}),
        ("POST", "/api/auth/login", None, {"email": "a@b.c", "password": huge}),
        ("POST", "/api/admin/users", admin, {"name": unicode_name}),
        ("POST", "/api/admin/users", admin, {"name": "x", "email": "y", "role": "nope", "dept_id": "z"}),
        ("GET", f"/api/admin/users/{bad_oid}", admin, None),
        ("PATCH", f"/api/admin/users/{bad_oid}", admin, {"status": "active"}),
        ("GET", f"/api/classes/{bad_oid}", teacher, None),
        ("POST", "/api/classes/join", student, {"join_code": ""}),
        ("POST", "/api/classes/join", student, {"join_code": huge[:64]}),
        ("POST", "/api/classes", teacher, {"name": unicode_name, "code": f"U-{ObjectId()}"}),
        ("GET", f"/api/exams/{bad_oid}", teacher, None),
        ("POST", f"/api/exams/{bad_oid}/submit", teacher, None),
        ("GET", f"/api/attempts/{bad_oid}", student, None),
        ("POST", f"/api/materials/{bad_oid}/ask", student, {"question": "What is hashing?"}),
        ("PUT", f"/api/attempts/{bad_oid}/answers", student, {"qid": "q1", "value": "x"}),
    ]

    for method, path, headers, body in samples:
        kwargs = {"headers": headers} if headers else {}
        if body is not None:
            kwargs["json"] = body
        resp = client.request(method, path, **kwargs)
        # Valid edge inputs (e.g. unicode names) may succeed; never 5xx / stack.
        assert resp.status_code < 500, f"{method} {path} -> {resp.status_code} {resp.text[:200]}"
        assert "Traceback" not in resp.text
        assert "RuntimeError" not in resp.text


# ---- Concurrency ----------------------------------------------------------


def test_concurrent_submit_idempotent(client):
    teacher = login_as(client, "teacher")
    classes = client.get("/api/classes", headers=teacher).json()
    class_id = next(c["id"] for c in classes if c["code"] == "CS-201-A")
    material = upload_material(client, class_id, name="conc-submit-mat")
    exam = make_exam_draft(
        client,
        class_id=class_id,
        material_ids=[material["id"]],
        title="conc-submit-quiz",
        kind="Quiz",
        counts={"MCQ": 1},
    )
    exam_id = exam["id"]
    assert client.post(f"/api/exams/{exam_id}/publish", headers=teacher).status_code == 200

    student = login_as(client, "student")
    start = client.post(f"/api/exams/{exam_id}/attempts", headers=student)
    assert start.status_code == 201, start.text
    attempt_id = start.json()["id"]
    mcq = exam["questions"][0]
    client.put(
        f"/api/attempts/{attempt_id}/answers",
        json={"qid": mcq["qid"], "value": mcq["answer_index"]},
        headers=student,
    )

    token = student["Authorization"]

    def _submit(_):
        return client.post(
            f"/api/attempts/{attempt_id}/submit",
            headers={"Authorization": token},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(_submit, range(20)))

    statuses = [r.status_code for r in results]
    assert all(s < 500 for s in statuses), statuses
    assert all(s == 200 for s in statuses), statuses
    bodies = [r.json() for r in results]
    assert all(b == {"status": "submitted"} for b in bodies)

    mine = client.get(f"/api/attempts/{attempt_id}", headers=student).json()
    assert mine["status"] == "submitted"


def test_parallel_joins_same_code(client):
    teacher = login_as(client, "teacher")
    admin = login_as(client, "admin")
    cls = client.post(
        "/api/classes",
        json={"name": "Join Race", "code": f"JR-{ObjectId()}"},
        headers=teacher,
    )
    assert cls.status_code == 201, cls.text
    join_code = cls.json()["join_code"]
    class_id = cls.json()["id"]
    dept_id = cls.json()["dept_id"]

    # Create 5 fresh students in the teacher's department; finish password change.
    emails = []
    for i in range(5):
        email = f"join.race.{i}.{ObjectId()}@umt.edu.pk"
        resp = client.post(
            "/api/admin/users",
            json={"name": f"Join Race {i}", "email": email, "role": "student", "dept_id": dept_id},
            headers=admin,
        )
        assert resp.status_code == 201, resp.text
        temp = resp.json()["temporary_password"]
        scoped = client.post("/api/auth/login", json={"email": email, "password": temp})
        assert scoped.status_code == 200
        changed = client.post(
            "/api/auth/change-password",
            json={"current_password": temp, "new_password": WORLD_PASSWORD},
            headers={"Authorization": f"Bearer {scoped.json()['access_token']}"},
        )
        assert changed.status_code == 200, changed.text
        emails.append(email)

    tokens = []
    for email in emails:
        tok = client.post(
            "/api/auth/login", json={"email": email, "password": WORLD_PASSWORD}
        ).json()["access_token"]
        tokens.append(tok)

    def _join(token):
        return client.post(
            "/api/classes/join",
            json={"join_code": join_code},
            headers={"Authorization": f"Bearer {token}"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(_join, tokens))

    assert all(r.status_code < 500 for r in results), [r.status_code for r in results]
    successes = [r for r in results if r.status_code == 200]
    conflicts = [r for r in results if r.status_code == 409]
    assert len(successes) + len(conflicts) == 5
    assert len(successes) >= 1

    detail = client.get(f"/api/classes/{class_id}", headers=teacher).json()
    unique_ids = set(detail["student_ids"])
    assert len(unique_ids) == len(detail["student_ids"])  # no duplicate enrollments
    assert len(unique_ids) == len(successes)
