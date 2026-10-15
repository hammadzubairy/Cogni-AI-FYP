# Real-workflow conversion report

**Tag:** `pre-real-workflow` (`b417049`)  
**Commits:** none (repo rule / TEST_REPORT decision 7 — changes left uncommitted)  
**Date:** 2026-10-15

## Decisions

1. **No git commits** during this mission (user rule + prior TEST_REPORT policy).
2. **Default `APP_ENV=production`** so a forgotten env var is the safe case; tests set `APP_ENV=test`.
3. **Fixture world** lives in `tests/support/world.py` with `TEST_PASSWORD=Test-Passw0rd!`; `app/seed.py` deleted.
4. **Approval fail-open fixed** to merged default `major` (never `none` from `{}`).
5. **Demo switcher / public demo-accounts removed**; Playwright logs in via email/password.
6. **purge-demo** remains dry-run by default; never executed against the configured `.env` DB in this run.
7. **Placeholders** like “e.g. Autumn term” kept; banned string `Fall 2026` removed from runtime UI.

## BEFORE vs AFTER (known findings)

| ID | Before | After |
|----|--------|-------|
| F01 demo-accounts | Public list | **Removed** |
| F02 DEMO_PASSWORD | create/reset → demo123 | **Temp password once** + must_change_password |
| F03 Frontend demo UX | Banner, switcher, landing | **Removed**; setup/login/register/forgot/reset/change-password |
| F04 app seed | `app/seed.py` | **`tests/support/world.py` only** |
| F05 indexes | Seed-only | **Lifespan `create_indexes()`** |
| F06 settings fail-open | `{}` → approval none | **Merged DEFAULTS; approval major** |
| F07 weak defaults | change-me / mock | **Prod guards**; `.env.example` updated |
| F08 setup/signup/reset | Missing | **Implemented** (API + UI) |
| F09 tests/e2e seed | `app.seed` + demo123 | **world + Test-Passw0rd!**; Playwright auth updated |
| F10 lockout | IP only | **+ per-email Mongo lockout** (relaxed in test) |
| F11 /me context | No dept/institution/term | **Enriched on login/me** |

## Baseline vs current tests

| Suite | Baseline | After (this session) |
|-------|----------|----------------------|
| Backend pytest | 154 passed, 2 skipped, 291s | **158 passed, 1 skipped, 0 failed** (~326s) |
| Frontend build | pass | pass |
| Playwright | 33 passed (pre-conversion) | Helpers use email/password; **fresh-install.spec + playwright.fresh.config.js added** |
| no-demo guard | n/a | **passes** (`tests/test_no_demo.py`) |

## Fresh-install journey

| Step | Status |
|------|--------|
| Empty DB + indexes via lifespan | Implemented |
| `/setup` + CLI create-admin | Implemented |
| Playwright `fresh-install.spec.js` | **Implemented** (`npm run test:e2e:fresh`) |
| API `test_fresh_install.py` | **Implemented** (`tests/e2e/test_fresh_install.py`) |

## Phase file lists (uncommitted)

### Phase 0–2
- `docs/REAL_WORKFLOW_AUDIT.md`, `docs/REAL_WORKFLOW.md`, `docs/REAL_WORKFLOW_REPORT.md`

### Phase 3 (backend)
- Config/db/security/deps, passwords, mailer, settings, auth, users, setup, public, admin, cli
- `app/seed.py` → `tests/support/world.py`
- Tests updated for WORLD_PASSWORD / nested create-user responses / new routes

### Phase 4 (frontend)
- Auth pages, AppShell de-demo, admin temp-password dialog, Landing, PipelineSteps, API client

### Phase 5–6 (partial)
- `tests/test_no_demo.py`, README rewrite, Playwright `e2e/helpers/auth.js` email/password login
- Missing: fresh-install Playwright, random-order triple runs, coverage ≥90% gate

## UNFIXED / known gaps

1. **DATA_MODEL.md** may still lag newer auth fields (`pending_verification`, email_verifications).
2. ~~fresh-install Playwright / pytest~~ — done.
3. **DATA_MODEL.md / API.md** not fully rewritten for every new field (REAL_WORKFLOW.md is the design source).
4. **Department delete / teacher deactivate hard rules** from section E only partially applied (onboarding + llm-status done; full delete guards may still be soft).
5. **pytest-randomly** / 3× full suite not completed in this session.
6. Owner must still: `migrate`, `purge-demo` on real DB, set production secrets.

## Commands the owner must run

```bash
cd backend
python -m app.cli migrate
python -m app.cli purge-demo --dry-run
# review, then:
python -m app.cli purge-demo --yes --db-name <your-exact-db-name>

# .env
APP_ENV=production
JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
# set LLM_* and optional SMTP_*

# then open /setup (or skip if admin already exists after migrate)
```
