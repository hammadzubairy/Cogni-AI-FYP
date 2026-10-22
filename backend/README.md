# Cogni.ai backend

FastAPI + MongoDB backend for the Cogni.ai exam platform. See
`../docs/ARCHITECTURE.md`, `../docs/DATA_MODEL.md` and `../docs/API.md` for
the design contract; this file only covers running it.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit as needed
```

A MongoDB server must be reachable at `MONGO_URI` (defaults to
`mongodb://localhost:27017`).

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017` | |
| `MONGO_DB` | `cogni` | Seeding refuses to run unless this ends with `_dev` or `_demo`, unless `--force` is passed. |
| `JWT_SECRET` | `change-me` | Set a real secret outside local dev. |
| `JWT_EXPIRE_MIN` | `1440` | Token lifetime in minutes. |
| `LLM_PROVIDER` | `mock` | `mock` \| `openai` \| `anthropic`. `mock` needs no API key and costs nothing; every exam-generation, grading and study-assistant call becomes deterministic. |
| `LLM_MODEL` | | Model name/id for the chosen provider, e.g. `gpt-4o-mini` or `claude-sonnet-5-5`. |
| `LLM_API_KEY` | | Never commit a real key. Only `.env` (gitignored) or your shell environment should hold it. |
| `LLM_BASE_URL` | | Optional, OpenAI-compatible providers only. |
| `AI_DETECTOR` | `heuristic` | `heuristic` \| `gptzero`. GPTZero needs `GPTZERO_API_KEY` and falls back to heuristic if the key is missing or the API fails. |
| `GPTZERO_API_KEY` | | Optional. Free-tier key from GPTZero when `AI_DETECTOR=gptzero`. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list; the frontend origin(s) allowed to call the API. |
| `MAX_UPLOAD_MB` | `25` | Default material-upload cap; overridable at runtime via `PUT /api/admin/settings`. |
| `MAX_REQUEST_MB` | `50` | Hard ceiling on any request body (defence in depth, checked before the body is read). Keep this at or above `MAX_UPLOAD_MB`. |

## Test fixture world

```bash
python -m tests.support.world            # refuses unless MONGO_DB ends with _dev/_demo
python -m tests.support.world --force    # load into any database name
python -m tests.support.world --db cogni_dev
```

Lives in `tests/support/world.py` (not part of the app package). Drops and
recreates every collection with the same demo world as the v7 prototype (3
departments, 17 users, 5 classes, 5 materials, 6 exams, a handful of
attempts/requests/notifications). Every fixture-world user's password is
`Test-Passw0rd!`.

## NLP / embeddings (optional but recommended)

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

`trafilatura` (URL materials), `spacy` (FR-05 cleaning), and
`sentence-transformers` (FR-06 semantic chunking + FR-18 similarity) degrade
gracefully to regex / token-overlap fallbacks if the packages or models are
missing. Install them for full FYP quality.

## Running

```bash
uvicorn app.main:app --reload --port 8000
```

The frontend (Vite dev server) proxies `/api/*` to this port. CORS is
restricted to `CORS_ORIGINS`.

## Running with a real LLM key

1. Set `LLM_PROVIDER=openai` or `LLM_PROVIDER=anthropic`.
2. Set `LLM_MODEL` to a model your key can access.
3. Set `LLM_API_KEY`. Never commit it; `.env` is gitignored.
4. Restart the server. Exam generation, written-answer grading and the
   study assistant now call the real provider. One retry is attempted if a
   response isn't valid JSON; a second failure returns `502 LLM_FAILED`.

LLM-backed endpoints (`/api/exams/generate`,
`/api/exams/{id}/questions/{qid}/regenerate`, `/api/materials/{id}/ask`) are
rate-limited to 20 calls/minute per user to bound cost. Login is
rate-limited to 10 attempts/minute per IP.

## Tests

```bash
pytest
```

Tests spin up a FastAPI `TestClient` per test file against
`TEST_MONGO_DB` (default `cogni_test_dev`), reseeding it from scratch each
time via `tests.support.world.main(force=False)`. `LLM_PROVIDER` should stay `mock`
when running tests (the default) so grading/generation stays deterministic.

## End-to-end smoke test

Exercises the full teacher → HOD → teacher → student loop plus every role's
dashboard over real HTTP, against a running server:

```bash
LLM_PROVIDER=mock MONGO_DB=cogni_e2e_dev python -m tests.support.world
LLM_PROVIDER=mock MONGO_DB=cogni_e2e_dev uvicorn app.main:app --port 8000 &
python scripts/e2e_smoke.py
```

Prints `PASS`/`FAIL` per step and exits non-zero if anything failed.

## Known limits

- **No OCR.** PDF text extraction uses `pypdf`; a scanned PDF with no
  selectable text layer is rejected (`400 SCANNED_PDF`), not run through
  OCR.
- **AI-writing detector defaults to heuristic.** Marker phrases, sentence
  length and answer length (v7 `aiProb()`). Set `AI_DETECTOR=gptzero` with
  `GPTZERO_API_KEY` for the GPTZero API; on any failure it falls back to
  the heuristic. Flags are advisory only — never auto-change a grade.
- **English only.** Chunking, keyword grading fallback and the AI-writing
  markers all assume English text.
- **Study assistant retrieval is keyword-based (BM25-style), not semantic.**
  It will miss a paraphrase that shares no vocabulary with the material.
  There is no vector database and no embeddings call.
- **Rate limiting is in-memory per process.** It resets on restart and
  isn't shared across multiple server instances/workers.
