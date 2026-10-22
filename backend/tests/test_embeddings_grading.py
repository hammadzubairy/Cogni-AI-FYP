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
