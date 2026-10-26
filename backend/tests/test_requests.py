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


HOD_CS = "tariq.mehmood@umt.edu.pk"  # head of CS
HOD_SE = "samina.javed@umt.edu.pk"  # head of SE
TEACHER_CS = "ayesha.khan@umt.edu.pk"  # owns CS-201-A, CS-305-B (CS dept)


def _cs_class_id(client):
    classes = client.get("/api/classes", headers=_auth(client, TEACHER_CS)).json()
    return next(c["id"] for c in classes if c["code"] == "CS-201-A")


def test_hod_requesting_class_outside_their_dept_is_400(client):
    class_id = _cs_class_id(client)
    teacher_id = client.get("/api/auth/me", headers=_auth(client, TEACHER_CS)).json()["id"]
    resp = client.post(
        "/api/requests",
        json={
            "teacher_id": teacher_id,
            "class_id": class_id,
            "kind": "Quiz",
            "due": "2026-11-01T00:00:00Z",
            "note": "Cover CLO-1 and CLO-2",
        },
        headers=_auth(client, HOD_SE),  # wrong department
    )
    assert resp.status_code == 400


def test_hod_creates_valid_request_and_notifies_teacher(client):
    class_id = _cs_class_id(client)
    teacher_id = client.get("/api/auth/me", headers=_auth(client, TEACHER_CS)).json()["id"]
    before = client.get("/api/notifications", headers=_auth(client, TEACHER_CS)).json()

    resp = client.post(
        "/api/requests",
        json={
            "teacher_id": teacher_id,
            "class_id": class_id,
            "kind": "Quiz",
            "due": "2026-11-01T00:00:00Z",
            "note": "Cover CLO-1 and CLO-2",
        },
        headers=_auth(client, HOD_CS),
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "open"

    after = client.get("/api/notifications", headers=_auth(client, TEACHER_CS)).json()
    assert after["unread_count"] > before["unread_count"]


def test_teacher_sees_only_their_own_requests(client):
    resp = client.get("/api/requests", headers=_auth(client, TEACHER_CS))
    assert resp.status_code == 200
    teacher_id = client.get("/api/auth/me", headers=_auth(client, TEACHER_CS)).json()["id"]
    assert all(r["teacher_id"] == teacher_id for r in resp.json())


def test_hod_sees_only_their_own_requests(client):
    resp = client.get("/api/requests", headers=_auth(client, HOD_CS))
    assert resp.status_code == 200
    hod_id = client.get("/api/auth/me", headers=_auth(client, HOD_CS)).json()["id"]
    assert all(r["hod_id"] == hod_id for r in resp.json())


def test_student_cannot_view_requests(client):
    resp = client.get("/api/requests", headers=_auth(client, "hamza.ali@umt.edu.pk"))
    assert resp.status_code == 403


def test_hod_policy_get_and_update_notifies_dept_teachers(client):
    before = client.get("/api/notifications", headers=_auth(client, TEACHER_CS)).json()

    get_resp = client.get("/api/hod/policy", headers=_auth(client, HOD_CS))
    assert get_resp.status_code == 200

    put_resp = client.put(
        "/api/hod/policy",
        json={"min_clo": 3, "higher_order_pct": 30, "max_repeats": 1},
        headers=_auth(client, HOD_CS),
    )
    assert put_resp.status_code == 200
    assert put_resp.json()["min_clo"] == 3

    after = client.get("/api/notifications", headers=_auth(client, TEACHER_CS)).json()
    assert after["unread_count"] > before["unread_count"]
