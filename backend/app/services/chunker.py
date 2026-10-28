"""Split extracted text into roughly 600-900 word chunks.

FR-06: prefer semantic boundaries — embed sentences, split where adjacent
cosine similarity drops, then pack to the word budget. Falls back to plain
paragraph packing when embeddings are unavailable.
"""

from __future__ import annotations

import re

from app.services.embeddings import adjacent_cosine_scores
from app.services.nlp import split_sentences

MIN_WORDS = 600
MAX_WORDS = 900
# Split when adjacent-sentence cosine falls below this relative to a local mean.
SEMANTIC_DROP_RATIO = 0.72
ABS_SIM_FLOOR = 0.35

_NUMBERED_HEADING = re.compile(r"^\d+(\.\d+)*\s+\S")


def _is_heading(line: str) -> bool:
    line = line.strip()
    if not line or len(line) > 80 or line[-1] in ".!?":
        return False
    words = line.split()
    if not words or len(words) > 12:
        return False
    if _NUMBERED_HEADING.match(line):
        return True
    if line.isupper():
        return True
    return all(w[0].isupper() or not w[0].isalpha() for w in words)


def _paragraphs(text: str, page: str | int | None) -> list[tuple]:
    paras = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    blocks = []
    for para in paras:
        first_line = para.split("\n", 1)[0]
        heading = first_line if _is_heading(first_line) else None
        blocks.append((page, heading, para))
    return blocks


def _pack_blocks(blocks: list[tuple]) -> list[dict]:
    """Paragraph-boundary packing used as fallback / final packer."""
    chunks: list[dict] = []
    cur_paras: list[str] = []
    cur_words = 0
    cur_heading: str | None = None
    cur_page_start = None
    cur_page_end = None

    def flush():
        nonlocal cur_paras, cur_words, cur_heading, cur_page_start, cur_page_end
        if not cur_paras:
            return
        if cur_page_start is None:
            page_label = None
        elif cur_page_start == cur_page_end:
            page_label = str(cur_page_start)
        else:
            page_label = f"{cur_page_start}-{cur_page_end}"
        chunks.append(
            {
                "idx": len(chunks),
                "page": page_label,
                "heading": cur_heading,
                "text": "\n\n".join(cur_paras),
            }
        )
        cur_paras = []
        cur_words = 0
        cur_heading = None
        cur_page_start = None
        cur_page_end = None

    for page, heading, para in blocks:
        if cur_words >= MIN_WORDS:
            flush()
        words = para.split()
        # An unbroken run too long to share a chunk (e.g. text with no sentence
        # punctuation) is split so chunks stay near MAX_WORDS.
        while cur_words + len(words) > MAX_WORDS * 1.2:
            room = MAX_WORDS - cur_words
            if room <= 0:
                flush()
                continue
            if not cur_paras:
                cur_heading = heading
                cur_page_start = page
            cur_page_end = page
            cur_paras.append(" ".join(words[:room]))
            cur_words += room
            words = words[room:]
            flush()
        if not words:
            continue
        if not cur_paras:
            cur_heading = heading
            cur_page_start = page
        cur_page_end = page
        cur_paras.append(para if cur_words == 0 and len(words) == len(para.split()) else " ".join(words))
        cur_words += len(words)

    flush()
    return chunks


def _semantic_segments(text: str) -> list[str]:
    """Split `text` into topic-ish segments using embedding similarity drops."""
    sentences = split_sentences(text)
    if len(sentences) < 4:
        return [text] if text.strip() else []

    scores = adjacent_cosine_scores(sentences)
    if not scores:
        return [text]

    mean = sum(scores) / len(scores)
    threshold = max(ABS_SIM_FLOOR, mean * SEMANTIC_DROP_RATIO)

    segments: list[str] = []
    buf: list[str] = [sentences[0]]
    for i, score in enumerate(scores):
        # Boundary when similarity drops and the current buffer is substantial.
        buf_words = sum(len(s.split()) for s in buf)
        if score < threshold and buf_words >= 80:
            segments.append(" ".join(buf).strip())
            buf = [sentences[i + 1]]
        else:
            buf.append(sentences[i + 1])
        # Hard cap: flush oversized buffers even without a drop.
        if sum(len(s.split()) for s in buf) >= MAX_WORDS:
            segments.append(" ".join(buf).strip())
            buf = []
    if buf:
        segments.append(" ".join(buf).strip())
    return [s for s in segments if s]


def chunk_pages(pages: list[dict]) -> list[dict]:
    """pages: [{page, text}] (page may be None, e.g. for pasted text).
    Returns [{idx, page, heading, text}]."""
    # Try semantic segmentation across the full document first.
    full_text = "\n\n".join(p.get("text") or "" for p in pages).strip()
    if full_text:
        try:
            segments = _semantic_segments(full_text)
        except Exception:
            segments = []
        if len(segments) >= 2:
            # Re-attach a best-effort page + heading from original paragraph scan.
            para_blocks = []
            for p in pages:
                para_blocks.extend(_paragraphs(p["text"], p.get("page")))
            heading_by_prefix = []
            for page, heading, para in para_blocks:
                if heading:
                    heading_by_prefix.append((para[:80], page, heading))

            blocks: list[tuple] = []
            for seg in segments:
                page = pages[0].get("page") if len(pages) == 1 else None
                heading = None
                for prefix, p_page, p_heading in heading_by_prefix:
                    if prefix and prefix in seg[:200]:
                        page = p_page
                        heading = p_heading
                        break
                blocks.append((page, heading, seg))
            return _pack_blocks(blocks)

    # Fallback: plain paragraph packing (original behaviour).
    blocks = []
    for p in pages:
        blocks.extend(_paragraphs(p["text"], p.get("page")))
    return _pack_blocks(blocks)
