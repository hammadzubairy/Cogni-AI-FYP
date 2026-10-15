"""Split extracted text into roughly 600-900 word chunks, cut only on
paragraph boundaries, keeping page number and a heading guess."""

import re

MIN_WORDS = 600
MAX_WORDS = 900

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


def chunk_pages(pages: list[dict]) -> list[dict]:
    """pages: [{page, text}] (page may be None, e.g. for pasted text).
    Returns [{idx, page, heading, text}]."""
    blocks = []
    for p in pages:
        blocks.extend(_paragraphs(p["text"], p.get("page")))

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
        if not cur_paras:
            cur_heading = heading
            cur_page_start = page
        cur_page_end = page
        cur_paras.append(para)
        cur_words += len(para.split())

    flush()
    return chunks
