import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.helpers import WORLD_PASSWORD
from tests.pdf_fixtures import sample_multipage_pdf, sample_scanned_pdf

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")




def _auth(client, email, password=WORLD_PASSWORD):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


ADMIN = "admin@cogni.pk"
TEACHER_A = "ayesha.khan@umt.edu.pk"  # owns CS-201-A (c1)
TEACHER_B = "faisal.aziz@umt.edu.pk"  # owns CS-310-A (c3)
STUDENT_IN_C1 = "hamza.ali@umt.edu.pk"
STUDENT_NOT_IN_C1 = "zainab.fatima@umt.edu.pk"
HOD_CS = "tariq.mehmood@umt.edu.pk"  # heads the CS department (c1, c3 are both CS)


def _class_id(client, code, email):
    classes = client.get("/api/classes", headers=_auth(client, email)).json()
    return next(c["id"] for c in classes if c["code"] == code)


def test_upload_pdf_extracts_pages_strips_headers_and_joins_hyphens(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    pdf_bytes = sample_multipage_pdf()
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        files={"file": ("notes.pdf", pdf_bytes, "application/pdf")},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "pdf"
    assert body["name"] == "notes.pdf"
    assert body["chunk_count"] >= 1
    assert body["word_count"] > 0
    assert "text" not in body
    assert "chunks" not in body

    detail = client.get(
        f"/api/materials/{body['id']}", headers=_auth(client, TEACHER_A)
    ).json()
    assert "Confidential" not in detail["text"]  # repeated footer dropped
    assert detail["text"].count("COURSE NOTES") == 0  # repeated header dropped
    assert "function" in detail["text"]  # hyphenated break joined
    pages_seen = {c["page"] for c in detail["chunks"]}
    assert pages_seen  # page numbers were tagged onto chunks

    students = client.get(
        "/api/notifications", headers=_auth(client, STUDENT_IN_C1)
    ).json()
    assert any("notes.pdf" in n["text"] for n in students["items"])


def test_upload_pasted_text_too_short_is_400(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        json={"name": "Short note", "text": "Too short."},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 400


def test_upload_pasted_text_success(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    text = "Paragraph about graphs. " * 30
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        json={"name": "Graphs intro", "text": text},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 201
    assert resp.json()["kind"] == "text"


def test_upload_scanned_pdf_is_400_with_scanned_pdf_code(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        files={"file": ("scan.pdf", sample_scanned_pdf(), "application/pdf")},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "SCANNED_PDF"


def test_upload_wrong_file_type_is_400(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        files={"file": ("notes.txt", b"not a pdf at all", "text/plain")},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 400


def test_upload_oversize_is_400(client):
    admin_headers = _auth(client, ADMIN)
    settings_resp = client.get("/api/admin/settings", headers=admin_headers).json()
    client.put(
        "/api/admin/settings",
        json={**settings_resp, "max_upload_mb": 1},
        headers=admin_headers,
    )
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    oversized = b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024)
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        files={"file": ("big.pdf", oversized, "application/pdf")},
        headers=_auth(client, TEACHER_A),
    )
    assert resp.status_code == 400


def test_student_cannot_upload(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        json={"name": "Sneaky note", "text": "x" * 400},
        headers=_auth(client, STUDENT_IN_C1),
    )
    assert resp.status_code == 403


def test_teacher_cannot_upload_to_another_teachers_class(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.post(
        f"/api/classes/{c1_id}/materials",
        json={"name": "Intruding note", "text": "x" * 400},
        headers=_auth(client, TEACHER_B),
    )
    assert resp.status_code == 403


def test_non_enrolled_student_cannot_read_materials(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.get(
        f"/api/classes/{c1_id}/materials", headers=_auth(client, STUDENT_NOT_IN_C1)
    )
    assert resp.status_code == 403


def test_enrolled_student_can_list_without_full_text(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.get(
        f"/api/classes/{c1_id}/materials", headers=_auth(client, STUDENT_IN_C1)
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    assert all("text" not in item and "chunks" not in item for item in items)


def test_hod_of_department_can_read_materials(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    resp = client.get(
        f"/api/classes/{c1_id}/materials", headers=_auth(client, HOD_CS)
    )
    assert resp.status_code == 200


def test_delete_blocked_when_non_draft_exam_references_material(client):
    c1_id = _class_id(client, "CS-201-A", TEACHER_A)
    material_id = client.get(
        f"/api/classes/{c1_id}/materials", headers=_auth(client, TEACHER_A)
    ).json()[0]["id"]
    resp = client.delete(
        f"/api/materials/{material_id}", headers=_auth(client, TEACHER_A)
    )
    assert resp.status_code == 409


def test_delete_allowed_when_only_draft_exams_reference_material(client):
    c3_id = _class_id(client, "CS-310-A", TEACHER_B)
    material_id = client.get(
        f"/api/classes/{c3_id}/materials", headers=_auth(client, TEACHER_B)
    ).json()[0]["id"]
    resp = client.delete(
        f"/api/materials/{material_id}", headers=_auth(client, TEACHER_B)
    )
    assert resp.status_code == 204
    follow_up = client.get(
        f"/api/materials/{material_id}", headers=_auth(client, TEACHER_B)
    )
    assert follow_up.status_code == 404
