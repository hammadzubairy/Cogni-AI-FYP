"""Multi-role login, switch-role, and HOD promotion keep teacher."""

from __future__ import annotations

from tests.helpers import WORLD_PASSWORD, login_as


def test_login_wrong_portal_is_403(client):
    resp = client.post(
        "/api/auth/login",
        json={
            "email": "hamza.ali@umt.edu.pk",
            "password": WORLD_PASSWORD,
            "role": "admin",
        },
    )
    assert resp.status_code == 403
    assert "portal" in resp.json()["detail"].lower()


def test_login_correct_portal_ok(client):
    resp = client.post(
        "/api/auth/login",
        json={
            "email": "hamza.ali@umt.edu.pk",
            "password": WORLD_PASSWORD,
            "role": "student",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["role"] == "student"
    assert "student" in body["user"]["roles"]


def test_hod_seed_has_teacher_role(client):
    resp = client.post(
        "/api/auth/login",
        json={
            "email": "tariq.mehmood@umt.edu.pk",
            "password": WORLD_PASSWORD,
            "role": "hod",
        },
    )
    assert resp.status_code == 200
    roles = resp.json()["user"]["roles"]
    assert "hod" in roles
    assert "teacher" in roles

    as_teacher = client.post(
        "/api/auth/login",
        json={
            "email": "tariq.mehmood@umt.edu.pk",
            "password": WORLD_PASSWORD,
            "role": "teacher",
        },
    )
    assert as_teacher.status_code == 200
    assert as_teacher.json()["user"]["role"] == "teacher"


def test_switch_role_rejects_foreign(client):
    headers = login_as(client, "student")
    resp = client.post(
        "/api/auth/switch-role",
        json={"role": "admin"},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "portal" in resp.json()["detail"].lower()


def test_switch_role_hod_to_teacher(client):
    headers = login_as(client, "hod")
    resp = client.post(
        "/api/auth/switch-role",
        json={"role": "teacher"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["role"] == "teacher"
    assert "hod" in body["user"]["roles"]
    assert "teacher" in body["user"]["roles"]


def test_set_hod_keeps_teacher_in_roles(client):
    admin = login_as(client, "admin")
    depts = client.get("/api/admin/departments", headers=admin).json()
    cs = next(d for d in depts if d["code"] == "CS")
    # Promote Ayesha (teacher-only) to HOD of CS
    users = client.get("/api/admin/users", params={"role": "teacher"}, headers=admin).json()
    ayesha = next(u for u in users if u["email"] == "ayesha.khan@umt.edu.pk")
    prev_hod = cs.get("hod_id")

    patch = client.patch(
        f"/api/admin/departments/{cs['id']}",
        json={"hod_id": ayesha["id"]},
        headers=admin,
    )
    assert patch.status_code == 200

    login = client.post(
        "/api/auth/login",
        json={
            "email": "ayesha.khan@umt.edu.pk",
            "password": WORLD_PASSWORD,
            "role": "hod",
        },
    )
    assert login.status_code == 200
    roles = login.json()["user"]["roles"]
    assert "hod" in roles
    assert "teacher" in roles

    # Can still enter teacher portal
    as_t = client.post(
        "/api/auth/login",
        json={
            "email": "ayesha.khan@umt.edu.pk",
            "password": WORLD_PASSWORD,
            "role": "teacher",
        },
    )
    assert as_t.status_code == 200

    # Restore previous HOD (Tariq) so other tests stay stable if order matters
    if prev_hod:
        client.patch(
            f"/api/admin/departments/{cs['id']}",
            json={"hod_id": prev_hod},
            headers=admin,
        )


def test_teacher_student_dual_portals(client):
    for portal in ("teacher", "student"):
        resp = client.post(
            "/api/auth/login",
            json={
                "email": "faisal.aziz@umt.edu.pk",
                "password": WORLD_PASSWORD,
                "role": portal,
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["user"]["role"] == portal
        assert set(resp.json()["user"]["roles"]) >= {"teacher", "student"}
