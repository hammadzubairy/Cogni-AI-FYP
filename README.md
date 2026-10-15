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
# Set APP_ENV=development, a strong JWT_SECRET, MONGO_URI, LLM_PROVIDER=mock
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

## Purge leftover demo users

```bash
cd backend
python -m app.cli purge-demo --dry-run
python -m app.cli purge-demo --yes --db-name <exact-db-name>
```

Never run `--yes` against a database you have not named explicitly.

## Known limitations

- No email verification for student signup
- JWT stored in `localStorage`
- AI-writing detector is heuristic / advisory only
- English-only product copy and prompts
- No OCR for scanned PDFs
- Login IP rate limit is in-memory per process
- In-app notifications; email only for password reset when SMTP is set

## Docs

`CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API.md`,
`docs/REAL_WORKFLOW.md`, `docs/REAL_WORKFLOW_AUDIT.md`,
`docs/REAL_WORKFLOW_REPORT.md`.
