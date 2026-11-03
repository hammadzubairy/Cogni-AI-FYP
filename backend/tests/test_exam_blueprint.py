"""Paper blueprint: page filters, allocation, schema, scoped mock generation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.exams import ExamGenerateRequest
from app.services.exam_blueprint import (
    chunks_for_pages,
    pages_overlap,
    parse_page_span,
    plan_generation_scopes,
    remaining_counts_after_pins,
    tag_chunks_with_material,
)
from app.services.exam_generator import generate_questions_with_blueprint
from app.services.llm import MockLLM
from tests.helpers import WORLD_PASSWORD, portal_for

TEACHER = "ayesha.khan@umt.edu.pk"


def _auth(client, email=TEACHER):
    resp = client.post(
        "/api/auth/login",
        json={"email": email, "password": WORLD_PASSWORD, "role": portal_for(email)},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_parse_page_span_and_overlap():
    assert parse_page_span(3) == (3, 3)
    assert parse_page_span("3-5") == (3, 5)
    assert parse_page_span("5-3") == (3, 5)
    assert parse_page_span(None) is None
    assert pages_overlap(4, 1, 4)
    assert pages_overlap("3-5", 5, 7)
    assert not pages_overlap(2, 5, 10)


def test_tag_and_filter_chunks():
    materials = [
        {
            "id": "m1",
            "chunks": [
                {"idx": 0, "page": 1, "text": "a"},
                {"idx": 1, "page": "3-4", "text": "b"},
                {"idx": 2, "page": 7, "text": "c"},
            ],
        },
        {
            "id": "m2",
            "chunks": [{"idx": 0, "page": 1, "text": "other"}],
        },
    ]
    tagged = tag_chunks_with_material(materials)
    assert all("material_id" in c for c in tagged)
    mid = chunks_for_pages(tagged, material_id="m1", page_from=3, page_to=4)
    assert len(mid) == 1 and mid[0]["text"] == "b"
    slide7 = chunks_for_pages(tagged, material_id="m1", page_from=7, page_to=7)
    assert len(slide7) == 1 and slide7[0]["text"] == "c"
    by_pages = chunks_for_pages(tagged, material_id="m1", pages=[1, 7])
    assert {c["text"] for c in by_pages} == {"a", "c"}
    by_idx = chunks_for_pages(tagged, material_id="m1", chunk_idxs=[1])
    assert len(by_idx) == 1 and by_idx[0]["text"] == "b"


def test_allocation_pins_then_weightage():
    counts = {"MCQ": 10, "Short": 15, "Long": 3}
    pins = [
        {
            "material_id": "m1",
            "page_from": 7,
            "page_to": 7,
            "type_label": "Long",
            "count": 2,
        },
        {
            "material_id": "m1",
            "page_from": 7,
            "page_to": 7,
            "type_label": "Short",
            "count": 6,
        },
    ]
    weightage = [
        {"material_id": "m1", "page_from": 1, "page_to": 4, "weight_pct": 30},
        {"material_id": "m1", "page_from": 5, "page_to": 10, "weight_pct": 70},
    ]
    rem = remaining_counts_after_pins(counts, pins)
    assert rem == {"MCQ": 10, "Short": 9, "Long": 1}
    scopes = plan_generation_scopes(counts, weightage=weightage, pins=pins)
    pin_scopes = [s for s in scopes if s.kind == "pin"]
    weight_scopes = [s for s in scopes if s.kind == "weight"]
    assert sum(s.counts.get("Long", 0) for s in pin_scopes) == 2
    assert sum(s.counts.get("Short", 0) for s in pin_scopes) == 6
    # Totals across weight bands after pin deduction from overlapping (final) band.
    assert sum(s.counts.get("MCQ", 0) for s in weight_scopes) == 10
    assert sum(s.counts.get("Short", 0) for s in weight_scopes) == 9
    assert sum(s.counts.get("Long", 0) for s in weight_scopes) == 1
    # Pins on page 7 hit the 70% band (pages 5–10); that band's Long leftover is 0.
    final = next(s for s in weight_scopes if s.page_from == 5)
    mid = next(s for s in weight_scopes if s.page_from == 1)
    assert final.counts.get("Long", 0) == 0
    assert mid.counts.get("Long", 0) == 1


def test_pin_deducts_from_overlapping_band():
    """5 Long, 30%/70% bands, pin 1 Long on slide 3 → mid remaining Long = band−1."""
    counts = {"Long": 5}
    weightage = [
        {"material_id": "m1", "pages": [1, 2, 3, 4], "weight_pct": 30},
        {"material_id": "m1", "pages": [5, 6, 7, 8, 9, 10], "weight_pct": 70},
    ]
    pins = [
        {
            "material_id": "m1",
            "pages": [3],
            "type_label": "Long",
            "count": 1,
        }
    ]
    scopes = plan_generation_scopes(counts, weightage=weightage, pins=pins)
    pin_scopes = [s for s in scopes if s.kind == "pin"]
    weight_scopes = [s for s in scopes if s.kind == "weight"]
    assert sum(s.counts.get("Long", 0) for s in pin_scopes) == 1
    # 30% of 5 → 2 mid, 70% → 3 final; pin takes 1 from mid → mid rem 1, final 3.
    mid = next(s for s in weight_scopes if 3 in (s.pages or []) or s.page_from == 1)
    final = next(s for s in weight_scopes if s.page_from == 5 or (s.pages and 10 in s.pages))
    assert mid.counts.get("Long", 0) == 1
    assert final.counts.get("Long", 0) == 3
    assert sum(s.counts.get("Long", 0) for s in scopes) == 5


def test_schema_rejects_bad_blueprint():
    base = {
        "class_id": "c1",
        "title": "Final",
        "kind": "Final",
        "duration_min": 60,
        "material_ids": ["m1"],
        "types": [
            {"label": "MCQ", "count": 4, "format": "mcq", "marks": 2},
            {"label": "Long", "count": 2, "format": "written", "marks": 10},
        ],
    }
    with pytest.raises(ValidationError):
        ExamGenerateRequest(
            **base,
            weightage=[{"material_id": "m1", "page_from": 1, "page_to": 2, "weight_pct": 40}],
        )
    with pytest.raises(ValidationError):
        ExamGenerateRequest(
            **base,
            pins=[
                {
                    "material_id": "m1",
                    "page_from": 1,
                    "page_to": 1,
                    "type_label": "Long",
                    "count": 5,
                }
            ],
        )
    ok = ExamGenerateRequest(
        **base,
        weightage=[
            {"material_id": "m1", "page_from": 1, "page_to": 4, "weight_pct": 30},
            {"material_id": "m1", "page_from": 5, "page_to": 10, "weight_pct": 70},
        ],
        pins=[
            {
                "material_id": "m1",
                "page_from": 7,
                "page_to": 7,
                "type_label": "Long",
                "count": 1,
            }
        ],
    )
    assert ok.has_blueprint()
    named = ExamGenerateRequest(
        **base,
        weightage=[
            {"material_id": "m1", "pages": [1, 2, 3, 4], "weight_pct": 30},
            {"material_id": "m1", "pages": [5, 7, 10], "weight_pct": 70},
        ],
        pins=[
            {
                "material_id": "m1",
                "pages": [7],
                "type_label": "Long",
                "count": 1,
            }
        ],
    )
    assert named.weightage[0].page_from == 1
    assert named.weightage[0].page_to == 4
    assert named.pins[0].pages == [7]


@pytest.mark.asyncio
async def test_scoped_mock_generation_respects_totals():
    chunks = [
        {"idx": i, "page": i + 1, "material_id": "m1", "heading": f"S{i}", "text": f"content {i} " * 40}
        for i in range(10)
    ]
    llm = MockLLM()
    counts = {"MCQ": 4, "Short": 2, "Long": 2}
    formats = {"MCQ": "mcq", "Short": "written", "Long": "written"}
    pins = [
        type(
            "P",
            (),
            {
                "material_id": "m1",
                "page_from": 7,
                "page_to": 7,
                "type_label": "Long",
                "count": 1,
            },
        )()
    ]
    weightage = [
        type("W", (), {"material_id": "m1", "page_from": 1, "page_to": 4, "weight_pct": 30.0})(),
        type("W", (), {"material_id": "m1", "page_from": 5, "page_to": 10, "weight_pct": 70.0})(),
    ]
    questions, warnings = await generate_questions_with_blueprint(
        llm,
        chunks,
        counts,
        ["CLO-1"],
        formats=formats,
        weightage=weightage,
        pins=pins,
    )
    assert len(questions) <= sum(counts.values())
    by = {}
    for q in questions:
        by[q["type"]] = by.get(q["type"], 0) + 1
    for t, n in counts.items():
        assert by.get(t, 0) <= n
    assert isinstance(warnings, list)


def test_generate_without_blueprint_still_works(client):
    headers = _auth(client)
    classes = client.get("/api/classes", headers=headers).json()
    c1 = next(c for c in classes if c["code"] == "CS-201-A")
    mats = client.get(f"/api/classes/{c1['id']}/materials", headers=headers).json()
    assert mats
    resp = client.post(
        "/api/exams/generate",
        headers=headers,
        json={
            "class_id": c1["id"],
            "title": "No blueprint quiz",
            "kind": "Quiz",
            "duration_min": 20,
            "material_ids": [mats[0]["id"]],
            "types": [
                {"label": "MCQ", "count": 2, "format": "mcq", "marks": 2},
                {"label": "Short", "count": 1, "format": "written", "marks": 5},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    exam = body.get("exam") or body
    assert exam.get("status") == "draft"
    assert exam.get("blueprint") in (None, {})
