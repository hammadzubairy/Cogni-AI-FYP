# Cogni.ai

AI-assisted exam platform for Admin, HOD, Teacher and Student roles.

Teachers upload course material and the LLM drafts an exam (MCQ, short answer,
essay — tagged by Bloom level, topic and course learning outcome). The teacher
edits it, the HOD approves or returns it with a comment (if required by
settings), and the teacher publishes it. Students take a timed exam: MCQs are
auto-graded and written answers are graded by the LLM against a model answer.
Each written answer also gets an AI-writing likelihood flag for the teacher to
review — it never changes a grade automatically. The teacher overrides scores
and releases results; students see topic-by-topic feedback and a study plan.
Every action notifies the relevant other role and is written to an activity
log that Admin can read.

`reference/Cogni.ai-v7.html` is the source of truth for layout, copy, page
list, role navigation and business rules. This repo implements that product
against a real FastAPI + MongoDB backend and a React UI.

## Stack

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, PyMongo async API, PyJWT,
  bcrypt, pypdf, httpx, pytest + pytest-asyncio.
- **Frontend:** React 18, Vite, JavaScript (JSX), React Router v6, plain
  fetch wrapper. No UI library.
- **DB:** MongoDB.
- **LLM:** provider-agnostic interface (`openai` | `anthropic` | `mock`).

## First run (empty database)

```bash
# Mongo (example)
docker start cogni-mongo 2>/dev/null || \
  docker run -d --name cogni-mongo --ulimit nofile=65536:65536 -p 27017:27017 mongo:7

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set APP_ENV=development, a strong JWT_SECRET, MONGO_URI.
# LLM: mock for local canned drafts, or OpenRouter via openai + LLM_BASE_URL (see .env.example).
uvicorn app.main:app --reload --port 8000

# Frontend (other terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 → **/setup** creates the first admin (and settings).
Or: `python -m app.cli create-admin --name "…" --email "…"`.

Existing databases: `python -m app.cli migrate`

### Env (backend)

See `backend/.env.example`: `APP_ENV`, `MONGO_URI`, `MONGO_DB`, `JWT_SECRET`
(≥32 chars in production), `LLM_*`, `CORS_ORIGINS`, SMTP_*, lockout settings.

Production refuses to start with a weak JWT secret, `LLM_PROVIDER=mock`,
CORS `*`, or a throwaway `MONGO_DB` name (`*_dev` / `*_demo` / `*_test`).

## Test fixture world (developers / CI only)

Not part of the runtime app. Loads sample users into a throwaway DB:

```bash
cd backend && python -m tests.support.world --db cogni_demo_dev --force
```

Password for fixture users: **`Test-Passw0rd!`**

## Tests

```bash
cd backend && pytest
cd frontend && npm run build
cd frontend && CI=1 npm run test:e2e   # Playwright; needs Mongo + Chromium
```

## Deploy checklist

- `APP_ENV=production`, strong `JWT_SECRET`, real LLM credentials
- HTTPS, explicit `CORS_ORIGINS`, Mongo auth + backups
- SMTP for password-reset email (otherwise admin reset is the fallback)
- Rotate `JWT_SECRET` if it was ever committed or shared

## Deploy on Vercel (frontend + backend)

Use **two Vercel projects** from the same GitHub repo (recommended).

### A. MongoDB Atlas (required)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Network Access → allow `0.0.0.0/0` (or Vercel IPs).
3. Database Access → create a user.
4. Connect → copy the `mongodb+srv://…` URI.

### B. Backend project

1. [vercel.com/new](https://vercel.com/new) → import this repo.
2. **Root Directory:** `backend`
3. Framework: FastAPI (auto-detected via `main.py` / `pyproject.toml`).
4. Environment variables:

| Name | Value |
|---|---|
| `APP_ENV` | `production` |
| `MONGO_URI` | Atlas URI |
| `MONGO_DB` | `cogni` (not `*_dev` / `*_test`) |
| `JWT_SECRET` | ≥32 random chars |
| `LLM_PROVIDER` | `openai` |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` |
| `LLM_MODEL` | `minimax/minimax-m3.1-flash:free` |
| `LLM_OCR_MODEL` | `nvidia/nemotron-3.5-super-vl:free` |
| `LLM_API_KEY` | your OpenRouter key |
| `CORS_ORIGINS` | frontend URL (set after step C) |
| `PUBLIC_BASE_URL` | frontend URL |

5. Deploy → open `https://<backend>.vercel.app/api/health` → `{"status":"ok"}`.

`backend/vercel.json` sets `maxDuration` to 60s for exam generation.

### C. Frontend project

1. Another Vercel project → same repo.
2. **Root Directory:** `frontend`
3. Build: `npm run build` · Output: `dist`
4. Env: `VITE_API_BASE=https://<backend>.vercel.app` (no trailing slash).
5. Deploy → copy the frontend URL.
6. Go back to the **backend** project → set `CORS_ORIGINS` and `PUBLIC_BASE_URL` to that frontend URL → Redeploy backend.

### D. First admin

Open the frontend → `/setup` → create the first admin.

### Limits to know

- Vercel Hobby function timeout is shorter; Pro allows up to 60–300s depending on plan.
- Large PDF uploads may hit body-size limits; keep under ~4.5 MB on Hobby or raise limits on Pro.
- Cold starts can add a few seconds on the first request after idle.

## Purge leftover demo users

```bash
cd backend
python -m app.cli purge-demo --dry-run
python -m app.cli purge-demo --yes --db-name <exact-db-name>
```

Never run `--yes` against a database you have not named explicitly.

## Known limitations

- Student email verification requires working mail delivery (`SMTP_*`); without SMTP the link is printed by ConsoleMailer (dev/test)
- JWT stored in `localStorage`
- AI-writing detector is heuristic / advisory only
- English-only product copy and prompts
- Scanned PDFs use OpenRouter multimodal OCR (first pages); very large scans may still need paste-notes
- Login IP rate limit is in-memory per process
- In-app notifications; password-reset and verify emails when SMTP is set
- Public signup is student-only; wireframe demo click-to-login accounts are not in the product

## Docs

`CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API.md`,
`docs/REAL_WORKFLOW.md`, `docs/REAL_WORKFLOW_AUDIT.md`,
`docs/REAL_WORKFLOW_REPORT.md`.
