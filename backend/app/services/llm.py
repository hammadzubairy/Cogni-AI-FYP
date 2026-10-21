import asyncio
import json
import logging
import re
import time

from app.core.config import settings
from app.core.logging import log_event

logger = logging.getLogger("app.llm")


class LLMError(Exception):
    """Base error for any LLM failure. Mapped to HTTP 502 {"code": "LLM_FAILED"}."""


class LLMRequestError(LLMError):
    """The request to the provider failed, timed out, or errored."""


class LLMJSONError(LLMError):
    """The provider's response could not be parsed as JSON."""


def _extract_json(text: str) -> dict:
    """Parse the first JSON object found in `text`, stripping Markdown code
    fences first. Raises LLMJSONError if none is found or it doesn't parse."""
    text = (text or "").strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
    raise LLMJSONError("The AI response did not contain a valid JSON object.")


class LLMClient:
    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        """Send a system+user prompt and return a parsed JSON dict.
        Must return parsed JSON or raise LLMError."""
        raise NotImplementedError


def _friendly_llm_error(exc: BaseException) -> str:
    """Turn provider noise into a short message teachers/students can act on."""
    raw = str(exc).strip() or "The AI request failed."
    lower = raw.lower()
    if "413" in raw or "too large" in lower or "request too large" in lower or "context length" in lower:
        return (
            "The source material is too large for one pass. "
            "Try fewer files, a shorter PDF, or select less material and retry."
        )
    if "429" in raw or "rate limit" in lower or "rate_limit" in lower:
        return "The AI service is busy right now. Wait a moment and press Retry."
    if "401" in raw or "403" in raw or "invalid api key" in lower or "unauthorized" in lower:
        return "The AI service is not configured correctly. Ask an admin to check the API key."
    if "timeout" in lower or "timed out" in lower:
        return "The AI took too long to respond. Press Retry — shorter material usually helps."
    # Strip nested JSON blobs that confuse users
    if "{'error'" in raw or '{"error"' in raw or "error code:" in lower:
        return "The AI could not finish this request. Press Retry, or use a smaller document."
    if len(raw) > 180:
        return raw[:180].rsplit(" ", 1)[0] + "…"
    return raw


class OpenAIClient(LLMClient):
    def __init__(self) -> None:
        from openai import AsyncOpenAI

        kwargs: dict = {"api_key": settings.LLM_API_KEY}
        if settings.LLM_BASE_URL:
            kwargs["base_url"] = settings.LLM_BASE_URL
        # OpenRouter ranks apps that send these optional headers.
        if "openrouter.ai" in (settings.LLM_BASE_URL or ""):
            kwargs["default_headers"] = {
                "HTTP-Referer": settings.PUBLIC_BASE_URL or "https://cogni.ai",
                "X-Title": "Cogni.ai",
            }
        self._client = AsyncOpenAI(**kwargs)

    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        try:
            response = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                    response_format={"type": "json_object"},
                ),
                timeout=120,
            )
        except TimeoutError as exc:
            raise LLMRequestError("The AI took too long to respond. Press Retry.") from exc
        except Exception as exc:
            detail = _friendly_llm_error(exc)
            log_event(logger, "llm_provider_error", provider="openai", error=str(exc)[:500])
            raise LLMRequestError(detail) from exc
        content = response.choices[0].message.content or ""
        usage = getattr(response, "usage", None)
        if usage is not None:
            log_event(
                logger,
                "llm_tokens",
                provider="openai",
                prompt_tokens=getattr(usage, "prompt_tokens", None),
                completion_tokens=getattr(usage, "completion_tokens", None),
            )
        return _extract_json(content)

    async def vision_text(
        self,
        prompt: str,
        images_b64: list[str],
        *,
        max_tokens: int = 4000,
        model: str | None = None,
    ) -> str:
        """OCR / multimodal: send page images + prompt, return plain text."""
        model_id = model or settings.LLM_OCR_MODEL or settings.LLM_MODEL
        content: list[dict] = [{"type": "text", "text": prompt}]
        for b64 in images_b64:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                }
            )
        try:
            response = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=model_id,
                    messages=[{"role": "user", "content": content}],
                    max_tokens=max_tokens,
                    temperature=0.1,
                ),
                timeout=180,
            )
        except TimeoutError as exc:
            raise LLMRequestError("OCR timed out. Try a shorter PDF.") from exc
        except Exception as exc:
            detail = _friendly_llm_error(exc)
            log_event(logger, "llm_ocr_error", provider="openai", error=str(exc)[:500])
            raise LLMRequestError(detail) from exc
        return (response.choices[0].message.content or "").strip()


class AnthropicClient(LLMClient):
    def __init__(self) -> None:
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=settings.LLM_API_KEY)

    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        json_system = (
            system
            + "\n\nRespond with a single JSON object only. No prose, no "
            "Markdown code fences, nothing before or after the object."
        )
        try:
            response = await asyncio.wait_for(
                self._client.messages.create(
                    model=settings.LLM_MODEL,
                    system=json_system,
                    messages=[{"role": "user", "content": user}],
                    max_tokens=max_tokens,
                    temperature=temperature,
                ),
                timeout=60,
            )
        except TimeoutError as exc:
            raise LLMRequestError("The Anthropic request timed out.") from exc
        except Exception as exc:
            raise LLMRequestError("The Anthropic request failed.") from exc
        content = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        usage = getattr(response, "usage", None)
        if usage is not None:
            log_event(
                logger,
                "llm_tokens",
                provider="anthropic",
                prompt_tokens=getattr(usage, "input_tokens", None),
                completion_tokens=getattr(usage, "output_tokens", None),
            )
        return _extract_json(content)


class MockLLM(LLMClient):
    """Deterministic stand-in used when LLM_PROVIDER=mock and in all tests.
    Reads a JSON payload embedded in `user` (see prompts/exam_generation.py)
    rather than a free-text prompt, so it stays deterministic."""

    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        payload = _extract_json(user)
        mode = payload.get("mode")
        if mode == "grade":
            return self._grade(payload)
        if mode == "ask":
            return self._ask(payload)
        return self._generate(payload)

    def _generate(self, payload: dict) -> dict:
        chunks = payload.get("chunks") or [
            {"idx": 0, "heading": "General", "text": "General course material."}
        ]
        counts = payload.get("counts") or {}
        clos = payload.get("clos") or ["CLO-1"]
        avoid = set(payload.get("avoid_texts") or [])
        preferred_topic = payload.get("preferred_topic")
        preferred_clo = payload.get("preferred_clo")
        bloom_cycle = ["Understand", "Analyze", "Apply", "Evaluate", "Remember"]

        questions = []
        n = 0
        # Salt from avoid-list size so regenerate/add never collides with an
        # existing stem when LLM_PROVIDER=mock (stems used to be identical for
        # the same heading, which made +MCQ/+Short/+Essay fail on seeded exams).
        salt = len(avoid)
        for qtype, count in counts.items():
            produced = 0
            attempts = 0
            while produced < count and attempts < count + 32:
                chunk = chunks[n % len(chunks)]
                clo = preferred_clo or clos[n % len(clos)]
                bloom = bloom_cycle[n % len(bloom_cycle)]
                heading = preferred_topic or chunk.get("heading") or f"Topic {chunk['idx']}"
                question = self._build_question(
                    qtype, bloom, heading, clo, chunk, n + salt, chunks
                )
                if question["text"] not in avoid:
                    questions.append(question)
                    avoid.add(question["text"])
                    produced += 1
                n += 1
                attempts += 1
        return {"questions": questions}

    def _build_question(
        self, qtype: str, bloom: str, heading: str, clo: str, chunk: dict, n: int, chunks: list
    ) -> dict:
        base = {
            "type": qtype,
            "bloom": bloom,
            "topic": heading,
            "clo": clo,
            "source_chunk_idx": chunk["idx"],
        }
        snippet = _first_sentence(chunk["text"])
        # Variant index keeps each stem unique for avoid/dedupe checks.
        variant = n + 1
        if qtype == "MCQ":
            correct = snippet or f"A key idea from {heading}."
            other_chunks = [c for c in chunks if c["idx"] != chunk["idx"]] or chunks
            candidates = [
                _first_sentence(other_chunks[(n + 1) % len(other_chunks)]["text"]),
                _first_sentence(other_chunks[(n + 2) % len(other_chunks)]["text"]),
                f"A common misconception about {heading} (case {variant}).",
            ]
            seen = {correct}
            distractors = []
            for c in candidates:
                if c not in seen:
                    distractors.append(c)
                    seen.add(c)
            while len(distractors) < 3:
                distractors.append(
                    f"An unrelated statement about {heading} #{len(distractors)}-{variant}."
                )
            correct_index = n % 4
            options = [None] * 4
            options[correct_index] = correct
            j = 0
            for i in range(4):
                if options[i] is None:
                    options[i] = distractors[j]
                    j += 1
            base.update(
                {
                    "text": (
                        f'Item {variant} on {heading}: the source begins "{snippet}". '
                        f"Which statement is correct?"
                    ),
                    "options": options,
                    "answer_index": correct_index,
                }
            )
        else:
            keywords = _keywords_from_text(chunk["text"])
            if qtype == "Short":
                prompt = (
                    f'Item {variant} on {heading}: the source begins "{snippet}". '
                    f"In your own words, explain the key idea."
                )
            else:
                prompt = (
                    f'Item {variant} on {heading}: the source begins "{snippet}". '
                    f"Critically evaluate and justify your position on this idea."
                )
            base.update(
                {
                    "text": prompt,
                    "model_answer": snippet or f"{heading} is explained in the material.",
                    "keywords": keywords,
                }
            )
        return base

    def _ask(self, payload: dict) -> dict:
        chunks = payload.get("chunks") or []
        if not chunks:
            return {"answer": "I don't have any material to answer from."}
        text = chunks[0].get("text", "")
        heading = chunks[0].get("heading") or "the material"
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]
        stem = sentences[0] if sentences else f"Key ideas from {heading}."
        question = (payload.get("question") or "").lower()
        if any(w in question for w in ("practice", "quiz me", "test me", "exam-style")):
            return {
                "answer": (
                    "Practice question\n\n"
                    f"Using ideas from {heading}, answer the following.\n\n"
                    f"a. Explain the main point in your own words: {stem}\n"
                    "b. Give one concrete example from the material that supports your explanation.\n\n"
                    "Good answer\n\n"
                    f"- Restate the core idea from {heading} clearly.\n"
                    "- Tie the example back to that idea with a short justification."
                )
            }
        answer = " ".join(sentences[:2]).strip()
        if len(sentences) > 1:
            answer = f"{sentences[0]}\n\n{sentences[1]}"
        return {"answer": answer or "I don't have any material to answer from."}

    def _grade(self, payload: dict) -> dict:
        answer = (payload.get("answer") or "").lower()
        keywords = payload.get("keywords") or []
        max_marks = payload.get("max_marks", 10)
        words = [w for w in answer.split() if w]
        hit, miss = [], []
        for k in keywords:
            variants = [v.lower() for v in k.get("variants", [])]
            (hit if any(v in answer for v in variants) else miss).append(k.get("label"))
        coverage = len(hit) / len(keywords) if keywords else 0.0
        len_factor = min(1.0, len(words) / 40)
        similarity = round((coverage * 0.8 + len_factor * 0.2) * 100)
        score = round(max_marks * coverage * 2) / 2
        reason = "Missing: " + "; ".join(miss) if miss else "Covers every key point"
        return {
            "score": score,
            "similarity": similarity,
            "key_points_hit": hit,
            "key_points_missed": miss,
            "reason": reason,
        }


def _first_sentence(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    return parts[0][:200]


_STOPWORDS = {
    "which", "their", "there", "about", "these", "those", "where", "after",
    "before", "while", "because", "should", "would", "could", "other",
    "every", "through", "using", "between", "within", "without",
}


def _keywords_from_text(text: str) -> list[dict]:
    words = re.findall(r"[A-Za-z][A-Za-z\-]{4,}", text or "")
    picked: list[str] = []
    for w in words:
        lw = w.lower()
        if lw in _STOPWORDS or lw in picked:
            continue
        picked.append(lw)
        if len(picked) >= 6:
            break
    while len(picked) < 2:
        picked.append(f"concept{len(picked)}")
    return [{"label": w.capitalize(), "variants": [w]} for w in picked]


async def call_json(
    client: LLMClient, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
) -> dict:
    """Wraps json_complete with one retry on invalid JSON, telling the model
    to return valid JSON only. Raises LLMError (mapped to 502 LLM_FAILED)."""
    provider = type(client).__name__
    start = time.monotonic()
    try:
        result = await client.json_complete(
            system, user, max_tokens=max_tokens, temperature=temperature
        )
    except LLMJSONError:
        retry_user = user + "\n\nReturn valid JSON only."
        try:
            result = await client.json_complete(
                system, retry_user, max_tokens=max_tokens, temperature=temperature
            )
        except LLMError as exc:
            log_event(
                logger,
                "llm_call_failed",
                provider=provider,
                latency_ms=round((time.monotonic() - start) * 1000, 1),
            )
            raise LLMError("The AI service returned invalid JSON twice in a row.") from exc
    except LLMError:
        log_event(
            logger,
            "llm_call_failed",
            provider=provider,
            latency_ms=round((time.monotonic() - start) * 1000, 1),
        )
        raise
    log_event(
        logger,
        "llm_call",
        provider=provider,
        latency_ms=round((time.monotonic() - start) * 1000, 1),
    )
    return result


def get_llm_client() -> LLMClient:
    provider = (settings.LLM_PROVIDER or "").strip().lower()
    if provider == "mock":
        return MockLLM()
    # OpenRouter / Groq / any OpenAI-compatible endpoint via LLM_BASE_URL
    if provider in ("openai", "groq", "openrouter"):
        return OpenAIClient()
    if provider == "anthropic":
        return AnthropicClient()
    raise NotImplementedError(f"LLM_PROVIDER={settings.LLM_PROVIDER!r} is not implemented.")
