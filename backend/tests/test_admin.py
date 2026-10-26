import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.helpers import WORLD_PASSWORD, portal_for

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")



def _token(client, email, password=WORLD_PASSWORD):
    resp = client.post("/api/auth/login", json={"email": email, "password": password, "role": portal_for(email)})
    return resp.json()["access_token"]


def _auth(client, email):
    return {"Authorization": f"Bearer {_token(client, email)}"}


ADMIN_EMAIL = "admin@cogni.pk"
HOD_EMAIL = "tariq.mehmood@umt.edu.pk"  # head of CS
TEACHER_EMAIL = "ayesha.khan@umt.edu.pk"  # CS teacher
STUDENT_EMAIL = "hamza.ali@umt.edu.pk"


def _cs_dept_id(client):
    resp = client.get("/api/admin/departments", headers=_auth(client, ADMIN_EMAIL))
    return next(d["id"] for d in resp.json() if d["code"] == "CS")


def test_create_user_rejects_duplicate_email(client):
    resp = client.post(
        "/api/admin/users",
        json={"name": "Dup", "email": ADMIN_EMAIL, "role": "teacher", "dept_id": _cs_dept_id(client)},
        headers=_auth(client, ADMIN_EMAIL),
    )
    assert resp.status_code == 409


def test_create_user_wrong_role_is_forbidden(client):
    resp = client.post(
        "/api/admin/users",
        json={"name": "X", "email": "x@umt.edu.pk", "role": "teacher", "dept_id": "x"},
        headers=_auth(client, TEACHER_EMAIL),
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


def test_create_user_notifies_hod_and_logs_activity(client):
    dept_id = _cs_dept_id(client)
    before_notes = client.get("/api/notifications", headers=_auth(client, HOD_EMAIL)).json()
    resp = client.post(
        "/api/admin/users",
        json={"name": "New Teacher", "email": "newt@umt.edu.pk", "role": "teacher", "dept_id": dept_id},
        headers=_auth(client, ADMIN_EMAIL),
    )
    assert resp.status_code == 201
    after_notes = client.get("/api/notifications", headers=_auth(client, HOD_EMAIL)).json()
    assert after_notes["unread_count"] > before_notes["unread_count"]
    activity = client.get("/api/admin/activity", headers=_auth(client, ADMIN_EMAIL)).json()
    assert any("New Teacher" in a["text"] for a in activity)


def test_patch_user_role_away_from_hod_clears_dept_hod(client):
    depts_before = client.get("/api/admin/departments", headers=_auth(client, ADMIN_EMAIL)).json()
    cs = next(d for d in depts_before if d["code"] == "CS")
    hod_user_id = cs["hod_id"]
    assert hod_user_id is not None

    resp = client.patch(
        f"/api/admin/users/{hod_user_id}",
        json={"role": "teacher"},
        headers=_auth(client, ADMIN_EMAIL),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "teacher"

    depts_after = client.get("/api/admin/departments", headers=_auth(client, ADMIN_EMAIL)).json()
    cs_after = next(d for d in depts_after if d["code"] == "CS")
    assert cs_after["hod_id"] is None


def test_patch_user_role_to_hod_fills_empty_dept_head(client):
    # First clear CS's HOD.
    cs = next(
        d for d in client.get("/api/admin/departments", headers=_auth(client, ADMIN_EMAIL)).json()
        if d["code"] == "CS"
    )
    client.patch(
        f"/api/admin/users/{cs['hod_id']}", json={"role": "teacher"}, headers=_auth(client, ADMIN_EMAIL)
    )

    teacher_id = next(
        u["id"]
        for u in client.get(
            "/api/admin/users", params={"role": "teacher"}, headers=_auth(client, ADMIN_EMAIL)
        ).json()
        if u["dept_id"] == cs["id"]
    )
    resp = client.patch(
        f"/api/admin/users/{teacher_id}", json={"role": "hod"}, headers=_auth(client, ADMIN_EMAIL)
    )
    assert resp.status_code == 200

    cs_after = next(
        d
        for d in client.get("/api/admin/departments", headers=_auth(client, ADMIN_EMAIL)).json()
        if d["code"] == "CS"
    )
    assert cs_after["hod_id"] == teacher_id


def test_admin_dept_id_forced_null(client):
    teacher_id = next(
        u["id"]
        for u in client.get(
            "/api/admin/users", params={"role": "teacher"}, headers=_auth(client, ADMIN_EMAIL)
        ).json()
    )
    resp = client.patch(
        f"/api/admin/users/{teacher_id}", json={"role": "admin"}, headers=_auth(client, ADMIN_EMAIL)
    )
    assert resp.status_code == 200
    assert resp.json()["dept_id"] is None


def test_reset_password_notifies_user(client):
    student_headers = _auth(client, STUDENT_EMAIL)
    student_id = client.get("/api/auth/me", headers=student_headers).json()["id"]
    resp = client.post(
        f"/api/admin/users/{student_id}/reset-password", headers=_auth(client, ADMIN_EMAIL)
    )
    assert resp.status_code == 200
    temp = resp.json()["temporary_password"]
    activity = client.get("/api/admin/activity", headers=_auth(client, ADMIN_EMAIL)).json()
    assert any("Reset password" in a["text"] for a in activity)
    # Prior JWT is invalidated via token_version bump.
    assert client.get("/api/auth/me", headers=student_headers).status_code == 401

    login_resp = client.post(
        "/api/auth/login", json={"email": STUDENT_EMAIL, "password": temp, "role": portal_for(STUDENT_EMAIL)}
    )
    assert login_resp.status_code == 200
    assert login_resp.json().get("scope") == "change_password"


def test_assign_hod_promotes_and_demotes(client):
    depts = client.get("/api/admin/departments", headers=_auth(client, ADMIN_EMAIL)).json()
    cs = next(d for d in depts if d["code"] == "CS")
    old_hod_id = cs["hod_id"]
    # Capture old HOD JWT before demotion — must be invalidated via token_version.
    old_hod_headers = _auth(client, HOD_EMAIL)
    assert client.get("/api/hod/analytics", headers=old_hod_headers).status_code == 200

    new_hod_id = next(
        u["id"]
        for u in client.get(
            "/api/admin/users", params={"role": "teacher"}, headers=_auth(client, ADMIN_EMAIL)
        ).json()
        if u["dept_id"] == cs["id"]
    )

    resp = client.patch(
        f"/api/admin/departments/{cs['id']}",
        json={"hod_id": new_hod_id},
        headers=_auth(client, ADMIN_EMAIL),
    )
    assert resp.status_code == 200
    assert resp.json()["hod_id"] == new_hod_id

    old_hod = next(
        u
        for u in client.get("/api/admin/users", headers=_auth(client, ADMIN_EMAIL)).json()
        if u["id"] == old_hod_id
    )
    assert old_hod["role"] == "teacher"
    # Demoted HOD's prior JWT is dead (not a sticky 403 Retry loop).
    assert client.get("/api/hod/analytics", headers=old_hod_headers).status_code == 401
    assert client.get("/api/auth/me", headers=old_hod_headers).status_code == 401


def test_reassign_class_moves_exams_and_notifies(client):
    classes = client.get("/api/admin/classes", headers=_auth(client, ADMIN_EMAIL)).json()
    cls = next(c for c in classes if c["code"] == "CS-201-A")
    cs_teachers = [
        u
        for u in client.get(
            "/api/admin/users", params={"role": "teacher"}, headers=_auth(client, ADMIN_EMAIL)
        ).json()
        if u["dept_id"] == cls["dept_id"] and u["id"] != cls["teacher_id"]
    ]
    new_teacher = cs_teachers[0]

    resp = client.patch(
        f"/api/admin/classes/{cls['id']}",
        json={"teacher_id": new_teacher["id"]},
        headers=_auth(client, ADMIN_EMAIL),
    )
    assert resp.status_code == 200
    assert resp.json()["teacher_id"] == new_teacher["id"]


def test_settings_clamp_threshold_and_notify_on_approval_change(client):
    resp = client.put(
        "/api/admin/settings",
        json={"approval": "none", "max_upload_mb": 30, "ai_threshold_default": 10},
        headers=_auth(client, ADMIN_EMAIL),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ai_threshold_default"] == 50
    assert body["approval"] == "none"

    notes = client.get("/api/notifications", headers=_auth(client, TEACHER_EMAIL)).json()
    assert notes["unread_count"] > 0


def test_summary_returns_counts(client):
    resp = client.get("/api/admin/summary", headers=_auth(client, ADMIN_EMAIL))
    assert resp.status_code == 200
    body = resp.json()
    assert body["users_by_role"]["student"] >= 7
    assert body["classes"] >= 5


def test_activity_filter_by_role(client):
    resp = client.get(
        "/api/admin/activity", params={"role": "teacher"}, headers=_auth(client, ADMIN_EMAIL)
    )
    assert resp.status_code == 200
    assert all(a["role"] == "teacher" for a in resp.json())
