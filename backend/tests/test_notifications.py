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


STUDENT_WITH_NOTES = "hamza.ali@umt.edu.pk"


def test_list_notifications_newest_first_with_unread_count(client):
    resp = client.get("/api/notifications", headers=_auth(client, STUDENT_WITH_NOTES))
    assert resp.status_code == 200
    body = resp.json()
    assert body["unread_count"] == len(body["items"])
    timestamps = [n["created_at"] for n in body["items"]]
    assert timestamps == sorted(timestamps, reverse=True)


def test_mark_one_read_decrements_unread_count(client):
    before = client.get("/api/notifications", headers=_auth(client, STUDENT_WITH_NOTES)).json()
    notif_id = before["items"][0]["id"]

    resp = client.post(
        f"/api/notifications/{notif_id}/read", headers=_auth(client, STUDENT_WITH_NOTES)
    )
    assert resp.status_code == 204

    after = client.get("/api/notifications", headers=_auth(client, STUDENT_WITH_NOTES)).json()
    assert after["unread_count"] == before["unread_count"] - 1


def test_mark_read_on_someone_elses_notification_is_404(client):
    others = client.get("/api/notifications", headers=_auth(client, STUDENT_WITH_NOTES)).json()
    notif_id = others["items"][0]["id"]
    resp = client.post(
        f"/api/notifications/{notif_id}/read",
        headers=_auth(client, "admin@cogni.pk"),
    )
    assert resp.status_code == 404


def test_mark_all_read_zeroes_unread_count(client):
    resp = client.post("/api/notifications/read-all", headers=_auth(client, STUDENT_WITH_NOTES))
    assert resp.status_code == 204
    after = client.get("/api/notifications", headers=_auth(client, STUDENT_WITH_NOTES)).json()
    assert after["unread_count"] == 0
