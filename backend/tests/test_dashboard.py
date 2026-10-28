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


TEACHER_CS = "ayesha.khan@umt.edu.pk"  # owns CS-201-A (e1,e2,e3) and CS-305-B (e4)
HOD_CS = "tariq.mehmood@umt.edu.pk"  # heads CS
STUDENT_S1 = "hamza.ali@umt.edu.pk"  # enrolled in CS-201-A, CS-305-B, CS-310-A


def test_teacher_dashboard_shows_pending_and_live_exams(client):
    resp = client.get("/api/dashboard/teacher", headers=_auth(client, TEACHER_CS))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["classes"]) == 2  # CS-201-A, CS-305-B
    assert body["stats"]["live_exams"] == 3  # e1, e2, e4
    assert body["stats"]["waiting_on_hod"] == 1  # e3 pending
    assert {e["title"] for e in body["live_exams"]} == {
        "Quiz 2: Hashing & Trees",
        "Quiz 3: Graphs & Queues",
        "SQL Joins Quiz",
    }
    assert body["draft_exams"] == []
    assert isinstance(body["undecided_flags"], int)
    assert body["undecided_flags"] >= 0


def test_teacher_dashboard_forbidden_for_student(client):
    resp = client.get("/api/dashboard/teacher", headers=_auth(client, STUDENT_S1))
    assert resp.status_code == 403


def test_student_dashboard_hides_already_submitted_exam(client):
    resp = client.get("/api/dashboard/student", headers=_auth(client, STUDENT_S1))
    assert resp.status_code == 200
    body = resp.json()
    live_titles = {e["title"] for e in body["live_exams"]}
    assert "Quiz 2: Hashing & Trees" not in live_titles  # s1 already submitted e1
    assert "Quiz 3: Graphs & Queues" in live_titles  # s1 never attempted e2
    released_titles = {r["exam_title"] for r in body["released_results"]}
    assert "Quiz 2: Hashing & Trees" in released_titles  # e1 is released


def test_hod_dashboard_lists_pending_approvals_in_their_dept_only(client):
    resp = client.get("/api/dashboard/hod", headers=_auth(client, HOD_CS))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["pending_approvals"]) == 1
    assert body["pending_approvals"][0]["title"] == "Data Structures Midterm"
    assert body["stats"]["pending_approvals"] == 1
    assert body["stats"]["open_requests"] == 1  # r2


def test_hod_analytics_covers_every_class_in_department(client):
    resp = client.get("/api/hod/analytics", headers=_auth(client, HOD_CS))
    assert resp.status_code == 200
    body = resp.json()
    assert {row["class_code"] for row in body["by_class"]} == {
        "CS-201-A",
        "CS-305-B",
        "CS-310-A",
    }
    teacher_names = {row["teacher_name"] for row in body["teacher_activity"]}
    # The HOD also holds the teacher role in the seeded world.
    assert teacher_names == {"Dr. Ayesha Khan", "Mr. Faisal Aziz", "Prof. Tariq Mehmood"}


def test_hod_analytics_forbidden_for_teacher(client):
    resp = client.get("/api/hod/analytics", headers=_auth(client, TEACHER_CS))
    assert resp.status_code == 403
