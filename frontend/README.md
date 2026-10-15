# Cogni.ai frontend

React 18 + Vite UI for the Cogni.ai exam platform. Layout, class names and
copy match `reference/Cogni.ai-v7.html`. Data comes from the FastAPI backend
under `/api` (proxied in dev). `localStorage` is used only for the auth JWT
and the theme preference.

## Setup

```bash
# from repo root — backend first
cd backend
cp .env.example .env   # if needed
# set MONGO_URI, JWT_SECRET, LLM_PROVIDER=mock
python -m tests.support.world
uvicorn app.main:app --reload --port 8000

# frontend
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `http://localhost:8000`.

### Env

Frontend has no secrets. Optional Vite env:

| Variable | Default | Purpose |
|----------|---------|---------|
| (none required) | — | API base is `/api` via the Vite proxy |

Backend env lives in `backend/.env` (see `backend/.env.example`).

### First run vs fixture world

Empty database: open `/setup` (or `python -m app.cli create-admin`).

Developers/CI may load a throwaway fixture DB:

```bash
cd backend && python -m tests.support.world --db cogni_demo_dev --force
```

Fixture password: **`Test-Passw0rd!`**. Sign in with email/password on `/login`.

## Scripts

```bash
npm run dev      # Vite dev server
npm run build    # production build (must pass with no errors)
npm run preview  # serve the build
npm run test:e2e        # Playwright Chromium suite (seeds + starts API/Vite)
npm run test:e2e:ui     # Playwright UI mode
npm run test:e2e:headed # headed browser
```

### Playwright E2E

UI tests live in `e2e/`. They exercise every portal smoke path plus the full
README demo loop (HOD request → teacher generate → HOD approve → publish →
student attempt → release → feedback → admin activity log).

Prerequisites: MongoDB reachable with the same `MONGO_URI` as `backend/.env`,
and `backend/.venv` with app deps installed.

```bash
# once per machine
npx playwright install chromium

# run (global setup seeds MONGO_DB=cogni_playwright with --force,
# then starts uvicorn :8000 and Vite :5173 unless already running)
npm run test:e2e
```

Override the DB name with `PLAYWRIGHT_MONGO_DB=…` if needed. Set `CI=1` to
disable `reuseExistingServer` and force fresh webServer processes. The
Playwright webServer raises `LOGIN_RATE_LIMIT_MAX` / `LLM_RATE_LIMIT_MAX` so
repeated demo logins do not hit the production 10/min login cap.

## Routes (by role)

- **Public:** `/`, `/setup`, `/login`, `/register`, `/forgot`, `/reset/:token`,
  `/change-password`
- **Admin:** `/app/admin`, `/departments`, `/departments/:id/head`, `/users`,
  `/users/new`, `/settings` (`?tab=activity`)
- **HOD:** `/app/hod`, `/requests`, `/approvals`, `/approvals/:id`,
  `/analytics`, `/policy`
- **Teacher:** `/app/teacher`, `/classes`, `/classes/:id`, `/materials`,
  `/exams`, `/exams/new`, `/exams/:id`, `/exams/:id/results`,
  `/attempts/:id`, `/flags`
- **Student:** `/app/student`, `/classes`, `/classes/:id`, `/exams`,
  `/exams/:id/take`, `/attempts/:id/done`, `/results`,
  `/attempts/:id/feedback`, `/study`

## Known limitations

- **English only** — UI and LLM prompts assume English.
- **PDFs must contain real text** — scanned image-only PDFs are rejected (no OCR).
- **AI-writing flag is a heuristic** — advisory only; never auto-penalises.
- **No proctoring** — timed exams, but no webcam / lock-down browser.
- **Email** — in-app notifications; password-reset email needs SMTP (else
  ConsoleMailer in development / admin reset).
