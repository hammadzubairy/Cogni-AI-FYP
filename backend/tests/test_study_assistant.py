import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.helpers import WORLD_PASSWORD

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")




def _auth(client, email, password=WORLD_PASSWORD):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


TEACHER_CS = "ayesha.khan@umt.edu.pk"
STUDENT_IN_C1 = "hamza.ali@umt.edu.pk"  # enrolled in CS-201-A, not SE-220-A


def _material_id(client, class_code, email):
    classes = client.get("/api/classes", headers=_auth(client, email)).json()
    class_id = next(c["id"] for c in classes if c["code"] == class_code)
    materials = client.get(f"/api/classes/{class_id}/materials", headers=_auth(client, email)).json()
    return materials[0]["id"]


def test_student_gets_answer_from_top_matching_chunk(client):
    material_id = _material_id(client, "CS-201-A", TEACHER_CS)
    resp = client.post(
        f"/api/materials/{material_id}/ask",
        json={"question": "What happens when two keys collide in a hash table?"},
        headers=_auth(client, STUDENT_IN_C1),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["answer"]
    assert 1 <= len(body["sources"]) <= 3
    assert all("page" in s and "heading" in s for s in body["sources"])


def test_question_too_short_is_400(client):
    material_id = _material_id(client, "CS-201-A", TEACHER_CS)
    resp = client.post(
        f"/api/materials/{material_id}/ask",
        json={"question": "?"},
        headers=_auth(client, STUDENT_IN_C1),
    )
    assert resp.status_code == 400


def test_non_enrolled_student_is_forbidden(client):
    material_id = _material_id(client, "SE-220-A", "nida.shah@umt.edu.pk")
    resp = client.post(
        f"/api/materials/{material_id}/ask",
        json={"question": "What is a functional requirement?"},
        headers=_auth(client, STUDENT_IN_C1),
    )
    assert resp.status_code == 403


def test_teacher_cannot_ask(client):
    material_id = _material_id(client, "CS-201-A", TEACHER_CS)
    resp = client.post(
        f"/api/materials/{material_id}/ask",
        json={"question": "What is a hash collision?"},
        headers=_auth(client, TEACHER_CS),
    )
    assert resp.status_code == 403
