# FR bug audit (24 Oct 2026)

## Fixed in this pass

| Severity | FR | Bug | Fix |
|----------|----|-----|-----|
| High | FR-18 | Keyword coverage floored “semantic similarity” and was also weighted as key concepts → grade inflation / sim always ~100% | Similarity = embedding cosine only; keywords stay in the 20% channel |
| High | FR-20 | GPTZero `mixed` class ignored → AI answers scored ~0% | Parse `1-human` or `ai+mixed` |
| Medium | FR-11 | Quality filter only rejected `pass is False` with int index → string `"false"` / `"0"` kept | Coerce index; treat falsey pass strings as fail |
| Medium | FR-05 | Readable spaCy path stripped URLs/emails from stored text | Keep URLs/emails unless `for_embedding=True` |
| Low | FR-04 | `Content-Type` check case-sensitive | Normalize media type |
| Low | FR-20 UI | Attempt review always said “heuristic” | Use `detail.ai_detector` |
| Low | FR-04 | trafilatura unpinned | Pin `trafilatura>=2.3` |

## Still open (not fixed this pass)

| Severity | FR | Issue | Why deferred |
|----------|----|-------|--------------|
| High | FR-05/06/18 | spaCy + MiniLM not installed in this environment → fallback quality | Needs disk / HF API swap for Vercel |
| High | FR-06 | spaCy 900k sentence window can drop tail of huge docs on semantic path | Only bites with spaCy + very large materials |
| Medium | all | Blocking spaCy / MiniLM / GPTZero HTTP on async event loop | Needs `asyncio.to_thread` across services |
| Medium | FR-04 | Multi-file upload partial success → duplicate on retry | Frontend UX |
| Medium | FR-06 | Semantic chunks often lose PDF page labels | Mapping work |
| Medium | FR-05 | Empty NLP clean silently restores raw pages | Edge case |

## Not bugs

- Regex / overlap / paragraph fallbacks when ML packages missing (documented).
- Mock quality filter always passes (by design).
- AI flag advisory-only (project rule).
- Teacher override path OK.
