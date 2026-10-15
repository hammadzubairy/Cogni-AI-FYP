"""End-to-end smoke test: runs the full teacher -> HOD -> teacher -> student
loop plus every role's dashboard against a running server, over real HTTP.

Usage:
    cd backend
    LLM_PROVIDER=mock MONGO_DB=cogni_e2e python -m tests.support.world --force
    LLM_PROVIDER=mock MONGO_DB=cogni_e2e uvicorn app.main:app --port 8000 &
    python scripts/e2e_smoke.py

Prints PASS/FAIL for each step and exits non-zero if any step failed.
"""

import os
import sys
import time

import httpx

from tests.support.world import TEST_PASSWORD

BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:8000")

ADMIN = "admin@cogni.pk"
TEACHER = "ayesha.khan@umt.edu.pk"  # dept cs, owns CS-201-A
HOD = "tariq.mehmood@umt.edu.pk"  # heads dept cs
STUDENT = "hamza.ali@umt.edu.pk"  # enrolled in CS-201-A, dept cs
PASSWORD = TEST_PASSWORD

failures: list[str] = []


def step(name, fn):
    try:
        result = fn()
    except Exception as exc:  # noqa: BLE001 - smoke test: report any failure
        print(f"FAIL: {name}: {exc}")
        failures.append(name)
        return None
    print(f"PASS: {name}")
    return result


def main() -> None:
    client = httpx.Client(base_url=BASE_URL, timeout=30)

    def login(email: str) -> dict:
        resp = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert resp.status_code == 200, resp.text
        return resp.json()

    def auth_headers(token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    admin_login = step("admin login", lambda: login(ADMIN))
    teacher_login = step("teacher login", lambda: login(TEACHER))
    hod_login = step("hod login", lambda: login(HOD))
    student_login = step("student login", lambda: login(STUDENT))
    if not all([admin_login, teacher_login, hod_login, student_login]):
        print("\nAborting: could not authenticate every role.")
        sys.exit(1)

    admin_hdr = auth_headers(admin_login["access_token"])
    teacher_hdr = auth_headers(teacher_login["access_token"])
    hod_hdr = auth_headers(hod_login["access_token"])
    student_hdr = auth_headers(student_login["access_token"])

    def get_class_id() -> str:
        resp = client.get("/api/classes", headers=teacher_hdr)
        assert resp.status_code == 200, resp.text
        classes = resp.json()
        return next(c["id"] for c in classes if c["code"] == "CS-201-A")

    class_id = step("teacher lists classes", get_class_id)
    if class_id is None:
        sys.exit(1)

    def upload_material() -> str:
        text = "Binary search trees keep smaller keys to the left child and larger keys to the right child. " * 6
        resp = client.post(
            f"/api/classes/{class_id}/materials",
            json={"name": f"Smoke test notes {int(time.time())}", "text": text},
            headers=teacher_hdr,
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    material_id = step("teacher uploads material", upload_material)
    if material_id is None:
        sys.exit(1)

    def generate_exam() -> str:
        resp = client.post(
            "/api/exams/generate",
            json={
                "class_id": class_id,
                "title": f"Smoke test midterm {int(time.time())}",
                "kind": "Midterm",
                "duration_min": 30,
                "material_ids": [material_id],
                "counts": {"MCQ": 1, "Short": 1, "Essay": 0},
            },
            headers=teacher_hdr,
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["exam"]["id"]

    exam_id = step("teacher generates draft exam", generate_exam)
    if exam_id is None:
        sys.exit(1)

    def submit_for_approval() -> None:
        resp = client.post(f"/api/exams/{exam_id}/submit", headers=teacher_hdr)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "pending"

    step("teacher sends exam to HOD", submit_for_approval)

    def hod_approve() -> None:
        resp = client.post(
            f"/api/exams/{exam_id}/approve", json={"comment": "Looks good"}, headers=hod_hdr
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "approved"

    step("HOD approves exam", hod_approve)

    def teacher_publish() -> None:
        resp = client.post(f"/api/exams/{exam_id}/publish", headers=teacher_hdr)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "published"

    step("teacher publishes exam", teacher_publish)

    def start_attempt() -> str:
        resp = client.post(f"/api/exams/{exam_id}/attempts", headers=student_hdr)
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    attempt_id = step("student starts attempt", start_attempt)
    if attempt_id is None:
        sys.exit(1)

    def answer_questions() -> None:
        resp = client.get(f"/api/exams/{exam_id}", headers=student_hdr)
        assert resp.status_code == 200, resp.text
        for q in resp.json()["questions"]:
            value = 0 if q["type"] == "MCQ" else "Keys to the left are smaller, keys to the right are larger."
            put = client.put(
                f"/api/attempts/{attempt_id}/answers",
                json={"qid": q["qid"], "value": value},
                headers=student_hdr,
            )
            assert put.status_code == 200, put.text

    step("student answers every question", answer_questions)

    def submit_attempt() -> None:
        resp = client.post(f"/api/attempts/{attempt_id}/submit", headers=student_hdr)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "submitted"

    step("student submits attempt", submit_attempt)

    def teacher_checks_results() -> None:
        resp = client.get(f"/api/exams/{exam_id}/results", headers=teacher_hdr)
        assert resp.status_code == 200, resp.text
        assert resp.json()["aggregate"]["submitted_count"] >= 1

    step("teacher views exam results", teacher_checks_results)

    def release_results() -> None:
        resp = client.post(f"/api/exams/{exam_id}/release", headers=teacher_hdr)
        assert resp.status_code == 200, resp.text
        assert resp.json()["released"] is True

    step("teacher releases results", release_results)

    def student_feedback() -> None:
        resp = client.get(f"/api/attempts/{attempt_id}/feedback", headers=student_hdr)
        assert resp.status_code == 200, resp.text
        assert "overall_percent" in resp.json()

    step("student views feedback", student_feedback)

    def ask_assistant() -> None:
        resp = client.post(
            f"/api/materials/{material_id}/ask",
            json={"question": "What does a binary search tree do with smaller keys?"},
            headers=student_hdr,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["answer"]
        assert body["sources"]

    step("student asks the study assistant", ask_assistant)

    def check(path: str, headers: dict) -> None:
        resp = client.get(path, headers=headers)
        assert resp.status_code == 200, resp.text

    step("teacher dashboard loads", lambda: check("/api/dashboard/teacher", teacher_hdr))
    step("student dashboard loads", lambda: check("/api/dashboard/student", student_hdr))
    step("hod dashboard loads", lambda: check("/api/dashboard/hod", hod_hdr))
    step("hod analytics loads", lambda: check("/api/hod/analytics", hod_hdr))
    step("admin summary loads", lambda: check("/api/admin/summary", admin_hdr))
    step("admin activity log loads", lambda: check("/api/admin/activity", admin_hdr))
    step("teacher notifications load", lambda: check("/api/notifications", teacher_hdr))

    print(f"\n{len(failures)} failure(s) out of a full run.")
    if failures:
        for name in failures:
            print(f"  - {name}")
        sys.exit(1)


if __name__ == "__main__":
    main()
