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


ADMIN = "admin@cogni.pk"
TEACHER_A = "ayesha.khan@umt.edu.pk"  # owns CS-201-A (c1), dept CS
HOD_CS = "tariq.mehmood@umt.edu.pk"  # head of CS
HOD_SE = "samina.javed@umt.edu.pk"  # head of SE, wrong dept for c1 exams


def _class_id(client, code, email):
    classes = client.get("/api/classes", headers=_auth(client, email)).json()
    return next(c["id"] for c in classes if c["code"] == code)


def _first_material_id(client, class_id, email):
    materials = client.get(f"/api/classes/{class_id}/materials", headers=_auth(client, email)).json()
    return materials[0]["id"]


def _generate(client, email, *, class_id, material_id, kind="Midterm", counts=None, title="Lifecycle exam"):
    counts = counts or {"MCQ": 2, "Short": 1}
    return client.post(
        "/api/exams/generate",
        json={
            "class_id": class_id,
            "title": title,
            "kind": kind,
            "duration_min": 30,
            "material_ids": [material_id],
            "counts": counts,
        },
        headers=_auth(client, email),
    ).json()["exam"]


def _exam_by_title(client, class_id, email, title):
    exams = client.get(f"/api/exams?class_id={class_id}", headers=_auth(client, email)).json()
    return next(e for e in exams if e["title"] == title)


def test_full_legal_path(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    exam = _generate(client, TEACHER_A, class_id=c1_id, material_id=material_id, title="Legal path exam")
    exam_id = exam["id"]
    assert exam["status"] == "draft"

    submit_resp = client.post(f"/api/exams/{exam_id}/submit", headers=_auth(client, TEACHER_A))
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "pending"
    hod_notifs = client.get("/api/notifications", headers=_auth(client, HOD_CS)).json()
    assert any("Legal path exam" in n["text"] for n in hod_notifs["items"])

    approve_resp = client.post(
        f"/api/exams/{exam_id}/approve", json={}, headers=_auth(client, HOD_CS)
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"
    teacher_notifs = client.get("/api/notifications", headers=_auth(client, TEACHER_A)).json()
    assert any("approved" in n["text"].lower() for n in teacher_notifs["items"])

    publish_resp = client.post(f"/api/exams/{exam_id}/publish", headers=_auth(client, TEACHER_A))
    assert publish_resp.status_code == 200
    assert publish_resp.json()["status"] == "published"
    student_notifs = client.get("/api/notifications", headers=_auth(client, "hamza.ali@umt.edu.pk")).json()
    assert any("Legal path exam" in n["text"] for n in student_notifs["items"])

    close_resp = client.post(f"/api/exams/{exam_id}/close", headers=_auth(client, TEACHER_A))
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "closed"

    history = close_resp.json()["history"]
    history_texts = [h["text"] for h in history]
    assert "Sent to HOD for approval" in history_texts
    assert "Approved by HOD" in history_texts
    assert "Published to students" in history_texts
    assert "Closed to new submissions" in history_texts


def test_withdraw_then_resubmit(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    exam = _generate(client, TEACHER_A, class_id=c1_id, material_id=material_id, title="Withdraw exam")
    exam_id = exam["id"]

    client.post(f"/api/exams/{exam_id}/submit", headers=_auth(client, TEACHER_A))
    withdraw_resp = client.post(f"/api/exams/{exam_id}/withdraw", headers=_auth(client, TEACHER_A))
    assert withdraw_resp.status_code == 200
    assert withdraw_resp.json()["status"] == "draft"

    resubmit_resp = client.post(f"/api/exams/{exam_id}/submit", headers=_auth(client, TEACHER_A))
    assert resubmit_resp.status_code == 200
    assert resubmit_resp.json()["status"] == "pending"


def test_return_requires_comment_and_clears_on_resubmit(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    exam = _generate(client, TEACHER_A, class_id=c1_id, material_id=material_id, title="Return exam")
    exam_id = exam["id"]
    client.post(f"/api/exams/{exam_id}/submit", headers=_auth(client, TEACHER_A))

    empty_comment_resp = client.post(
        f"/api/exams/{exam_id}/return", json={"comment": ""}, headers=_auth(client, HOD_CS)
    )
    assert empty_comment_resp.status_code == 400

    return_resp = client.post(
        f"/api/exams/{exam_id}/return",
        json={"comment": "Add more graph questions"},
        headers=_auth(client, HOD_CS),
    )
    assert return_resp.status_code == 200
    body = return_resp.json()
    assert body["status"] == "returned"
    assert body["hod_comment"] == "Add more graph questions"

    resubmit_resp = client.post(f"/api/exams/{exam_id}/submit", headers=_auth(client, TEACHER_A))
    assert resubmit_resp.status_code == 200
    assert resubmit_resp.json()["hod_comment"] == ""


@pytest.mark.parametrize(
    "action,payload",
    [
        ("withdraw", None),
        ("approve", {}),
        ("return", {"comment": "x"}),
        ("close", None),
    ],
)
def test_illegal_transition_from_draft_is_409(client, action, payload):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    exam = _generate(client, TEACHER_A, class_id=c1_id, material_id=material_id, title="Draft exam")
    exam_id = exam["id"]

    email = HOD_CS if action in ("approve", "return") else TEACHER_A
    kwargs = {"json": payload} if payload is not None else {}
    resp = client.post(f"/api/exams/{exam_id}/{action}", headers=_auth(client, email), **kwargs)
    assert resp.status_code == 409


def test_illegal_publish_while_pending_is_409(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    exam = _generate(client, TEACHER_A, class_id=c1_id, material_id=material_id, title="Pending exam")
    exam_id = exam["id"]
    client.post(f"/api/exams/{exam_id}/submit", headers=_auth(client, TEACHER_A))

    resp = client.post(f"/api/exams/{exam_id}/publish", headers=_auth(client, TEACHER_A))
    assert resp.status_code == 409


def test_illegal_submit_on_published_exam_is_409(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    published = next(e for e in exams if e["status"] == "published")
    resp = client.post(f"/api/exams/{published['id']}/submit", headers=_auth(client, TEACHER_A))
    assert resp.status_code == 409


def test_quiz_skips_approval_under_major(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    # seeded settings.approval == "major", which exempts quizzes
    exam = _generate(
        client, TEACHER_A, class_id=c1_id, material_id=material_id, kind="Quiz", title="Direct quiz"
    )
    publish_resp = client.post(f"/api/exams/{exam['id']}/publish", headers=_auth(client, TEACHER_A))
    assert publish_resp.status_code == 200
    assert publish_resp.json()["status"] == "published"


def test_quiz_needs_approval_under_all(client):
    settings_resp = client.put(
        "/api/admin/settings",
        json={"approval": "all", "max_upload_mb": 25, "ai_threshold_default": 70},
        headers=_auth(client, ADMIN),
    )
    assert settings_resp.status_code == 200

    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    exam = _generate(
        client, TEACHER_A, class_id=c1_id, material_id=material_id, kind="Quiz", title="Gated quiz"
    )
    publish_resp = client.post(f"/api/exams/{exam['id']}/publish", headers=_auth(client, TEACHER_A))
    assert publish_resp.status_code == 400


def test_hod_of_another_department_gets_403(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    pending = next(e for e in exams if e["status"] == "pending")  # seeded e3

    approve_resp = client.post(
        f"/api/exams/{pending['id']}/approve", json={}, headers=_auth(client, HOD_SE)
    )
    assert approve_resp.status_code == 403

    return_resp = client.post(
        f"/api/exams/{pending['id']}/return", json={"comment": "x"}, headers=_auth(client, HOD_SE)
    )
    assert return_resp.status_code == 403


def test_checks_report_math_on_seeded_exam(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    e3 = next(e for e in exams if e["title"] == "Data Structures Midterm")

    resp = client.get(f"/api/exams/{e3['id']}/checks", headers=_auth(client, HOD_CS))
    assert resp.status_code == 200
    checks = resp.json()

    by_text_prefix = {c["text"]: c for c in checks}
    assert by_text_prefix["CLO-1 covered by 3 questions"]["ok"] is True
    assert by_text_prefix["CLO-2 covered by 3 questions"]["ok"] is True
    assert by_text_prefix["CLO-3 covered by 3 questions"]["ok"] is True
    assert by_text_prefix["CLO-4 covered by 2 questions"]["ok"] is True

    higher_order = next(c for c in checks if c["text"].startswith("Higher-order"))
    assert higher_order["text"] == "Higher-order questions (Analyze and above): 36%"
    assert higher_order["ok"] is True

    repeats = next(c for c in checks if c["text"].startswith("Questions repeated"))
    assert repeats["text"] == "Questions repeated from earlier papers in this class: 11"
    assert repeats["ok"] is False  # 11 > max_repeats (2)

    missing_model = next(c for c in checks if "model answer" in c["text"])
    assert missing_model["ok"] is True
    assert missing_model["text"] == "Every written question has an approved model answer"

    totals = next(c for c in checks if "marks" in c["text"])
    assert totals["text"] == "11 questions · 47 marks · 60 minutes"
    assert totals["ok"] is True


def test_hod_approvals_lists_pending_first(client):
    resp = client.get("/api/hod/approvals", headers=_auth(client, HOD_CS))
    assert resp.status_code == 200
    papers = resp.json()
    assert papers  # seeded pending/approved papers exist for CS dept
    assert all(p["status"] != "draft" for p in papers)
    statuses = [p["status"] for p in papers]
    first_non_pending = next((i for i, s in enumerate(statuses) if s != "pending"), len(statuses))
    assert all(s == "pending" for s in statuses[:first_non_pending])
