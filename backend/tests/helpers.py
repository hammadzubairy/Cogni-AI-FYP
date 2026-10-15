"""Shared auth helpers and small factories for API tests."""

from __future__ import annotations

from typing import Any

from tests.support.world import TEST_PASSWORD

WORLD_PASSWORD = TEST_PASSWORD

# Fixture-world personas (see tests/support/world.py).
PERSONAS = {
    "admin": "admin@cogni.pk",
    "admin2": "imran.butt@cogni.pk",
    "hod": "tariq.mehmood@umt.edu.pk",  # CS
    "hod_other_dept": "samina.javed@umt.edu.pk",  # SE
    "teacher": "ayesha.khan@umt.edu.pk",  # CS, owns CS-201-A
    "teacher_same_dept": "faisal.aziz@umt.edu.pk",  # CS, owns OS
    "teacher_other_dept": "nida.shah@umt.edu.pk",  # SE
    "student": "hamza.ali@umt.edu.pk",  # CS, in CS-201-A
    "student_other_class": "ali.raza@umt.edu.pk",  # SE student; also in CS-201-A seed
    "student_dsc": "zainab.fatima@umt.edu.pk",  # DSC; in CS-305-B and DS-230-A only
}

# student_other_class is enrolled in CS-201-A in seed; use student_dsc for
# "not in class" IDOR against CS-201-A exams.


def login_as(client, role_or_email: str, password: str = WORLD_PASSWORD) -> dict[str, str]:
    """Return Authorization headers for a demo persona or raw email."""
    email = PERSONAS.get(role_or_email, role_or_email)
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"login failed for {email}: {resp.status_code} {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def token_for(client, role_or_email: str, password: str = WORLD_PASSWORD) -> str:
    email = PERSONAS.get(role_or_email, role_or_email)
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def class_id_by_code(client, code: str, as_user: str = "teacher") -> str:
    headers = login_as(client, as_user)
    classes = client.get("/api/classes", headers=headers).json()
    return next(c["id"] for c in classes if c["code"] == code)


def first_material_id(client, class_id: str, as_user: str = "teacher") -> str:
    headers = login_as(client, as_user)
    materials = client.get(f"/api/classes/{class_id}/materials", headers=headers).json()
    return materials[0]["id"]


def make_class(client, *, name: str = "Temp Class", code: str = "TMP-99", as_user: str = "teacher") -> dict:
    headers = login_as(client, as_user)
    resp = client.post("/api/classes", json={"name": name, "code": code}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def upload_material(
    client,
    class_id: str,
    *,
    name: str = "Notes.pdf",
    text: str | None = None,
    pdf_bytes: bytes | None = None,
    as_user: str = "teacher",
) -> dict:
    headers = login_as(client, as_user)
    if pdf_bytes is not None:
        resp = client.post(
            f"/api/classes/{class_id}/materials",
            files={"file": (name, pdf_bytes, "application/pdf")},
            data={"name": name},
            headers=headers,
        )
    else:
        body_text = text or (
            "Data structures course notes. " * 40
            + "Hash tables give O(1) average lookup. "
            + "Collisions are resolved by chaining or open addressing. "
            + "Trees graphs heaps and queues are fundamental."
        )
        resp = client.post(
            f"/api/classes/{class_id}/materials",
            json={"name": name, "text": body_text},
            headers=headers,
        )
    assert resp.status_code == 201, resp.text
    return resp.json()


def make_exam_draft(
    client,
    *,
    class_id: str,
    material_ids: list[str],
    title: str = "Draft exam",
    kind: str = "Quiz",
    counts: dict[str, int] | None = None,
    duration_min: int = 30,
    request_id: str | None = None,
    as_user: str = "teacher",
) -> dict:
    headers = login_as(client, as_user)
    payload: dict[str, Any] = {
        "class_id": class_id,
        "title": title,
        "kind": kind,
        "duration_min": duration_min,
        "material_ids": material_ids,
        "counts": counts or {"MCQ": 2, "Short": 1},
    }
    if request_id:
        payload["request_id"] = request_id
    resp = client.post("/api/exams/generate", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["exam"]


def start_attempt(client, exam_id: str, as_user: str = "student") -> dict:
    headers = login_as(client, as_user)
    resp = client.post(f"/api/exams/{exam_id}/attempts", headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def submit_attempt(client, attempt_id: str, as_user: str = "student") -> dict:
    headers = login_as(client, as_user)
    resp = client.post(f"/api/attempts/{attempt_id}/submit", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()
