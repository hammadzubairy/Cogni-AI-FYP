"""Self-contained soft route matrix: walk OpenAPI and hit every operation once.

Coordinates with conftest's `_HIT_ROUTES` middleware. This test does not depend
on other modules having run — it exercises each path itself, then asserts full
coverage against `app.openapi()`.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import pytest

from app.main import app
from tests.helpers import WORLD_PASSWORD, login_as, upload_material

pytestmark = pytest.mark.api


def _openapi_ops() -> set[tuple[str, str]]:
    schema = app.openapi()
    out: set[tuple[str, str]] = set()
    for path, methods in schema["paths"].items():
        if "/_test/" in path:
            continue  # test-only routes mounted by auth role-guard proofs
        for method in methods:
            if method.lower() in ("get", "post", "put", "patch", "delete"):
                out.add((method.upper(), path))
    return out


@pytest.mark.api
def test_all_openapi_routes_reachable(client, hit_routes):
    """Issue a minimal authorized request for every OpenAPI operation."""
    tag = uuid.uuid4().hex[:8]

    admin = login_as(client, "admin")
    hod = login_as(client, "hod")
    teacher = login_as(client, "teacher")
    student = login_as(client, "student")
    student_b = login_as(client, "sana.iqbal@umt.edu.pk")

    # Seed-world ids
    classes = client.get("/api/classes", headers=teacher).json()
    c1 = next(c for c in classes if c["code"] == "CS-201-A")
    class_id = c1["id"]

    materials = client.get(f"/api/classes/{class_id}/materials", headers=teacher).json()
    material_id = materials[0]["id"]

    depts = client.get("/api/admin/departments", headers=admin).json()
    cs = next(d for d in depts if d["code"] == "CS")
    dept_id = cs["id"]

    users = client.get("/api/admin/users", headers=admin).json()
    some_user_id = users[0]["id"]
    teacher_me = client.get("/api/auth/me", headers=teacher).json()
    teacher_id = teacher_me["id"]

    # Dedicated disposable class + material + exams for mutating routes
    disp = client.post(
        "/api/classes",
        json={"name": f"Coverage {tag}", "code": f"CV-{tag[:6].upper()}"},
        headers=teacher,
    )
    assert disp.status_code == 201, disp.text
    disp_class_id = disp.json()["id"]
    disp_join = disp.json()["join_code"]

    mat = upload_material(client, disp_class_id, name=f"cov-mat-{tag}")
    mat_id = mat["id"]

    # Draft exam (for edit / delete-question / regenerate / add / submit / withdraw)
    gen = client.post(
        "/api/exams/generate",
        json={
            "class_id": disp_class_id,
            "title": f"Cov draft {tag}",
            "kind": "Midterm",
            "duration_min": 30,
            "material_ids": [mat_id],
            "counts": {"MCQ": 2, "Short": 1},
        },
        headers=teacher,
    )
    assert gen.status_code == 201, gen.text
    draft = gen.json()["exam"]
    draft_id = draft["id"]
    qid = draft["questions"][0]["qid"]
    qid2 = draft["questions"][1]["qid"]

    # Quiz to publish → attempt → grade path
    quiz_gen = client.post(
        "/api/exams/generate",
        json={
            "class_id": class_id,
            "title": f"Cov quiz {tag}",
            "kind": "Quiz",
            "duration_min": 20,
            "material_ids": [material_id],
            "counts": {"MCQ": 1, "Short": 1},
        },
        headers=teacher,
    )
    assert quiz_gen.status_code == 201, quiz_gen.text
    quiz = quiz_gen.json()["exam"]
    quiz_id = quiz["id"]
    client.post(f"/api/exams/{quiz_id}/publish", headers=teacher)

    # Student attempt on quiz
    start = client.post(f"/api/exams/{quiz_id}/attempts", headers=student)
    assert start.status_code == 201, start.text
    attempt_id = start.json()["id"]
    for q in quiz["questions"]:
        if q["type"] == "MCQ":
            client.put(
                f"/api/attempts/{attempt_id}/answers",
                json={"qid": q["qid"], "value": q["answer_index"]},
                headers=student,
            )
        else:
            client.put(
                f"/api/attempts/{attempt_id}/answers",
                json={"qid": q["qid"], "value": "coverage answer"},
                headers=student,
            )
    client.post(f"/api/attempts/{attempt_id}/submit", headers=student)

    # Another draft to delete entirely
    del_gen = client.post(
        "/api/exams/generate",
        json={
            "class_id": disp_class_id,
            "title": f"Cov delete {tag}",
            "kind": "Quiz",
            "duration_min": 15,
            "material_ids": [mat_id],
            "counts": {"MCQ": 1},
        },
        headers=teacher,
    )
    delete_exam_id = del_gen.json()["exam"]["id"]

    # Material that can be deleted (not referenced by non-draft exams)
    del_mat = upload_material(client, disp_class_id, name=f"cov-del-mat-{tag}")
    del_mat_id = del_mat["id"]

    # Fresh student to join disposable class / then remove
    join_email = f"cov.join.{tag}@umt.edu.pk"
    ju = client.post(
        "/api/admin/users",
        json={"name": "Cov Join", "email": join_email, "role": "student", "dept_id": cs["id"]},
        headers=admin,
    )
    assert ju.status_code == 201
    ju_body = ju.json()
    join_student_id = ju_body.get("user", ju_body)["id"]
    temp = ju_body["temporary_password"]
    scoped = client.post("/api/auth/login", json={"email": join_email, "password": temp})
    assert scoped.status_code == 200
    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": temp, "new_password": WORLD_PASSWORD},
        headers={"Authorization": f"Bearer {scoped.json()['access_token']}"},
    )
    assert changed.status_code == 200, changed.text
    join_h = login_as(client, join_email)

    # Notification id for mark-read
    notes = client.get("/api/notifications", headers=teacher).json()
    notif_id = notes["items"][0]["id"] if notes["items"] else "000000000000000000000000"

    # Pending exam for approve/return: submit disposable draft copy path —
    # use a second midterm on CS-201-A for HOD approve/return (CS HOD).
    mid = client.post(
        "/api/exams/generate",
        json={
            "class_id": class_id,
            "title": f"Cov pending {tag}",
            "kind": "Midterm",
            "duration_min": 40,
            "material_ids": [material_id],
            "counts": {"MCQ": 1, "Short": 1},
        },
        headers=teacher,
    )
    pending_id = mid.json()["exam"]["id"]
    client.post(f"/api/exams/{pending_id}/submit", headers=teacher)

    # Second pending for return
    mid2 = client.post(
        "/api/exams/generate",
        json={
            "class_id": class_id,
            "title": f"Cov return {tag}",
            "kind": "Midterm",
            "duration_min": 40,
            "material_ids": [material_id],
            "counts": {"MCQ": 1, "Short": 1},
        },
        headers=teacher,
    )
    return_id = mid2.json()["exam"]["id"]
    client.post(f"/api/exams/{return_id}/submit", headers=teacher)

    # Paper request
    due = datetime(2026, 12, 15, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    # Admin: create throwaway dept + user for POST routes
    new_dept = client.post(
        "/api/admin/departments",
        json={"code": f"CV{tag[:4].upper()}", "name": f"Cov Dept {tag}"},
        headers=admin,
    )
    new_dept_id = new_dept.json()["id"] if new_dept.status_code == 201 else dept_id

    new_user = client.post(
        "/api/admin/users",
        json={
            "name": f"Cov User {tag}",
            "email": f"cov.user.{tag}@umt.edu.pk",
            "role": "teacher",
            "dept_id": new_dept_id,
        },
        headers=admin,
    )
    if new_user.status_code == 201:
        body = new_user.json()
        new_user_id = body.get("user", body).get("id", some_user_id)
    else:
        new_user_id = some_user_id

    # Explicit ordered calls — ensure each OpenAPI path is hit at least once.
    planned: list[tuple[str, str, dict | None, dict | None]] = [
        ("GET", "/api/health", None, None),
        ("GET", "/api/public/config", None, None),
        ("GET", "/api/public/departments", None, None),
        ("POST", "/api/auth/login", None, {"email": "admin@cogni.pk", "password": WORLD_PASSWORD}),
        ("POST", "/api/auth/forgot", None, {"email": "admin@cogni.pk"}),
        ("POST", "/api/auth/register", None, {
            "name": f"Cov Reg {tag}",
            "email": f"cov.reg.{tag}@school.edu",
            "password": "Strong-Passw0rd!",
        }),
        ("POST", "/api/auth/reset", None, {"token": "not-a-real-token", "new_password": "Strong-Passw0rd!"}),
        # needs_setup is false on seeded DB → expect 409
        ("POST", "/api/setup/admin", None, {
            "name": "Setup",
            "email": f"setup.{tag}@school.edu",
            "password": "Strong-Passw0rd!",
            "institution_name": "X",
            "current_term": "T1",
        }),
        ("GET", "/api/auth/me", admin, None),
        ("GET", "/api/admin/users", admin, None),
        ("GET", "/api/admin/onboarding", admin, None),
        ("GET", "/api/admin/llm-status", admin, None),
        ("POST", "/api/auth/change-password", admin, {
            "current_password": WORLD_PASSWORD,
            "new_password": WORLD_PASSWORD,
        }),
        ("POST", "/api/admin/users", admin, {
            "name": f"Cov Extra {tag}",
            "email": f"cov.extra.{tag}@umt.edu.pk",
            "role": "student",
            "dept_id": cs["id"],
        }),
        ("PATCH", f"/api/admin/users/{new_user_id}", admin, {"status": "active"}),
        ("POST", f"/api/admin/users/{new_user_id}/reset-password", admin, None),
        ("GET", "/api/admin/departments", admin, None),
        ("POST", "/api/admin/departments", admin, {
            "code": f"CX{tag[:4].upper()}",
            "name": f"Cov X {tag}",
        }),
        ("PATCH", f"/api/admin/departments/{new_dept_id}", admin, {"hod_id": new_user_id}),
        ("GET", "/api/admin/classes", admin, None),
        ("PATCH", f"/api/admin/classes/{disp_class_id}", admin, {"teacher_id": teacher_id}),
        ("GET", "/api/admin/settings", admin, None),
        ("PUT", "/api/admin/settings", admin, {
            "approval": "major",
            "max_upload_mb": 25,
            "ai_threshold_default": 70,
        }),
        ("GET", "/api/admin/activity", admin, None),
        ("GET", "/api/admin/summary", admin, None),
        ("GET", "/api/classes", teacher, None),
        ("POST", "/api/classes", teacher, {"name": f"Cov2 {tag}", "code": f"C2-{tag[:6].upper()}"}),
        ("GET", f"/api/classes/{class_id}", teacher, None),
        ("POST", f"/api/classes/{disp_class_id}/students", teacher, {"email": join_email}),
        ("DELETE", f"/api/classes/{disp_class_id}/students/{join_student_id}", teacher, None),
        ("POST", "/api/classes/join", join_h, {"join_code": disp_join}),
        ("GET", "/api/requests", teacher, None),
        ("POST", "/api/requests", hod, {
            "teacher_id": teacher_id,
            "class_id": class_id,
            "kind": "Final",
            "due": due,
            "note": "coverage final",
        }),
        ("GET", "/api/hod/policy", hod, None),
        ("PUT", "/api/hod/policy", hod, {"min_clo": 2, "higher_order_pct": 25, "max_repeats": 2}),
        ("GET", "/api/hod/approvals", hod, None),
        ("GET", "/api/hod/analytics", hod, None),
        ("GET", "/api/notifications", teacher, None),
        ("POST", f"/api/notifications/{notif_id}/read", teacher, None),
        ("POST", "/api/notifications/read-all", teacher, None),
        ("POST", f"/api/classes/{disp_class_id}/materials", teacher, {
            "name": f"cov text {tag}",
            "text": ("Coverage material text for route matrix. " * 20),
        }),
        ("GET", f"/api/classes/{class_id}/materials", teacher, None),
        ("GET", f"/api/materials/{material_id}", teacher, None),
        ("DELETE", f"/api/materials/{del_mat_id}", teacher, None),
        ("POST", f"/api/materials/{material_id}/ask", student, {
            "question": "What is a hash collision in a hash table?",
        }),
        ("POST", "/api/exams/generate", teacher, {
            "class_id": disp_class_id,
            "title": f"Cov gen2 {tag}",
            "kind": "Quiz",
            "duration_min": 10,
            "material_ids": [mat_id],
            "counts": {"MCQ": 1},
        }),
        ("GET", "/api/exams", teacher, None),
        ("GET", f"/api/exams/{quiz_id}", teacher, None),
        ("PATCH", f"/api/exams/{draft_id}", teacher, {"title": f"Cov draft renamed {tag}"}),
        ("PATCH", f"/api/exams/{draft_id}/questions/{qid}", teacher, {"text": "Renamed Q?"}),
        ("POST", f"/api/exams/{draft_id}/questions/{qid}/regenerate", teacher, None),
        ("POST", f"/api/exams/{draft_id}/questions", teacher, {"type": "Short"}),
        ("DELETE", f"/api/exams/{draft_id}/questions/{qid2}", teacher, None),
        ("POST", f"/api/exams/{draft_id}/submit", teacher, None),
        ("POST", f"/api/exams/{draft_id}/withdraw", teacher, None),
        ("POST", f"/api/exams/{pending_id}/approve", hod, {}),
        ("POST", f"/api/exams/{return_id}/return", hod, {"comment": "coverage return note"}),
        ("GET", f"/api/exams/{pending_id}/checks", hod, None),
        ("POST", f"/api/exams/{pending_id}/publish", teacher, None),
        ("POST", f"/api/exams/{pending_id}/close", teacher, None),
        ("POST", f"/api/exams/{quiz_id}/attempts", student_b, None),
        ("PUT", f"/api/attempts/{attempt_id}/answers", student, {
            "qid": quiz["questions"][0]["qid"],
            "value": quiz["questions"][0].get("answer_index", 0)
            if quiz["questions"][0]["type"] == "MCQ"
            else "x",
        }),
        ("POST", f"/api/attempts/{attempt_id}/submit", student, None),
        ("GET", "/api/attempts/mine", student, None),
        ("GET", f"/api/attempts/{attempt_id}", student, None),
        ("GET", f"/api/exams/{quiz_id}/results", teacher, None),
        ("GET", f"/api/attempts/{attempt_id}/detail", teacher, None),
        ("PUT", f"/api/exams/{quiz_id}/threshold", teacher, {"value": 70}),
        ("POST", f"/api/attempts/{attempt_id}/flags", teacher, {
            "qid": next(q["qid"] for q in quiz["questions"] if q["type"] != "MCQ"),
            "decision": "cleared",
        }),
        ("POST", f"/api/attempts/{attempt_id}/override", teacher, {
            "qid": quiz["questions"][0]["qid"],
            "score": 0,
        }),
        ("POST", f"/api/exams/{quiz_id}/release", teacher, None),
        ("GET", "/api/flags", teacher, None),
        ("GET", f"/api/attempts/{attempt_id}/feedback", student, None),
        ("GET", "/api/dashboard/teacher", teacher, None),
        ("GET", "/api/dashboard/student", student, None),
        ("GET", "/api/dashboard/hod", hod, None),
        ("DELETE", f"/api/exams/{delete_exam_id}", teacher, None),
    ]

    errors: list[str] = []
    for method, path, headers, body in planned:
        kwargs: dict = {}
        if headers is not None:
            kwargs["headers"] = headers
        if body is not None:
            kwargs["json"] = body
        resp = client.request(method, path, **kwargs)
        if resp.status_code >= 500:
            errors.append(f"{method} {path} -> {resp.status_code} {resp.text[:200]}")

    assert not errors, "\n".join(errors)

    expected = _openapi_ops()
    # Normalize hit_routes paths: middleware records route.path templates when available
    hit = set(hit_routes)

    missing = expected - hit
    # Also accept concrete-path hits by matching templates
    still_missing = set()
    for method, path in missing:
        # path is template like /api/exams/{exam_id}
        pattern = "^" + re.sub(r"\{[^}]+\}", r"[^/]+", path) + "$"
        if not any(m == method and re.match(pattern, p) for m, p in hit):
            still_missing.add((method, path))

    assert not still_missing, (
        "OpenAPI routes never hit during this test:\n"
        + "\n".join(f"  {m} {p}" for m, p in sorted(still_missing))
    )
