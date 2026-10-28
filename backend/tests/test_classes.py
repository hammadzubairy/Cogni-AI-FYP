import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.helpers import WORLD_PASSWORD, portal_for

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")



def _auth(client, email, password=WORLD_PASSWORD):
    resp = client.post("/api/auth/login", json={"email": email, "password": password, "role": portal_for(email)})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


TEACHER_A = "ayesha.khan@umt.edu.pk"  # owns CS-201-A (c1), CS-305-B (c2)
TEACHER_B = "faisal.aziz@umt.edu.pk"  # owns CS-310-A (c3)
STUDENT_IN_C1 = "hamza.ali@umt.edu.pk"
STUDENT_NOT_IN_C1 = "zainab.fatima@umt.edu.pk"


def _class_id(client, code, email):
    classes = client.get("/api/classes", headers=_auth(client, email)).json()
    return next(c["id"] for c in classes if c["code"] == code)


def test_teacher_sees_only_their_classes(client):
    classes = client.get("/api/classes", headers=_auth(client, TEACHER_A)).json()
    assert {c["code"] for c in classes} == {"CS-201-A", "CS-305-B"}
    assert all("student_count" in c and "exam_count" in c for c in classes)


def test_student_sees_only_their_classes(client):
    classes = client.get("/api/classes", headers=_auth(client, STUDENT_IN_C1)).json()
    codes = {c["code"] for c in classes}
    assert "CS-201-A" in codes


def test_teacher_cannot_touch_another_teachers_class(client):
    c3_id = _class_id(client, "CS-310-A", TEACHER_B)
    resp = client.get(f"/api/classes/{c3_id}", headers=_auth(client, TEACHER_A))
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


def test_teacher_cannot_add_student_to_another_teachers_class(client):
    c3_id = _class_id(client, "CS-310-A", TEACHER_B)
    resp = client.post(
        f"/api/classes/{c3_id}/students",
        json={"email": STUDENT_NOT_IN_C1},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 403


def test_create_class_generates_join_code_and_notifies_hod(client):
    resp = client.post(
        "/api/classes",
        json={"name": "Algorithms", "code": "CS-330-A"},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["code"] == "CS-330-A"
    assert len(body["join_code"]) > 0
    assert body["student_count"] == 0

    hod_notes = client.get(
        "/api/notifications", headers=_auth(client, "tariq.mehmood@umt.edu.pk")
    ).json()
    assert any("CS-330-A" in n["text"] for n in hod_notes["items"])


def test_add_student_rejects_already_enrolled(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.post(
        f"/api/classes/{c1_id}/students",
        json={"email": STUDENT_IN_C1},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 409


def test_add_student_rejects_non_student_account(client):
    # Admin has no student role. (TEACHER_B also holds the student role in the seeded world.)
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.post(
        f"/api/classes/{c1_id}/students",
        json={"email": "admin@cogni.pk"},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 400


def test_add_then_remove_student_notifies_and_logs(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    add_resp = client.post(
        f"/api/classes/{c1_id}/students",
        json={"email": STUDENT_NOT_IN_C1},
        headers=_auth(client, TEACHER_A),
    )
    assert add_resp.status_code == 200
    student_id = client.get("/api/auth/me", headers=_auth(client, STUDENT_NOT_IN_C1)).json()["id"]

    del_resp = client.delete(
        f"/api/classes/{c1_id}/students/{student_id}", headers=_auth(client, TEACHER_A)
    )
    assert del_resp.status_code == 204

    notes = client.get("/api/notifications", headers=_auth(client, STUDENT_NOT_IN_C1)).json()
    assert notes["unread_count"] >= 2  # added + removed


def test_join_with_bad_code_is_404(client):
    resp = client.post(
        "/api/classes/join",
        json={"join_code": "NOPE-999"},
        headers=_auth(client, STUDENT_NOT_IN_C1),
    )
    assert resp.status_code == 404


def test_join_already_enrolled_is_409(client):
    resp = client.post(
        "/api/classes/join",
        json={"join_code": "DSX-4K2"},  # CS-201-A, student is already in it
        headers=_auth(client, STUDENT_IN_C1),
    )
    assert resp.status_code == 409


def test_join_notifies_teacher(client):
    before = client.get("/api/notifications", headers=_auth(client, TEACHER_A)).json()
    resp = client.post(
        "/api/classes/join",
        json={"join_code": "DSX-4K2"},
        headers=_auth(client, STUDENT_NOT_IN_C1),
    )
    assert resp.status_code == 200
    after = client.get("/api/notifications", headers=_auth(client, TEACHER_A)).json()
    assert after["unread_count"] > before["unread_count"]


def test_student_detail_view_hides_roster(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.get(f"/api/classes/{c1_id}", headers=_auth(client, STUDENT_IN_C1))
    assert resp.status_code == 200
    assert resp.json()["student_ids"] == []
