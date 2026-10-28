import pytest

from app.services.exam_generator import plan_marks


def _qs(mcq, short, essay):
    return (
        [{"type": "MCQ"} for _ in range(mcq)]
        + [{"type": "Short"} for _ in range(short)]
        + [{"type": "Essay"} for _ in range(essay)]
    )


def test_suggested_defaults():
    qs = _qs(1, 1, 1)
    plan_marks(qs)
    assert [q["marks"] for q in qs] == [2, 5, 10]


def test_suggested_custom_per_type():
    qs = _qs(2, 1, 0)
    plan_marks(qs, per_type={"MCQ": 1, "Short": 3, "Essay": 10})
    assert [q["marks"] for q in qs] == [1, 1, 3]


@pytest.mark.parametrize("total", [20, 47, 50, 100, 5.5])
def test_total_mode_sums_exactly(total):
    qs = _qs(5, 3, 2) if total >= 10 else _qs(2, 1, 1)
    plan_marks(qs, mode="total", total=total)
    assert sum(q["marks"] for q in qs) == total
    assert all(q["marks"] >= 0.5 and (q["marks"] * 2).is_integer() for q in qs)


def test_total_mode_weights_follow_type():
    qs = _qs(1, 1, 1)
    plan_marks(qs, mode="total", total=34)
    assert qs[0]["marks"] < qs[1]["marks"] < qs[2]["marks"]


def test_total_too_small_raises():
    with pytest.raises(ValueError):
        plan_marks(_qs(4, 0, 0), mode="total", total=1)


def test_suggested_long_questions_label():
    qs = [
        {"type": "MCQ", "format": "mcq"},
        {"type": "Short Questions", "format": "written"},
        {"type": "Long Questions", "format": "written"},
    ]
    plan_marks(qs)
    assert [q["marks"] for q in qs] == [2, 5, 10]
