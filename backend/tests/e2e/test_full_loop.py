"""End-to-end demo loop and a few focused lifecycle variants."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from tests.helpers import WORLD_PASSWORD, login_as, make_exam_draft, upload_material

pytestmark = pytest.mark.e2e


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _good_written(question: dict) -> str:
    words = [v for k in question.get("keywords", []) for v in k.get("variants", [])]
    if words:
        return "In my own words: " + " ".join(words) + "."
    return "A clear answer covering the expected points from the model."


AI_ISH = (
    "Furthermore, it is essential to recognize that this concept is robust "
    "and comprehensive. Moreover, it is crucial and paramount. In conclusion, "
    "additionally, the mechanism facilitates understanding. Overall, it "
    "ensures a multifaceted outcome for the reader to utilize. "
) * 4


@pytest.mark.e2e
def test_full_demo_loop(client):
    tag = _uid()

    # --- 1. Admin: new dept, two teachers, assign HOD, teacher creates class ---
    admin = login_as(client, "admin")
    dept = client.post(
        "/api/admin/departments",
        json={"code": f"QA{tag[:4].upper()}", "name": f"QA Dept {tag}"},
        headers=admin,
    )
    assert dept.status_code == 201, dept.text
    dept_id = dept.json()["id"]

    def _staff(name, email, role="teacher"):
        resp = client.post(
            "/api/admin/users",
            json={"name": name, "email": email, "role": role, "dept_id": dept_id},
            headers=admin,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        user = body["user"]
        temp = body["temporary_password"]
        # Complete forced password change so normal tokens work.
        tok = client.post(
            "/api/auth/login", json={"email": user["email"], "password": temp}
        ).json()["access_token"]
        changed = client.post(
            "/api/auth/change-password",
            json={"current_password": temp, "new_password": WORLD_PASSWORD},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert changed.status_code == 200, changed.text
        return user["id"], user["email"]

    hod_id, hod_email = _staff(f"QA HOD {tag}", f"qa.hod.{tag}@umt.edu.pk")
    teacher_id, teacher_email = _staff(f"QA Teacher {tag}", f"qa.teacher.{tag}@umt.edu.pk")

    patched = client.patch(
        f"/api/admin/departments/{dept_id}",
        json={"hod_id": hod_id},
        headers=admin,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["hod_id"] == hod_id

    teacher = login_as(client, teacher_email)
    cls = client.post(
        "/api/classes",
        json={"name": f"QA Structures {tag}", "code": f"QA-{tag[:6].upper()}"},
        headers=teacher,
    )
    assert cls.status_code == 201, cls.text
    class_id = cls.json()["id"]
    join_code = cls.json()["join_code"]

    # --- 2. HOD sends Midterm paper request to teacher ---
    hod = login_as(client, hod_email)
    due = datetime(2026, 12, 1, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    req = client.post(
        "/api/requests",
        json={
            "teacher_id": teacher_id,
            "class_id": class_id,
            "kind": "Midterm",
            "due": due,
            "note": "Cover hashing and trees",
        },
        headers=hod,
    )
    assert req.status_code == 201, req.text
    request_id = req.json()["id"]

    teacher_notes = client.get("/api/notifications", headers=teacher).json()
    assert any("Midterm" in n["text"] or "request" in n["text"].lower() for n in teacher_notes["items"])

    # --- 3. Teacher uploads material, generates Midterm, edits one question, submits ---
    material = upload_material(client, class_id, name=f"QA Notes {tag}", as_user=teacher_email)
    material_id = material["id"]

    exam = make_exam_draft(
        client,
        class_id=class_id,
        material_ids=[material_id],
        title=f"QA Midterm {tag}",
        kind="Midterm",
        counts={"MCQ": 2, "Short": 1, "Essay": 1},
        duration_min=45,
        request_id=request_id,
        as_user=teacher_email,
    )
    exam_id = exam["id"]
    assert exam["status"] == "draft"
    assert exam.get("request_id") == request_id

    q0 = exam["questions"][0]
    edited = client.patch(
        f"/api/exams/{exam_id}/questions/{q0['qid']}",
        json={"text": q0["text"] + " (revised)"},
        headers=teacher,
    )
    assert edited.status_code == 200, edited.text

    submit1 = client.post(f"/api/exams/{exam_id}/submit", headers=teacher)
    assert submit1.status_code == 200, submit1.text
    assert submit1.json()["status"] == "pending"

    # --- 4. HOD sees approvals; return with comment (exercise return path) ---
    # Tighten policy so checks are more likely to fail, then return regardless.
    client.put(
        "/api/hod/policy",
        json={"min_clo": 99, "higher_order_pct": 90, "max_repeats": 0},
        headers=hod,
    )
    approvals = client.get("/api/hod/approvals", headers=hod)
    assert approvals.status_code == 200
    assert any(p["id"] == exam_id for p in approvals.json())

    checks = client.get(f"/api/exams/{exam_id}/checks", headers=hod)
    assert checks.status_code == 200
    # Policy is intentionally harsh; at least one check should fail.
    assert any(not c["ok"] for c in checks.json())

    returned = client.post(
        f"/api/exams/{exam_id}/return",
        json={"comment": "Please broaden CLO coverage before resubmit."},
        headers=hod,
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["status"] == "returned"
    assert "CLO" in returned.json()["hod_comment"]

    # --- 5. Teacher fixes, resubmits; HOD approves; teacher publishes ---
    # Relax policy again so approval is a clean path after the return exercise.
    client.put(
        "/api/hod/policy",
        json={"min_clo": 1, "higher_order_pct": 10, "max_repeats": 50},
        headers=hod,
    )
    fix = client.patch(
        f"/api/exams/{exam_id}",
        json={"title": f"QA Midterm {tag} (fixed)"},
        headers=teacher,
    )
    assert fix.status_code == 200, fix.text

    submit2 = client.post(f"/api/exams/{exam_id}/submit", headers=teacher)
    assert submit2.status_code == 200, submit2.text
    assert submit2.json()["status"] == "pending"
    assert submit2.json()["hod_comment"] == ""

    approved = client.post(f"/api/exams/{exam_id}/approve", json={}, headers=hod)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    published = client.post(f"/api/exams/{exam_id}/publish", headers=teacher)
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"

    # --- 6. Three students join; two attempt (clean / AI-ish); one skips ---
    student_emails = []
    for i in range(3):
        _sid, semail = _staff(
            f"QA Student{i} {tag}", f"qa.stu{i}.{tag}@umt.edu.pk", role="student"
        )
        student_emails.append(semail)

    for email in student_emails:
        sh = login_as(client, email)
        joined = client.post("/api/classes/join", json={"join_code": join_code}, headers=sh)
        assert joined.status_code == 200, joined.text

    teacher_view = client.get(f"/api/exams/{exam_id}", headers=teacher).json()
    questions = teacher_view["questions"]
    mcqs = [q for q in questions if q["type"] == "MCQ"]
    written = [q for q in questions if q["type"] in ("Short", "Essay")]

    # Student 0 — clean answers
    s0 = login_as(client, student_emails[0])
    a0 = client.post(f"/api/exams/{exam_id}/attempts", headers=s0)
    assert a0.status_code == 201, a0.text
    attempt0 = a0.json()["id"]
    for q in mcqs:
        client.put(
            f"/api/attempts/{attempt0}/answers",
            json={"qid": q["qid"], "value": q["answer_index"]},
            headers=s0,
        )
    for q in written:
        client.put(
            f"/api/attempts/{attempt0}/answers",
            json={"qid": q["qid"], "value": _good_written(q)},
            headers=s0,
        )
    sub0 = client.post(f"/api/attempts/{attempt0}/submit", headers=s0)
    assert sub0.status_code == 200, sub0.text

    # Student 1 — AI-ish written answers
    s1 = login_as(client, student_emails[1])
    a1 = client.post(f"/api/exams/{exam_id}/attempts", headers=s1)
    assert a1.status_code == 201, a1.text
    attempt1 = a1.json()["id"]
    for q in mcqs:
        client.put(
            f"/api/attempts/{attempt1}/answers",
            json={"qid": q["qid"], "value": q["answer_index"]},
            headers=s1,
        )
    for q in written:
        client.put(
            f"/api/attempts/{attempt1}/answers",
            json={"qid": q["qid"], "value": AI_ISH},
            headers=s1,
        )
    sub1 = client.post(f"/api/attempts/{attempt1}/submit", headers=s1)
    assert sub1.status_code == 200, sub1.text

    # Student 2 — does not attempt

    # --- 7. Teacher closes the exam ---
    closed = client.post(f"/api/exams/{exam_id}/close", headers=teacher)
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "closed"

    results = client.get(f"/api/exams/{exam_id}/results", headers=teacher).json()
    assert results["aggregate"]["submitted_count"] == 2
    assert results["aggregate"]["enrolled_count"] == 3

    # --- 8. Teacher reviews flags, override one score, clear flag, release ---
    flags = client.get("/api/flags", headers=teacher).json()
    flagged_for_attempt1 = [f for f in flags if f["attempt_id"] == attempt1]
    if flagged_for_attempt1:
        fq = flagged_for_attempt1[0]
        clear = client.post(
            f"/api/attempts/{attempt1}/flags",
            json={"qid": fq["qid"], "decision": "cleared"},
            headers=teacher,
        )
        assert clear.status_code == 200, clear.text

    override_q = written[0]
    ov = client.post(
        f"/api/attempts/{attempt0}/override",
        json={"qid": override_q["qid"], "score": 0},
        headers=teacher,
    )
    assert ov.status_code == 200, ov.text
    assert ov.json()["overrides"][override_q["qid"]] == 0

    release = client.post(f"/api/exams/{exam_id}/release", headers=teacher)
    assert release.status_code == 200, release.text
    assert release.json()["released"] is True

    # --- 9. Students see feedback; study assistant ask on material ---
    fb0 = client.get(f"/api/attempts/{attempt0}/feedback", headers=s0)
    assert fb0.status_code == 200, fb0.text
    assert "overall_percent" in fb0.json()
    assert isinstance(fb0.json().get("tips"), list)

    fb1 = client.get(f"/api/attempts/{attempt1}/feedback", headers=s1)
    assert fb1.status_code == 200, fb1.text

    ask = client.post(
        f"/api/materials/{material_id}/ask",
        json={"question": "What is a hash table collision and how is it resolved?"},
        headers=s0,
    )
    assert ask.status_code == 200, ask.text
    assert ask.json()["answer"]
    assert ask.json()["sources"]

    # Non-attempting student still cannot see others' attempts
    s2 = login_as(client, student_emails[2])
    denied = client.get(f"/api/attempts/{attempt0}", headers=s2)
    assert denied.status_code == 403

    # --- 10. Dashboards / notifications / activity (rough but concrete) ---
    t_dash = client.get("/api/dashboard/teacher", headers=teacher)
    assert t_dash.status_code == 200
    assert any(c["id"] == class_id for c in t_dash.json()["classes"])

    h_dash = client.get("/api/dashboard/hod", headers=hod)
    assert h_dash.status_code == 200

    s_dash = client.get("/api/dashboard/student", headers=s0)
    assert s_dash.status_code == 200
    released = s_dash.json()["released_results"]
    assert any(r["exam_id"] == exam_id for r in released)

    s0_notes = client.get("/api/notifications", headers=s0).json()
    assert any("Results released" in n["text"] for n in s0_notes["items"])

    activity = client.get("/api/admin/activity", headers=admin).json()
    texts = [a["text"] for a in activity]
    assert any("Published" in t and tag in t for t in texts) or any(
        "Released results" in t for t in texts
    )
    assert any("QA Midterm" in t or tag in t for t in texts)


@pytest.mark.e2e
def test_quiz_direct_publish(client):
    """Quiz publishes without HOD when settings.approval is major/none."""
    settings = client.get("/api/admin/settings", headers=login_as(client, "admin")).json()
    assert settings["approval"] in ("major", "none")

    teacher = login_as(client, "teacher")
    classes = client.get("/api/classes", headers=teacher).json()
    class_id = next(c["id"] for c in classes if c["code"] == "CS-201-A")
    material = upload_material(client, class_id, name=f"Quiz mat {_uid()}")
    exam = make_exam_draft(
        client,
        class_id=class_id,
        material_ids=[material["id"]],
        title=f"Direct quiz {_uid()}",
        kind="Quiz",
        counts={"MCQ": 1, "Short": 1},
    )
    pub = client.post(f"/api/exams/{exam['id']}/publish", headers=teacher)
    assert pub.status_code == 200, pub.text
    assert pub.json()["status"] == "published"


@pytest.mark.e2e
def test_hod_return_then_withdraw(client):
    """Return a pending paper, resubmit, then teacher withdraws from pending."""
    teacher = login_as(client, "teacher")
    hod = login_as(client, "hod")
    classes = client.get("/api/classes", headers=teacher).json()
    class_id = next(c["id"] for c in classes if c["code"] == "CS-201-A")
    material = upload_material(client, class_id, name=f"Withdraw mat {_uid()}")
    exam = make_exam_draft(
        client,
        class_id=class_id,
        material_ids=[material["id"]],
        title=f"Return-withdraw {_uid()}",
        kind="Midterm",
        counts={"MCQ": 1, "Short": 1},
    )
    exam_id = exam["id"]

    assert client.post(f"/api/exams/{exam_id}/submit", headers=teacher).status_code == 200

    ret = client.post(
        f"/api/exams/{exam_id}/return",
        json={"comment": "Needs tighter wording on Q1"},
        headers=hod,
    )
    assert ret.status_code == 200, ret.text
    assert ret.json()["status"] == "returned"

    # Withdraw is only valid from pending — resubmit first, then withdraw.
    assert client.post(f"/api/exams/{exam_id}/submit", headers=teacher).status_code == 200
    wd = client.post(f"/api/exams/{exam_id}/withdraw", headers=teacher)
    assert wd.status_code == 200, wd.text
    assert wd.json()["status"] == "draft"
