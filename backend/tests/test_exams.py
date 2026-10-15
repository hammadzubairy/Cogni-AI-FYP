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


ADMIN = "admin@cogni.pk"
TEACHER_A = "ayesha.khan@umt.edu.pk"  # owns CS-201-A (c1), CS-305-B (c2)
TEACHER_B = "faisal.aziz@umt.edu.pk"  # owns CS-310-A (c3)
STUDENT_IN_C1 = "hamza.ali@umt.edu.pk"
HOD_CS = "tariq.mehmood@umt.edu.pk"


def _class_id(client, code, email):
    classes = client.get("/api/classes", headers=_auth(client, email)).json()
    return next(c["id"] for c in classes if c["code"] == code)


def _first_material_id(client, class_id, email):
    materials = client.get(f"/api/classes/{class_id}/materials", headers=_auth(client, email)).json()
    return materials[0]["id"]


def _generate(client, email, *, class_id, material_id, counts, title="Generated exam", **extra):
    return client.post(
        "/api/exams/generate",
        json={
            "class_id": class_id,
            "title": title,
            "kind": "Quiz",
            "duration_min": 30,
            "material_ids": [material_id],
            "counts": counts,
            **extra,
        },
        headers=_auth(client, email),
    )


def test_generate_honours_counts_and_valid_mcqs(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)

    resp = _generate(
        client, TEACHER_A, class_id=c1_id, material_id=material_id,
        counts={"MCQ": 3, "Short": 2, "Essay": 1},
    )
    assert resp.status_code == 201
    body = resp.json()
    exam = body["exam"]
    questions = exam["questions"]
    by_type = {"MCQ": 0, "Short": 0, "Essay": 0}
    for q in questions:
        by_type[q["type"]] += 1
        if q["type"] == "MCQ":
            assert len(q["options"]) == 4
            assert len(set(q["options"])) == 4
            assert 0 <= q["answer_index"] < 4
            assert q["marks"] == 2
        else:
            assert q["model_answer"]
            assert len(q["keywords"]) >= 2
            assert q["marks"] == (5 if q["type"] == "Short" else 10)
        assert q["qid"]
    assert by_type == {"MCQ": 3, "Short": 2, "Essay": 1}
    assert exam["status"] == "draft"
    assert "Draft generated from" in exam["history"][0]["text"]


def test_generate_dedupes_and_warns_on_shortfall(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)

    # material has 6 chunks; asking for far more MCQs than chunks forces the
    # mock generator to cycle back to an earlier chunk and produce a
    # near-duplicate, which must be deduplicated rather than returned twice.
    resp = _generate(
        client, TEACHER_A, class_id=c1_id, material_id=material_id, counts={"MCQ": 10}
    )
    assert resp.status_code == 201
    body = resp.json()
    mcqs = body["exam"]["questions"]
    texts = [q["text"] for q in mcqs]
    assert len(texts) == len(set(texts))  # no duplicates survived
    assert len(mcqs) < 10
    assert any("Only generated" in w for w in body["warnings"])


def test_hard_cap_at_40_questions(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    resp = _generate(
        client, TEACHER_A, class_id=c1_id, material_id=material_id,
        counts={"MCQ": 20, "Short": 15, "Essay": 10},
    )
    assert resp.status_code == 400


def test_student_never_receives_answers(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    list_resp = client.get(
        f"/api/exams?class_id={c1_id}", headers=_auth(client, STUDENT_IN_C1)
    )
    assert list_resp.status_code == 200
    exams = list_resp.json()
    assert exams  # seeded published exams exist for c1
    for exam in exams:
        assert exam["status"] == "published"
        for q in exam["questions"]:
            assert "answer_index" not in q
            assert "model_answer" not in q
            assert "keywords" not in q

    detail_resp = client.get(
        f"/api/exams/{exams[0]['id']}", headers=_auth(client, STUDENT_IN_C1)
    )
    assert detail_resp.status_code == 200
    for q in detail_resp.json()["questions"]:
        assert "answer_index" not in q
        assert "model_answer" not in q


def test_student_cannot_see_draft_exam(client):
    c3_id = _class_id(client, "CS-310-A", TEACHER_B)
    exams = client.get(f"/api/exams?class_id={c3_id}", headers=_auth(client, TEACHER_B)).json()
    draft = next(e for e in exams if e["status"] == "draft")
    resp = client.get(
        f"/api/exams/{draft['id']}", headers=_auth(client, "hamza.ali@umt.edu.pk")
    )
    assert resp.status_code in (403, 404)


def test_teacher_cannot_edit_another_teachers_exam(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    draft = next(e for e in exams if e["status"] == "draft") if any(
        e["status"] == "draft" for e in exams
    ) else exams[0]
    resp = client.patch(
        f"/api/exams/{draft['id']}", json={"title": "Hijacked"}, headers=_auth(client, TEACHER_B)
    )
    assert resp.status_code == 403


def test_cannot_edit_published_exam(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    published = next(e for e in exams if e["status"] == "published")
    resp = client.patch(
        f"/api/exams/{published['id']}",
        json={"title": "New title"},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 400


def test_edit_regenerate_and_delete_question_lifecycle(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = _first_material_id(client, c1_id, TEACHER_A)
    exam = _generate(
        client, TEACHER_A, class_id=c1_id, material_id=material_id, counts={"MCQ": 1, "Short": 1}
    ).json()["exam"]
    exam_id = exam["id"]
    short_q = next(q for q in exam["questions"] if q["type"] == "Short")

    patch_resp = client.patch(
        f"/api/exams/{exam_id}/questions/{short_q['qid']}",
        json={"text": "Edited question text"},
        headers=_auth(client, TEACHER_A),
    )
    assert patch_resp.status_code == 200
    edited = next(q for q in patch_resp.json()["questions"] if q["qid"] == short_q["qid"])
    assert edited["text"] == "Edited question text"

    add_resp = client.post(
        f"/api/exams/{exam_id}/questions", json={"type": "Essay"}, headers=_auth(client, TEACHER_A)
    )
    assert add_resp.status_code == 201
    assert len(add_resp.json()["exam"]["questions"]) == 3

    regen_resp = client.post(
        f"/api/exams/{exam_id}/questions/{short_q['qid']}/regenerate",
        headers=_auth(client, TEACHER_A),
    )
    assert regen_resp.status_code == 200
    qids_after_regen = {q["qid"] for q in regen_resp.json()["questions"]}
    assert short_q["qid"] not in qids_after_regen

    mcq_q = next(q for q in exam["questions"] if q["type"] == "MCQ")
    delete_resp = client.delete(
        f"/api/exams/{exam_id}/questions/{mcq_q['qid']}", headers=_auth(client, TEACHER_A)
    )
    assert delete_resp.status_code == 200
    remaining = delete_resp.json()["questions"]
    assert all(q["qid"] != mcq_q["qid"] for q in remaining)

    # cannot delete the last question
    for q in remaining[:-1]:
        client.delete(f"/api/exams/{exam_id}/questions/{q['qid']}", headers=_auth(client, TEACHER_A))
    last = client.get(f"/api/exams/{exam_id}", headers=_auth(client, TEACHER_A)).json()["questions"]
    assert len(last) == 1
    last_delete_resp = client.delete(
        f"/api/exams/{exam_id}/questions/{last[0]['qid']}", headers=_auth(client, TEACHER_A)
    )
    assert last_delete_resp.status_code == 400


def test_request_linking_and_delete_reopens_request(client):
    c3_id = _class_id(client, "CS-310-A", TEACHER_B)
    material_id = _first_material_id(client, c3_id, TEACHER_B)
    requests_ = client.get("/api/requests", headers=_auth(client, TEACHER_B)).json()
    open_request = next(r for r in requests_ if r["status"] == "open")

    resp = _generate(
        client, TEACHER_B, class_id=c3_id, material_id=material_id, counts={"MCQ": 2},
        request_id=open_request["id"],
    )
    assert resp.status_code == 201
    exam = resp.json()["exam"]
    assert exam["request_id"] == open_request["id"]

    updated_request = next(
        r for r in client.get("/api/requests", headers=_auth(client, TEACHER_B)).json()
        if r["id"] == open_request["id"]
    )
    assert updated_request["exam_id"] == exam["id"]

    delete_resp = client.delete(f"/api/exams/{exam['id']}", headers=_auth(client, TEACHER_B))
    assert delete_resp.status_code == 204

    reopened = next(
        r for r in client.get("/api/requests", headers=_auth(client, TEACHER_B)).json()
        if r["id"] == open_request["id"]
    )
    assert reopened["status"] == "open"
    assert reopened["exam_id"] is None


def test_cannot_delete_published_exam(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    published = next(e for e in exams if e["status"] == "published")
    resp = client.delete(f"/api/exams/{published['id']}", headers=_auth(client, TEACHER_A))
    assert resp.status_code == 400


def test_hod_sees_dept_exams_admin_sees_all(client):
    hod_resp = client.get("/api/exams", headers=_auth(client, HOD_CS))
    assert hod_resp.status_code == 200
    assert hod_resp.json()

    admin_resp = client.get("/api/exams", headers=_auth(client, ADMIN))
    assert admin_resp.status_code == 200
    assert len(admin_resp.json()) >= len(hod_resp.json())
