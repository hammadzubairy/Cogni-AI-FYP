# Real-workflow audit

**Repo:** `saadkhantareen/Cogni-AI` @ `pre-real-workflow` / `b417049`  
**Date:** 2026-10-15  
**Python:** 3.12.3 · **Node:** v24.14.0 · **Mongo:** `cogni-mongo` (mongo:7)

## Plain-English summary

**What is real**
- Exam/attempt/grade/flag/notification/activity data lives in Mongo via FastAPI.
- Frontend stores only JWT + theme in `localStorage`.
- Role and ownership checks are enforced server-side on non-public routes.
- Backend suite (154 pass / 2 skip) and Playwright demo-loop exercise real HTTP/UI paths with `LLM_PROVIDER=mock`.

**What is fake / demo**
- Public `/api/auth/demo-accounts`, shared password `demo123`, one-click login picker.
- “Demo mode” banner, account switcher, Landing/Settings demo copy, seed-only world.
- Fabricated pipeline step timings; hardcoded “Fall 2026” / UMT-style emails/names.
- Indexes + settings document only created by seed (empty DB is unsafe / fail-open).

**What is missing**
- First-admin `/setup`, forced password change, forgot/reset, student self-signup.
- Production env guards, SMTP mailer, per-email lockout, token versioning.
- Department/institution/term on `/me` (shell depends on demo-accounts for labels).
- Safe empty-database journey and a purge path for leftover demo users.

---

## Phase 0 — Baseline

| Check | Result |
|-------|--------|
| `pytest -q` (backend) | **154 passed, 2 skipped, 0 failed** in **291 s** (156 collected) |
| `npm run build` (frontend) | **pass** (~0.4 s), 0 errors |
| Mongo | `cogni-mongo` Up, ping ok |
| Commit policy | **No commits** (user rule + TEST_REPORT decision 7). Phase file lists go in `REAL_WORKFLOW_REPORT.md`. |
| Tag | `git tag pre-real-workflow` at `b417049` |

---

## Known findings (verified)

| ID | Verdict | Evidence | Fix phase |
|----|---------|----------|-----------|
| F01 Public demo-accounts | **CONFIRMED** | `backend/app/routers/auth.py:47` `GET /demo-accounts`; `services/auth.py` `list_demo_accounts` | 3 |
| F02 DEMO_PASSWORD on create/reset | **CONFIRMED** | `services/users.py:8,40,121` `DEMO_PASSWORD = "demo123"` | 3 |
| F03 Frontend demo UX | **CONFIRMED** | `AppShell.jsx:16,128,194,260,268,375`; `Login.jsx:17,51,114-218`; `Landing.jsx:75+`; `Settings.jsx:250`; `PipelineSteps.jsx:56`; many pages call `getDemoAccounts()` | 4 |
| F04 Seed in app package | **CONFIRMED** | `backend/app/seed.py` (~681 lines); used by tests + Playwright | 3/F |
| F05 Indexes not in lifespan | **CONFIRMED** | `core/db.py:32-46` docstring + `lifespan` only connects (48-53) | 3 |
| F06 Settings fail-open → approval none | **CONFIRMED** | `services/settings.py:8-11` returns `{}`; `services/exams.py:60` `settings_doc.get("approval", "none")` | 3 |
| F07 Weak defaults | **CONFIRMED** | `core/config.py` / `.env.example`: `JWT_SECRET=change-me`, `LLM_PROVIDER=mock` | 3 |
| F08 No setup/signup/reset | **CONFIRMED** | No `/setup` router; `test_auth_security.py` skipped signup-absent; no forgot/reset routes | 3–4 |
| F09 Tests/E2E depend on seed + demo123 | **CONFIRMED** | `tests/conftest.py` reseeds; `e2e/global-setup.js` `python -m app.seed --force`; `e2e/helpers/auth.js` DEMO personas | 3/5 |
| F10 In-memory rate limit only | **CONFIRMED** | `core/ratelimit.py` process-local; no per-email lockout | 3 |
| F11 No dept/institution/term on /me | **CONFIRMED** | Login/`me` shape lacks `dept_name` / institution; shell fetches demo-accounts (`AppShell.jsx:124-137`) | 3–4 |

### Extra findings

| ID | Item | Verdict | Evidence | Fix |
|----|------|---------|----------|-----|
| X01 | Class `section` hardcoded Fall 2026 on create | HARDCODED | `services/classes.py:64` | 3 (use settings `current_term`) |
| X02 | Many pages fetch demo-accounts only for name maps | PARTIAL | student/teacher/hod pages | 4 (use API-enriched names) |
| X03 | Admin UI copy still says demo123 | HARDCODED | `Users.jsx`, `AddStaff.jsx` | 4 |
| X04 | `LLM_PROVIDER=mock` is intentional for tests | KEEP in test | config / Playwright | 3 guards production only |

---

## CHECK 1 — Static scan (runtime)

| Pattern | Hits (sample) | Action |
|---------|---------------|--------|
| `demo123` / `DEMO_PASSWORD` | users.py, Login, AppShell, Users, AddStaff, seed | **REMOVE** |
| `demo-accounts` / `getDemoAccounts` | auth router, api/index.js, AppShell, many pages | **REMOVE** |
| Demo mode / Switch demo / Open the demo | AppShell, Landing, Settings | **REMOVE** |
| `Fall 2026` | AppShell, Analytics, classes.py, seed | **REPLACE** with `current_term` |
| `@umt.edu.pk` / person names | Login placeholders, ClassDetail hint, Landing, seed | **REPLACE** placeholders; seed → test world only |
| `Math.random` timings | PipelineSteps.jsx:56 | **REMOVE** fabricated durations |
| `app.seed` | seed module, conftest, Playwright | **MOVE** to `tests/support/world.py` |
| Token/theme localStorage | auth | **KEEP** |
| `LLM_PROVIDER=mock` | llm.py MockLLMClient | **KEEP** for APP_ENV=test/dev; **GUARD** in production |

---

## CHECK 2 — Endpoint tracing (summary)

| Frontend API | Backend | Source |
|--------------|---------|--------|
| Most CRUD under `/api/*` | matching routers | **REAL** Mongo |
| `getDemoAccounts` | `GET /auth/demo-accounts` | **STATIC** (DB users filtered for demo list) — remove |
| Login / me / dashboards / exams / attempts | services | **REAL** |
| LLM generate/grade | `services/llm.py` | **MOCK** when provider=mock; **REAL** when openai/anthropic |

Backend routes not used by frontend: some admin/HOD analytics edges may be UI-incomplete; will re-check after Phase 4. No critical orphan calls found for core loop.

---

## CHECK 3 — Empty-database crawl

Deferred to Phase 5 `fresh-install.spec.js` (requires setup endpoints from Phase 3). Pre-change expectation: empty DB without seed → no indexes (F05), approval fail-open (F06), no admin → cannot use UI.

Smoke performed: Mongo ping ok; empty-DB journey **not** runnable until Phase 3.

---

## CHECK 4 — Mutate-and-observe

Deferred to post–Phase 4 verification (needs real settings/institution fields). Pre-change: class/exam title edits via API already reflected in UI (REAL); term/institution hardcodes do not change with Mongo (HARDCODED).

---

## CHECK 5 — Security / config

| Item | Verdict |
|------|---------|
| JWT_SECRET default `change-me` | UNSAFE default |
| LLM mock default | OK for dev; unsafe if mistaken for prod |
| Public demo-accounts | Information disclosure |
| Shared password | Critical |
| Indexes only via seed | Data integrity risk |
| Settings `{}` → approval `none` | Authorization/policy fail-open |
| Rate limit in-memory | PARTIAL (document as limitation) |

---

## Counts (before)

| Verdict | Count (runtime-facing items in table) |
|---------|----------------------------------------|
| REAL | ~8 (core loop data path) |
| HARDCODED | ~12 |
| MOCK | 1 (LLM provider default + PipelineSteps fake timings) |
| PARTIAL | ~4 |
| CONFIRMED known findings | 11/11 |
