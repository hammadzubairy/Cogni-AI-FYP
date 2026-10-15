# Real workflow design

Implements the mission in the Phase-2 prompt. Decisions that deviate from the prompt are listed in `REAL_WORKFLOW_REPORT.md`.

## A. Environment and startup

- `APP_ENV`: `development` | `test` | `production` (default **`production`**).
- Lifespan: connect → `create_indexes()` (users.email unique, classes.join_code unique, password_resets.token_hash, TTL on expires_at, login_failures TTL, settings singleton). Prod: fail hard on connect/index errors. Dev/test: warn.
- Prod refuses start if: weak/missing JWT_SECRET, `LLM_PROVIDER=mock`, CORS `*`, `MONGO_DB` ends `_dev|_demo|_test`.
- New env: SMTP_*, PUBLIC_BASE_URL, PASSWORD_RESET_MINUTES, LOGIN_LOCKOUT_*.

## B. Settings

- `DEFAULTS`: approval=`major`, max_upload_mb from config, ai_threshold_default=70, institution_name="", current_term="", student_signup_enabled=true, allowed_email_domains=[].
- `get_settings()` always merges over DEFAULTS (never fail-open to approval none).
- `GET /api/public/config` → needs_setup, institution_name, current_term, student_signup_enabled.
- `/me` and login include `dept_name`, `institution_name`, `current_term`, `must_change_password`.

## C. First-run setup

- `needs_setup` iff users collection empty.
- `POST /api/setup/admin` + CLI `python -m app.cli create-admin`.
- Frontend `/setup` when needs_setup; other routes redirect.

## D. Passwords / signup / reset

- No default password. Policy: ≥10 chars, ≠ email/name, not in top-100 common list.
- User fields: must_change_password, token_version, created_at, last_login_at, created_by.
- Admin create/reset → random 14-char temp password once in response; must_change_password=true.
- Scoped JWT `scope=change_password` until change succeeds.
- Register (student only) → `pending_verification` + email verify link; forgot/reset with hashed token + ConsoleMailer/SmtpMailer. Staff via admin Add Staff only.
- Login: dummy bcrypt for unknown emails; per-email lockout in Mongo; bump token_version on password events.
- Remove `/api/auth/demo-accounts`.
- `python -m app.cli migrate` idempotent.

## E. Admin

- Onboarding checklist endpoint; delete/deactivate rules; llm-status (no key).

## F. Test fixture world

- `app/seed.py` → `tests/support/world.py`; password `Test-Passw0rd!`; `python -m tests.support.world --db …`.

## G–H. Copy / empty states / no app seed

- Landing/login without demo; PipelineSteps indeterminate; sidebar from API fields.
