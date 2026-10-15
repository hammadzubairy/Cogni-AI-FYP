"""IDOR / cross-tenant access checks across teachers, HODs, and students."""

from __future__ import annotations

import pytest

from tests.helpers import (
    class_id_by_code,
    first_material_id,
    login_as,
    make_exam_draft,
)

TEACHER_A = "ayesha.khan@umt.edu.pk"  # CS-201-A
TEACHER_B = "faisal.aziz@umt.edu.pk"  # CS-310-A
HOD_CS = "tariq.mehmood@umt.edu.pk"
HOD_SE = "samina.javed@umt.edu.pk"
STUDENT_A = "hamza.ali@umt.edu.pk"  # in CS-201-A
STUDENT_B = "sana.iqbal@umt.edu.pk"  # in CS-201-A, separate attempts
STUDENT_OUT = "zainab.fatima@umt.edu.pk"  # DSC; not in CS-201-A


def _auth(client, email):
    return login_as(client, email)


def _publish_quiz(client, *, class_id, material_id, title):
    exam = make_exam_draft(
        client,
        class_id=class_id,
        material_ids=[material_id],
        title=title,
        kind="Quiz",
        counts={"MCQ": 1, "Short": 1},
        as_user=TEACHER_A,
    )
    pub = client.post(f"/api/exams/{exam['id']}/publish", headers=_auth(client, TEACHER_A))
    assert pub.status_code == 200
    return pub.json()


@pytest.mark.api
@pytest.mark.security
def test_teacher_cannot_touch_another_teachers_exam_class_or_material(client):
    c3_id = class_id_by_code(client, "CS-310-A", as_user=TEACHER_B)
    material_b = first_material_id(client, c3_id, as_user=TEACHER_B)
    exams_b = client.get(
        f"/api/exams?class_id={c3_id}", headers=_auth(client, TEACHER_B)
    ).json()
    other_exam = exams_b[0]
    other_id = other_exam["id"]

    # Class / material belonging to teacher B
    assert client.get(f"/api/classes/{c3_id}", headers=_auth(client, TEACHER_A)).status_code == 403
    assert (
        client.get(f"/api/materials/{material_b}", headers=_auth(client, TEACHER_A)).status_code
        == 403
    )
    assert (
        client.delete(f"/api/materials/{material_b}", headers=_auth(client, TEACHER_A)).status_code
        == 403
    )

    # Exam owned by teacher B
    assert client.get(f"/api/exams/{other_id}", headers=_auth(client, TEACHER_A)).status_code == 403
    assert (
        client.patch(
            f"/api/exams/{other_id}",
            json={"title": "Hijacked"},
            headers=_auth(client, TEACHER_A),
        ).status_code
        == 403
    )
    assert (
        client.post(f"/api/exams/{other_id}/publish", headers=_auth(client, TEACHER_A)).status_code
        == 403
    )
    assert (
        client.delete(f"/api/exams/{other_id}", headers=_auth(client, TEACHER_A)).status_code == 403
    )
    assert (
        client.get(f"/api/exams/{other_id}/results", headers=_auth(client, TEACHER_A)).status_code
        == 403
    )


@pytest.mark.api
@pytest.mark.security
def test_hod_cannot_approve_or_return_other_departments_paper(client):
    c1_id = class_id_by_code(client, "CS-201-A", as_user=TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    pending = next(e for e in exams if e["status"] == "pending")

    assert (
        client.post(
            f"/api/exams/{pending['id']}/approve",
            json={},
            headers=_auth(client, HOD_SE),
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/exams/{pending['id']}/return",
            json={"comment": "wrong dept"},
            headers=_auth(client, HOD_SE),
        ).status_code
        == 403
    )
    # Same-dept HOD is allowed (sanity).
    assert (
        client.get(f"/api/exams/{pending['id']}/checks", headers=_auth(client, HOD_CS)).status_code
        == 200
    )


@pytest.mark.api
@pytest.mark.security
def test_student_cannot_read_another_students_attempt_or_feedback(client):
    c1_id = class_id_by_code(client, "CS-201-A", as_user=TEACHER_A)
    material_id = first_material_id(client, c1_id, as_user=TEACHER_A)
    exam = _publish_quiz(
        client, class_id=c1_id, material_id=material_id, title="IDOR attempt isolation"
    )

    start = client.post(f"/api/exams/{exam['id']}/attempts", headers=_auth(client, STUDENT_A))
    assert start.status_code == 201
    attempt_id = start.json()["id"]
    client.post(f"/api/attempts/{attempt_id}/submit", headers=_auth(client, STUDENT_A))
    client.post(f"/api/exams/{exam['id']}/release", headers=_auth(client, TEACHER_A))

    assert (
        client.get(f"/api/attempts/{attempt_id}", headers=_auth(client, STUDENT_B)).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/attempts/{attempt_id}/feedback", headers=_auth(client, STUDENT_B)
        ).status_code
        == 403
    )
    # Owner can read after release.
    assert (
        client.get(
            f"/api/attempts/{attempt_id}/feedback", headers=_auth(client, STUDENT_A)
        ).status_code
        == 200
    )


@pytest.mark.api
@pytest.mark.security
def test_student_outside_class_cannot_see_cs201_exams(client):
    c1_id = class_id_by_code(client, "CS-201-A", as_user=TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    published = next(e for e in exams if e["status"] == "published")
    draft_or_pending = next(e for e in exams if e["status"] in ("draft", "pending"))

    # List is scoped — outsider should not see CS-201-A published papers.
    listed = client.get("/api/exams", headers=_auth(client, STUDENT_OUT)).json()
    assert all(e["id"] != published["id"] for e in listed)

    # Direct fetch: non-published hides as 404; published but not enrolled → 403.
    assert (
        client.get(
            f"/api/exams/{draft_or_pending['id']}", headers=_auth(client, STUDENT_OUT)
        ).status_code
        == 404
    )
    assert (
        client.get(f"/api/exams/{published['id']}", headers=_auth(client, STUDENT_OUT)).status_code
        == 403
    )


@pytest.mark.api
@pytest.mark.security
def test_student_not_in_class_cannot_start_exam(client):
    c1_id = class_id_by_code(client, "CS-201-A", as_user=TEACHER_A)
    exams = client.get(f"/api/exams?class_id={c1_id}", headers=_auth(client, TEACHER_A)).json()
    published = next(e for e in exams if e["status"] == "published" and e["title"].startswith("Quiz"))
    # Prefer live e2 (not yet submitted by everyone); fall back to any published.
    e2 = next((e for e in exams if e["title"] == "Quiz 3: Graphs & Queues"), published)

    resp = client.post(f"/api/exams/{e2['id']}/attempts", headers=_auth(client, STUDENT_OUT))
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


@pytest.mark.api
@pytest.mark.security
def test_notification_mark_read_of_another_user_is_404(client):
    others = client.get("/api/notifications", headers=_auth(client, STUDENT_A)).json()
    assert others["items"], "seed should give hamza notifications"
    notif_id = others["items"][0]["id"]

    resp = client.post(
        f"/api/notifications/{notif_id}/read",
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"
