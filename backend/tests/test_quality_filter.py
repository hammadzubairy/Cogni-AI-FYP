import pytest

from app.services.exam_generator import filter_questions_quality, validate_question
from app.services.llm import MockLLM


@pytest.mark.asyncio
async def test_quality_filter_keeps_mock_questions():
    llm = MockLLM()
    questions = [
        {
            "qid": "1",
            "type": "MCQ",
            "bloom": "Understand",
            "topic": "Hashing",
            "clo": "CLO-1",
            "text": "Which statement about hashing is correct?",
            "options": ["A", "B", "C", "D"],
            "answer_index": 0,
            "marks": 2,
            "model_answer": "",
            "keywords": [],
            "source_chunk_idx": 0,
        }
    ]
    kept, warnings = await filter_questions_quality(llm, questions)
    assert kept == questions
    assert warnings == []


def test_validate_question_still_rejects_bad_mcq():
    err = validate_question(
        {
            "type": "MCQ",
            "bloom": "Remember",
            "topic": "X",
            "clo": "CLO-1",
            "text": "Q?",
            "options": ["a", "a", "b", "c"],
            "answer_index": 0,
        }
    )
    assert err is not None
