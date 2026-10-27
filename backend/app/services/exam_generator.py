"""Pure-Python question generation, validation and deduplication on top of
`services/llm.py`. Routers never build or validate questions directly."""

import re
import uuid

from app.prompts.exam_generation import (
    EXAM_GEN_SYSTEM_PROMPT,
    build_exam_gen_user_prompt,
)
from app.prompts.quality_filter import (
    QUALITY_FILTER_SYSTEM_PROMPT,
    build_quality_filter_user_prompt,
)
from app.services.llm import LLMClient, LLMError, call_json

MARKS_BY_TYPE = {"MCQ": 2, "Short": 5, "Essay": 10}
BLOOM_LEVELS = {"Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"}
HIGHER_ORDER_BLOOMS = {"Analyze", "Evaluate", "Create"}
MAX_TOTAL_QUESTIONS = 40
LONG_MATERIAL_WORDS = 3500
MAX_SOURCE_CHUNKS = 10
MAX_CHUNK_CHARS = 1200
DUPLICATE_JACCARD_THRESHOLD = 0.8


def select_source_chunks(chunks: list[dict]) -> list[dict]:
    """Pick a capped, evenly spaced subset of chunks so generation stays
    within free-tier context limits. Truncate very long chunks."""
    if not chunks:
        return []

    def _trim(c: dict) -> dict:
        text = c.get("text") or ""
        if len(text) > MAX_CHUNK_CHARS:
            text = text[:MAX_CHUNK_CHARS].rsplit(" ", 1)[0] + "…"
        return {**c, "text": text}

    total_words = sum(len(c["text"].split()) for c in chunks)
    if total_words <= LONG_MATERIAL_WORDS and len(chunks) <= MAX_SOURCE_CHUNKS:
        return [_trim(c) for c in chunks]
    target = min(MAX_SOURCE_CHUNKS, max(6, len(chunks) // 4))
    target = min(target, len(chunks))
    step = len(chunks) / target
    picked = sorted({min(round(i * step), len(chunks) - 1) for i in range(target)})
    return [_trim(chunks[i]) for i in picked]


def _normalized_tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def _is_duplicate(question: dict, others: list[dict]) -> bool:
    tokens = _normalized_tokens(question["text"])
    return any(
        _jaccard(tokens, _normalized_tokens(other["text"])) >= DUPLICATE_JACCARD_THRESHOLD
        for other in others
    )


def validate_question(q: dict) -> str | None:
    """Return a human-readable error, or None if the question is valid."""
    if not isinstance(q, dict):
        return "question is not an object"
    if not {"type", "bloom", "topic", "clo", "text"}.issubset(q):
        return "missing required fields"
    if q["type"] not in MARKS_BY_TYPE:
        return "invalid type"
    if q["bloom"] not in BLOOM_LEVELS:
        return "invalid bloom level"
    if not q.get("text") or not q.get("topic") or not q.get("clo"):
        return "text/topic/clo must not be empty"
    if q["type"] == "MCQ":
        options = q.get("options")
        if not isinstance(options, list) or len(options) != 4:
            return "MCQ needs exactly 4 options"
        normalized = [str(o).strip().lower() for o in options]
        if len(set(normalized)) != 4:
            return "MCQ options must be distinct"
        if any(o in ("all of the above", "none of the above") for o in normalized):
            return 'MCQ cannot use "all/none of the above"'
        idx = q.get("answer_index")
        if not isinstance(idx, int) or isinstance(idx, bool) or not (0 <= idx < 4):
            return "MCQ needs a valid answer_index"
    else:
        if not q.get("model_answer"):
            return "written question needs a model_answer"
        keywords = q.get("keywords")
        if not isinstance(keywords, list) or len(keywords) < 2:
            return "written question needs at least 2 keywords"
        for k in keywords:
            if not isinstance(k, dict) or not k.get("label") or not k.get("variants"):
                return "each keyword needs a label and variants"
    return None


def plan_marks(
    questions: list[dict],
    *,
    mode: str = "suggested",
    per_type: dict[str, float] | None = None,
    total: float | None = None,
) -> None:
    """Set `marks` on each question in place. "suggested" uses per-type marks;
    "total" spreads `total` over the questions (weights follow the default
    per-type marks, rounded to 0.5, summing to exactly `total`)."""
    if not questions:
        return
    per_type = per_type or MARKS_BY_TYPE
    if mode != "total" or not total:
        for q in questions:
            q["marks"] = per_type.get(q["type"], MARKS_BY_TYPE[q["type"]])
        return
    step = 0.5
    units = round(total / step)
    n = len(questions)
    if units < n:
        raise ValueError("Total marks must allow at least 0.5 marks per question.")
    weights = [MARKS_BY_TYPE[q["type"]] for q in questions]
    wsum = sum(weights)
    # Every question gets one unit, the rest is shared by weight (largest remainder).
    spare = units - n
    raw = [spare * w / wsum for w in weights]
    alloc = [int(r) for r in raw]
    leftover = spare - sum(alloc)
    order = sorted(range(n), key=lambda i: raw[i] - alloc[i], reverse=True)
    for i in order[:leftover]:
        alloc[i] += 1
    for q, extra in zip(questions, alloc):
        q["marks"] = (1 + extra) * step


def finalize_question(raw: dict) -> dict:
    """Assign qid/marks and normalize optional fields on an already-valid
    question dict returned by the LLM."""
    q = dict(raw)
    q["qid"] = str(uuid.uuid4())
    q["marks"] = MARKS_BY_TYPE[q["type"]]
    q.setdefault("source_chunk_idx", None)
    if q["type"] == "MCQ":
        q.setdefault("model_answer", "")
        q.setdefault("keywords", [])
    else:
        q["options"] = None
        q["answer_index"] = None
    return q


def _bloom_mix_warning(questions: list[dict]) -> str | None:
    if not questions:
        return None
    n = len(questions)
    higher = sum(1 for q in questions if q["bloom"] in HIGHER_ORDER_BLOOMS)
    remember = sum(1 for q in questions if q["bloom"] == "Remember")
    if higher / n < 0.25:
        return "Fewer than 25% of the generated questions are Analyze, Evaluate or Create."
    if remember / n > 0.40:
        return "More than 40% of the generated questions are Remember."
    return None


async def _call_llm_for_questions(
    llm: LLMClient,
    chunks: list[dict],
    counts: dict[str, int],
    clos: list[str],
    *,
    avoid_texts: list[str] | None = None,
    preferred_topic: str | None = None,
    preferred_clo: str | None = None,
) -> tuple[list[dict], list[str]]:
    user_prompt = build_exam_gen_user_prompt(
        chunks,
        counts,
        clos,
        avoid_texts=avoid_texts,
        preferred_topic=preferred_topic,
        preferred_clo=preferred_clo,
    )
    data = await call_json(llm, EXAM_GEN_SYSTEM_PROMPT, user_prompt, max_tokens=4000, temperature=0.5)
    raw_questions = data.get("questions", []) if isinstance(data, dict) else []

    questions, warnings = [], []
    for raw in raw_questions:
        error = validate_question(raw)
        if error:
            warnings.append(f"Dropped an invalid question: {error}.")
            continue
        questions.append(finalize_question(raw))
    return questions, warnings


async def filter_questions_quality(
    llm: LLMClient, questions: list[dict]
) -> tuple[list[dict], list[str]]:
    """Second LLM pass: drop questions that fail relevance/grammar/Bloom/dupe checks.
    On LLM failure, keep the batch (schema validation already ran)."""
    if not questions:
        return [], []
    warnings: list[str] = []
    try:
        data = await call_json(
            llm,
            QUALITY_FILTER_SYSTEM_PROMPT,
            build_quality_filter_user_prompt(questions),
            max_tokens=2000,
            temperature=0.1,
        )
    except LLMError:
        warnings.append("Quality filter unavailable; kept schema-valid questions.")
        return questions, warnings

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        warnings.append("Quality filter returned no results; kept questions.")
        return questions, warnings

    rejected: set[int] = set()
    for row in results:
        if not isinstance(row, dict):
            continue
        idx = _coerce_index(row.get("index"))
        if idx is None or not (0 <= idx < len(questions)):
            continue
        if _is_quality_fail(row.get("pass")):
            rejected.add(idx)
            reason = str(row.get("reason") or "failed quality checks").strip()
            stem = questions[idx].get("text", "")[:60]
            warnings.append(f'Quality filter dropped "{stem}": {reason}')

    kept = [q for i, q in enumerate(questions) if i not in rejected]
    return kept, warnings


def _coerce_index(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value == int(value):
        return int(value)
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None


def _is_quality_fail(pass_val) -> bool:
    if pass_val is False or pass_val == 0:
        return True
    if isinstance(pass_val, str) and pass_val.strip().lower() in ("false", "0", "no", "fail"):
        return True
    return False


async def generate_questions(
    llm: LLMClient,
    chunks: list[dict],
    counts: dict[str, int],
    clos: list[str],
    *,
    existing_exam_questions: list[list[dict]] | None = None,
) -> tuple[list[dict], list[str]]:
    """Generate, validate, quality-filter, deduplicate and top up questions."""
    total_requested = sum(counts.values())
    if total_requested > MAX_TOTAL_QUESTIONS:
        raise ValueError(f"Cannot request more than {MAX_TOTAL_QUESTIONS} questions.")

    source_chunks = select_source_chunks(chunks)
    questions, warnings = await _call_llm_for_questions(llm, source_chunks, counts, clos)

    deduped: list[dict] = []
    for q in questions:
        if not _is_duplicate(q, deduped):
            deduped.append(q)
    questions = deduped

    questions, qa_warnings = await filter_questions_quality(llm, questions)
    warnings.extend(qa_warnings)

    for prior_questions in existing_exam_questions or []:
        for q in questions:
            if _is_duplicate(q, prior_questions):
                warnings.append(
                    f'Repeated question (similar to an earlier exam): "{q["text"][:60]}".'
                )

    by_type: dict[str, list[dict]] = {t: [] for t in counts}
    for q in questions:
        by_type.setdefault(q["type"], []).append(q)

    shortfall = {t: counts[t] - len(by_type.get(t, [])) for t in counts}
    shortfall = {t: n for t, n in shortfall.items() if n > 0}
    if shortfall:
        retry_questions, retry_warnings = await _call_llm_for_questions(
            llm, source_chunks, shortfall, clos, avoid_texts=[q["text"] for q in questions]
        )
        warnings.extend(retry_warnings)
        retry_questions, retry_qa = await filter_questions_quality(llm, retry_questions)
        warnings.extend(retry_qa)
        for q in retry_questions:
            if q["type"] not in shortfall:
                continue
            if _is_duplicate(q, questions):
                continue
            if len(by_type.get(q["type"], [])) >= counts[q["type"]]:
                continue
            by_type.setdefault(q["type"], []).append(q)
            questions.append(q)

    for t, needed in counts.items():
        have = len(by_type.get(t, []))
        if have < needed:
            warnings.append(f"Only generated {have}/{needed} {t} question(s).")

    final: list[dict] = []
    for t in counts:
        final.extend(by_type.get(t, [])[: counts[t]])

    mix_warning = _bloom_mix_warning(final)
    if mix_warning:
        warnings.append(mix_warning)

    return final, warnings


async def regenerate_one(
    llm: LLMClient,
    chunks: list[dict],
    existing_questions: list[dict],
    qtype: str,
    clos: list[str],
    *,
    preferred_topic: str | None = None,
    preferred_clo: str | None = None,
) -> dict:
    """Generate one new question of `qtype`, avoiding existing questions,
    same topic/clo preferred. Raises ValueError if none came back valid."""
    source_chunks = select_source_chunks(chunks)
    avoid_texts = [q["text"] for q in existing_questions]
    questions, _warnings = await _call_llm_for_questions(
        llm,
        source_chunks,
        {qtype: 1},
        clos,
        avoid_texts=avoid_texts,
        preferred_topic=preferred_topic,
        preferred_clo=preferred_clo,
    )
    questions, _qa = await filter_questions_quality(llm, questions)
    for q in questions:
        if q["type"] == qtype and not _is_duplicate(q, existing_questions):
            return q
    # Prefer a non-similar stem; fall back to any valid question of the right
    # type (exact-text collisions are already filtered via avoid_texts).
    for q in questions:
        if q["type"] == qtype:
            return q
    raise ValueError("The AI could not generate a valid replacement question.")
