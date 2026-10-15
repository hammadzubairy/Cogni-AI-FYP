"""Programmatic RBAC matrix over every OpenAPI /api route.

Rules
-----
- anonymous on Bearer routes → 401
- wrong role → 403 (or 404 where the service hides existence)
- allowed roles → status NOT in {401, 403}; 200/201/204/400/404/409/422 are fine
  (authorized but failed validation / ownership-shaped 404)

Path IDs come from the seeded world (CS-201-A / ayesha / hamza). Destructive
calls prefer IDs/payloads that yield 400/404/409 so later matrix cells stay stable.
"""

from __future__ import annotations

import pytest

from app.main import app
from tests.helpers import WORLD_PASSWORD, PERSONAS, login_as

ROLES = ("anonymous", "student", "teacher", "hod", "admin")

# (METHOD, openapi_path) → roles that must not receive 401/403.
ALLOWED_ROLES: dict[tuple[str, str], set[str]] = {
    # ---- public ----
    ("GET", "/api/health"): {"anonymous", "student", "teacher", "hod", "admin"},
    ("POST", "/api/auth/login"): {"anonymous", "student", "teacher", "hod", "admin"},
    ("GET", "/api/public/config"): {"anonymous", "student", "teacher", "hod", "admin"},
    ("GET", "/api/public/departments"): {"anonymous", "student", "teacher", "hod", "admin"},
    ("POST", "/api/setup/admin"): {"anonymous", "student", "teacher", "hod", "admin"},
    ("POST", "/api/auth/register"): {"anonymous", "student", "teacher", "hod", "admin"},
    ("POST", "/api/auth/forgot"): {"anonymous", "student", "teacher", "hod", "admin"},
    ("POST", "/api/auth/reset"): {"anonymous", "student", "teacher", "hod", "admin"},
    # ---- any authenticated ----
    ("GET", "/api/auth/me"): {"student", "teacher", "hod", "admin"},
    ("POST", "/api/auth/change-password"): {"student", "teacher", "hod", "admin"},
    ("GET", "/api/classes"): {"student", "teacher", "hod", "admin"},
    ("GET", "/api/exams"): {"student", "teacher", "hod", "admin"},
    ("GET", "/api/notifications"): {"student", "teacher", "hod", "admin"},
    ("POST", "/api/notifications/read-all"): {"student", "teacher", "hod", "admin"},
    # Non-owners get 404 (existence hidden) — still "allowed" at the role gate.
    ("POST", "/api/notifications/{notif_id}/read"): {"student", "teacher", "hod", "admin"},
    ("GET", "/api/classes/{class_id}"): {"student", "teacher", "hod", "admin"},
    ("GET", "/api/classes/{class_id}/materials"): {"student", "teacher", "hod", "admin"},
    ("GET", "/api/materials/{material_id}"): {"student", "teacher", "hod", "admin"},
    ("GET", "/api/exams/{exam_id}"): {"student", "teacher", "hod", "admin"},
    # ---- admin ----
    ("GET", "/api/admin/users"): {"admin"},
    ("POST", "/api/admin/users"): {"admin"},
    ("PATCH", "/api/admin/users/{user_id}"): {"admin"},
    ("POST", "/api/admin/users/{user_id}/reset-password"): {"admin"},
    ("GET", "/api/admin/departments"): {"admin"},
    ("POST", "/api/admin/departments"): {"admin"},
    ("PATCH", "/api/admin/departments/{dept_id}"): {"admin"},
    ("GET", "/api/admin/classes"): {"admin"},
    ("PATCH", "/api/admin/classes/{class_id}"): {"admin"},
    ("GET", "/api/admin/settings"): {"admin"},
    ("PUT", "/api/admin/settings"): {"admin"},
    ("GET", "/api/admin/activity"): {"admin"},
    ("GET", "/api/admin/summary"): {"admin"},
    ("GET", "/api/admin/onboarding"): {"admin"},
    ("GET", "/api/admin/llm-status"): {"admin"},
    # ---- teacher ----
    ("POST", "/api/classes"): {"teacher"},
    ("POST", "/api/classes/{class_id}/students"): {"teacher"},
    ("DELETE", "/api/classes/{class_id}/students/{student_id}"): {"teacher"},
    ("POST", "/api/classes/{class_id}/materials"): {"teacher"},
    ("DELETE", "/api/materials/{material_id}"): {"teacher"},
    ("POST", "/api/exams/generate"): {"teacher"},
    ("PATCH", "/api/exams/{exam_id}"): {"teacher"},
    ("DELETE", "/api/exams/{exam_id}"): {"teacher"},
    ("PATCH", "/api/exams/{exam_id}/questions/{qid}"): {"teacher"},
    ("DELETE", "/api/exams/{exam_id}/questions/{qid}"): {"teacher"},
    ("POST", "/api/exams/{exam_id}/questions/{qid}/regenerate"): {"teacher"},
    ("POST", "/api/exams/{exam_id}/questions"): {"teacher"},
    ("POST", "/api/exams/{exam_id}/submit"): {"teacher"},
    ("POST", "/api/exams/{exam_id}/withdraw"): {"teacher"},
    ("POST", "/api/exams/{exam_id}/publish"): {"teacher"},
    ("POST", "/api/exams/{exam_id}/close"): {"teacher"},
    ("GET", "/api/exams/{exam_id}/results"): {"teacher"},
    ("PUT", "/api/exams/{exam_id}/threshold"): {"teacher"},
    ("POST", "/api/exams/{exam_id}/release"): {"teacher"},
    ("GET", "/api/attempts/{attempt_id}/detail"): {"teacher"},
    ("POST", "/api/attempts/{attempt_id}/flags"): {"teacher"},
    ("POST", "/api/attempts/{attempt_id}/override"): {"teacher"},
    ("GET", "/api/flags"): {"teacher"},
    ("GET", "/api/dashboard/teacher"): {"teacher"},
    # ---- student ----
    ("POST", "/api/classes/join"): {"student"},
    ("POST", "/api/exams/{exam_id}/attempts"): {"student"},
    ("PUT", "/api/attempts/{attempt_id}/answers"): {"student"},
    ("POST", "/api/attempts/{attempt_id}/submit"): {"student"},
    ("GET", "/api/attempts/mine"): {"student"},
    ("GET", "/api/attempts/{attempt_id}"): {"student"},
    ("POST", "/api/materials/{material_id}/ask"): {"student"},
    ("GET", "/api/dashboard/student"): {"student"},
    # ---- hod ----
    ("POST", "/api/requests"): {"hod"},
    ("GET", "/api/hod/policy"): {"hod"},
    ("PUT", "/api/hod/policy"): {"hod"},
    ("GET", "/api/hod/approvals"): {"hod"},
    ("GET", "/api/hod/analytics"): {"hod"},
    ("GET", "/api/dashboard/hod"): {"hod"},
    ("POST", "/api/exams/{exam_id}/approve"): {"hod"},
    ("POST", "/api/exams/{exam_id}/return"): {"hod"},
    # ---- mixed ----
    ("GET", "/api/requests"): {"teacher", "hod"},
    ("GET", "/api/exams/{exam_id}/checks"): {"teacher", "hod"},
    ("GET", "/api/attempts/{attempt_id}/feedback"): {"student", "teacher"},
}

PUBLIC_ROUTES = {
    ("GET", "/api/health"),
    ("POST", "/api/auth/login"),
    ("GET", "/api/public/config"),
    ("GET", "/api/public/departments"),
    ("POST", "/api/setup/admin"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/forgot"),
    ("POST", "/api/auth/reset"),
}

# Teacher lifecycle ops that should target a published exam (expect 400/409).
_TEACHER_EXAM_MUTATIONS = {
    ("PATCH", "/api/exams/{exam_id}"),
    ("DELETE", "/api/exams/{exam_id}"),
    ("PATCH", "/api/exams/{exam_id}/questions/{qid}"),
    ("DELETE", "/api/exams/{exam_id}/questions/{qid}"),
    ("POST", "/api/exams/{exam_id}/questions/{qid}/regenerate"),
    ("POST", "/api/exams/{exam_id}/questions"),
    ("POST", "/api/exams/{exam_id}/submit"),
    ("POST", "/api/exams/{exam_id}/withdraw"),
    ("POST", "/api/exams/{exam_id}/publish"),
    ("POST", "/api/exams/{exam_id}/close"),
    ("GET", "/api/exams/{exam_id}/results"),
    ("PUT", "/api/exams/{exam_id}/threshold"),
}


def _openapi_api_routes() -> list[tuple[str, str]]:
    routes: list[tuple[str, str]] = []
    for path, methods in app.openapi()["paths"].items():
        if not path.startswith("/api") or path.startswith("/api/_test"):
            continue
        for method in methods:
            if method in ("get", "post", "put", "patch", "delete"):
                routes.append((method.upper(), path))
    return routes


def _headers_for(client, role: str) -> dict[str, str] | None:
    if role == "anonymous":
        return None
    return login_as(client, role)


def _build_world(client) -> dict:
    th = login_as(client, "teacher")
    st = login_as(client, "student")
    ad = login_as(client, "admin")

    classes = client.get("/api/classes", headers=th).json()
    class_id = next(c["id"] for c in classes if c["code"] == "CS-201-A")
    materials = client.get(f"/api/classes/{class_id}/materials", headers=th).json()
    material_id = materials[0]["id"]

    exams = client.get(f"/api/exams?class_id={class_id}", headers=th).json()
    published = next(e for e in exams if e["title"] == "Quiz 3: Graphs & Queues")
    pending = next(e for e in exams if e["status"] == "pending")
    released = next(e for e in exams if e.get("released") is True)
    qid = published["questions"][0]["qid"]

    mine = client.get("/api/attempts/mine", headers=st).json()
    attempt_id = mine[0]["id"]

    notifs = client.get("/api/notifications", headers=st).json()
    notif_id = notifs["items"][0]["id"]

    users = client.get("/api/admin/users", headers=ad).json()
    # Sacrificial user for reset-password (must not be a persona reused for login later).
    reset_target = next(u for u in users if u["email"] == "sana.iqbal@umt.edu.pk")
    outsider = next(u for u in users if u["email"] == PERSONAS["student_dsc"])
    depts = client.get("/api/admin/departments", headers=ad).json()
    cs = next(d for d in depts if d["code"] == "CS")
    hod_user = next(u for u in users if u["email"] == PERSONAS["hod"])

    return {
        "class_id": class_id,
        "material_id": material_id,
        "exam_id_published": published["id"],
        "exam_id_pending": pending["id"],
        "exam_id_released": released["id"],
        "qid": qid,
        "attempt_id": attempt_id,
        "notif_id": notif_id,
        "user_id": reset_target["id"],
        "student_id": outsider["id"],  # not enrolled in CS-201-A → DELETE yields 404
        "dept_id": cs["id"],
        "hod_id": cs["hod_id"] or hod_user["id"],
        "teacher_id": next(u["id"] for u in users if u["email"] == PERSONAS["teacher"]),
    }


def _exam_id_for(method: str, path: str, world: dict) -> str:
    # Prefer IDs that yield 400/409 for allowed roles so the matrix stays non-destructive.
    if path in ("/api/exams/{exam_id}/approve", "/api/exams/{exam_id}/return"):
        return world["exam_id_published"]  # wrong status → 409 for same-dept HOD
    if (method, path) == ("POST", "/api/exams/{exam_id}/release"):
        return world["exam_id_released"]  # already released → 409
    if (method, path) == ("POST", "/api/exams/{exam_id}/close"):
        return world["exam_id_pending"]  # not published → 409
    if (method, path) in _TEACHER_EXAM_MUTATIONS:
        return world["exam_id_published"]
    return world["exam_id_published"]


def _fill_path(method: str, path: str, world: dict) -> str:
    exam_id = _exam_id_for(method, path, world)
    replacements = {
        "{class_id}": world["class_id"],
        "{material_id}": world["material_id"],
        "{exam_id}": exam_id,
        "{qid}": world["qid"],
        "{attempt_id}": world["attempt_id"],
        "{notif_id}": world["notif_id"],
        "{user_id}": world["user_id"],
        "{student_id}": world["student_id"],
        "{dept_id}": world["dept_id"],
    }
    out = path
    for token, value in replacements.items():
        out = out.replace(token, value)
    return out


def _payload_for(method: str, path: str, world: dict) -> dict | None:
    bodies: dict[tuple[str, str], dict] = {
        ("POST", "/api/auth/login"): {
            "email": PERSONAS["admin"],
            "password": WORLD_PASSWORD,
        },
        ("POST", "/api/admin/users"): {
            "name": "Temp User",
            "email": "rbac.temp@cogni.pk",
            "role": "student",
            "dept_id": world["dept_id"],
        },
        ("PATCH", "/api/admin/users/{user_id}"): {},
        ("POST", "/api/admin/departments"): {"code": "TMP", "name": "Temp Dept"},
        # Keep current HOD — `{}` would send hod_id=None and demote them to teacher.
        ("PATCH", "/api/admin/departments/{dept_id}"): {"hod_id": world["hod_id"]},
        ("PATCH", "/api/admin/classes/{class_id}"): {"teacher_id": world["teacher_id"]},
        ("PUT", "/api/admin/settings"): {
            "approval": "major",
            "max_upload_mb": 25,
            "ai_threshold_default": 70,
        },
        ("POST", "/api/classes"): {"name": "RBAC Temp", "code": "RBAC-1"},
        ("POST", "/api/classes/join"): {"join_code": "NOPE-000"},
        # Already enrolled → 409 for the owning teacher.
        ("POST", "/api/classes/{class_id}/students"): {"email": PERSONAS["student"]},
        ("POST", "/api/classes/{class_id}/materials"): {
            "name": "Short",
            "text": "too short",
        },
        ("POST", "/api/requests"): {
            "teacher_id": world["teacher_id"],
            "class_id": world["class_id"],
            "kind": "Quiz",
            "due": "2026-12-01T00:00:00Z",
            "note": "rbac",
        },
        ("PUT", "/api/hod/policy"): {
            "min_clo": 2,
            "higher_order_pct": 25,
            "max_repeats": 2,
        },
        ("POST", "/api/exams/generate"): {
            "class_id": world["class_id"],
            "title": "RBAC gen",
            "kind": "Quiz",
            "duration_min": 20,
            "material_ids": [],
            "counts": {"MCQ": 1},  # valid shape; empty materials → 400 for owner
        },
        ("PATCH", "/api/exams/{exam_id}"): {"title": "RBAC rename"},
        ("PATCH", "/api/exams/{exam_id}/questions/{qid}"): {"text": "Edited?"},
        ("POST", "/api/exams/{exam_id}/questions"): {"type": "MCQ"},
        ("POST", "/api/exams/{exam_id}/approve"): {},
        ("POST", "/api/exams/{exam_id}/return"): {"comment": "rbac return"},
        ("PUT", "/api/exams/{exam_id}/threshold"): {"value": 70},
        ("PUT", "/api/attempts/{attempt_id}/answers"): {
            "qid": world["qid"],
            "value": 0,
        },
        ("POST", "/api/attempts/{attempt_id}/flags"): {
            "qid": world["qid"],
            "decision": "cleared",
        },
        ("POST", "/api/attempts/{attempt_id}/override"): {
            "qid": world["qid"],
            "score": 0,
        },
        ("POST", "/api/materials/{material_id}/ask"): {"question": "ab"},
    }
    return bodies.get((method, path))


def _call(client, method: str, path: str, world: dict, role: str):
    headers = _headers_for(client, role)
    url = _fill_path(method, path, world)
    kwargs: dict = {}
    if headers is not None:
        kwargs["headers"] = headers
    body = _payload_for(method, path, world)
    if body is not None:
        kwargs["json"] = body
    return client.request(method, url, **kwargs)


@pytest.mark.api
@pytest.mark.security
def test_allowed_roles_map_covers_every_openapi_route():
    missing = [
        f"{m} {p}" for m, p in _openapi_api_routes() if (m, p) not in ALLOWED_ROLES
    ]
    assert not missing, "OpenAPI routes missing from ALLOWED_ROLES:\n" + "\n".join(missing)

    openapi_set = set(_openapi_api_routes())
    extra = [f"{m} {p}" for m, p in ALLOWED_ROLES if (m, p) not in openapi_set]
    assert not extra, "ALLOWED_ROLES entries not in OpenAPI:\n" + "\n".join(extra)


@pytest.mark.api
@pytest.mark.security
def test_rbac_matrix_for_all_routes(client):
    world = _build_world(client)
    failures: list[str] = []

    for method, path in sorted(_openapi_api_routes()):
        allowed = ALLOWED_ROLES[(method, path)]
        for role in ROLES:
            resp = _call(client, method, path, world, role)
            status = resp.status_code

            if role == "anonymous":
                if (method, path) in PUBLIC_ROUTES:
                    if status in (401, 403):
                        failures.append(
                            f"{method} {path} as anonymous (public): got {status}"
                        )
                elif status != 401:
                    failures.append(
                        f"{method} {path} as anonymous: expected 401, got {status}"
                    )
                continue

            if role in allowed:
                if status in (401, 403):
                    failures.append(
                        f"{method} {path} as {role} (allowed): "
                        f"got {status} {resp.text[:160]}"
                    )
            else:
                # 404 accepted where services hide existence (documented in inventory).
                if status not in (403, 404):
                    failures.append(
                        f"{method} {path} as {role} (forbidden): "
                        f"expected 403/404, got {status} {resp.text[:120]}"
                    )

    assert not failures, "RBAC matrix failures:\n" + "\n".join(failures)
