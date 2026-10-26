from app.services.embeddings import cosine_similarity, cosine_similarity_percent
from app.services.grading import GPTZeroDetector, HeuristicDetector, _blend_score, get_ai_detector
from app.core.config import settings


def test_cosine_similarity_identical_high():
    a = "Hash tables store key value pairs with constant time lookup."
    assert cosine_similarity(a, a) >= 0.9
    assert cosine_similarity_percent(a, a) >= 90


def test_cosine_similarity_unrelated_lower():
    a = "Hash tables store key value pairs with constant time lookup."
    b = "Photosynthesis converts sunlight into chemical energy in plants."
    assert cosine_similarity(a, b) < cosine_similarity(a, a)


def test_blend_score_weights():
    # 100% on all signals → full marks
    assert _blend_score(10, 100, 100, 100) == 10.0
    # zero → zero
    assert _blend_score(10, 0, 0, 0) == 0.0
    # Keywords alone must not inflate similarity channel (40%+20% ≠ 60% from keys only)
    # sim=20, key=100, rubric=0 → 0.4*20 + 0.2*100 = 28% → 3.0/10
    assert _blend_score(10, 20, 100, 0) == 3.0


def test_gptzero_mixed_counts_as_ai():
    from app.services.grading import _gptzero_probability

    pct = _gptzero_probability(
        {
            "documents": [
                {"class_probabilities": {"human": 0.1, "ai": 0.2, "mixed": 0.7}}
            ]
        }
    )
    # 1 - human = 0.9 → 90
    assert pct == 90.0

    pct2 = _gptzero_probability(
        {"documents": [{"class_probabilities": {"ai": 0.0, "mixed": 0.8}}]}
    )
    assert pct2 == 80.0


def test_heuristic_detector_short_answer():
    d = HeuristicDetector()
    assert d.predict("short") == 4.0


def test_gptzero_falls_back_without_key(monkeypatch):
    monkeypatch.setattr(settings, "GPTZERO_API_KEY", "")
    d = GPTZeroDetector()
    score = d.predict("Furthermore, it is essential to utilize a comprehensive approach overall,")
    assert 3 <= score <= 97


def test_get_ai_detector_gptzero(monkeypatch):
    monkeypatch.setattr(settings, "AI_DETECTOR", "gptzero")
    assert get_ai_detector().label == "gptzero"
    monkeypatch.setattr(settings, "AI_DETECTOR", "heuristic")
    assert get_ai_detector().label == "heuristic"
