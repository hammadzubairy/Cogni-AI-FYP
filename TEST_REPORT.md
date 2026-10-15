# Cogni.ai backend QA report

**Date:** 2026-10-14  
**Scope:** `backend/` FastAPI + MongoDB + MockLLM  
**Operator:** autonomous QA/SDET run (phases 0–10)

## Summary

| Metric | Value |
|--------|-------|
| Collected | **156** |
| Passed | **154** |
| Failed | **0** |
| Skipped | **2** (see SKIPPED) |
| Line coverage (`app/`) | **92%** (3166 stmts, 238 miss) — target ≥85% |
| Router line coverage | **100%** except `materials.py` 92% (3 empty-body branches) |
| Route-coverage gate | **green** (`test_route_coverage`, RBAC map completeness) |
| Deterministic suite ×3 | **pass / pass / pass** |
| Random order | **pass** (`--randomly-seed=495801501` after flake fix; `--randomly-seed=99`) |
| Runtime (approx.) | **~5.0–5.5 min** per full run on this host |
| LLM in tests | `LLM_PROVIDER=mock` (forced in `tests/conftest.py`) |

Blunt verdict: the backend is in good shape for a mock-LLM FYP demo. Domain coverage was already strong; this run added shared fixtures, a programmatic RBAC matrix over all OpenAPI routes, IDOR/security/e2e/smoke gates, and fixed one real seed defect (indexes dropped and not recreated). Coverage of real OpenAI/Anthropic clients and some exam-generator/grading edge branches remains thin by design under `mock`.

## RBAC matrix

- Source of truth: `app.openapi()` (69 API operations) + `tests/test_rbac_matrix.py` `ALLOWED_ROLES`.
- Gate: missing OpenAPI↔map entries fail the build.
- Per-route calls as `anonymous` / `student` / `teacher` / `hod` / `admin`.
- Result: **pass**. Anonymous → 401 on Bearer routes; wrong role → 403 (or 404 where existence is hidden); allowed roles never get 401/403.

## E2E scenarios

| Test | Result |
|------|--------|
| `tests/e2e/test_full_loop.py::test_full_demo_loop` | **pass** |
| `::test_quiz_direct_publish` | **pass** |
| `::test_hod_return_then_withdraw` | **pass** |

Full loop exercises: admin dept/users → HOD request → material → midterm generate/edit/submit → return → resubmit/approve/publish → student attempts → close → flags/override/release → feedback + study ask → dashboard/notification/activity checks.

## DEFECTS FOUND

| ID | Severity | Where | What was wrong | Fix | Status | Guard |
|----|----------|-------|----------------|-----|--------|-------|
| D1 | data integrity | `app/seed.py` | Dropping collections also dropped indexes; reseeded DBs lost unique `email` / `join_code` (and other) constraints | Recreate indexes at end of `seed.main` | **FIXED** | `test_indexes_unique_email_and_join_code` |
| D2 | test flake / process | `tests/test_auth.py` + route gate | Import-time mount of `/api/_test/admin-only` polluted OpenAPI; under random order the route-coverage gate failed if auth tests had not run yet | Mount only in role-guard fixture; exclude `/_test/` from OpenAPI expected set | **FIXED** | `test_all_openapi_routes_reachable` + random seeds |
| D3 | test bug | `tests/test_rbac_matrix.py` | PATCH `/admin/departments/{id}` with `{}` cleared `hod_id` mid-matrix → later HOD cells got 403 | Send current `hod_id` | **FIXED** | RBAC matrix test |

No UNFIXED application defects remaining from this run’s failing tests.

## DECISIONS

1. **Test client:** Default fixture remains sync `TestClient` (existing domain suite). `httpx.AsyncClient` + `ASGITransport` provided as `async_client` for concurrency paths. Logged because the brief preferred ASGITransport everywhere; migrating ~100 tests was higher risk than value.
2. **Test DB:** Session name `cogni_test_<hex>_dev` (random); each test reseeds via `seed.main(force=False)`. Ends in `_dev` so seed’s safety guard allows it.
3. **JWT in tests:** `JWT_SECRET` forced to a ≥32-byte test string to silence PyJWT length warnings and avoid using `.env` secrets.
4. **pytest-randomly:** Disabled by default (`-p no:randomly` in `pytest.ini`) for deterministic CI; enable with `pytest -p randomly --randomly-seed=…` for flake checks.
5. **Validation HTTP status:** App maps `RequestValidationError` → **400** + `code=VALIDATION_ERROR` (see `app/core/errors.py`). Some `docs/API.md` rows mention 422. Tests accept 400/422. Spec/docs inconsistency noted; **no API contract change** in this run (would need an explicit docs update if we switch to 422).
6. **No student self-signup:** Not in `docs/API.md` / OpenAPI. Phase 3 signup tests are skipped (not invented).
7. **No git commits:** Repo user rule overrides the phase-8 “commit each fix” instruction; changes are left uncommitted for the human to review.
8. **Time control:** Deadline tests primarily backdate `attempts.started_at` in Mongo (existing pattern). `freezegun` is a dev dependency for future clock injection; not every `datetime.now(UTC)` call site was refactored to a single injectable clock (larger app change).
9. **`.env` vs `.env.example`:** Same core keys; `.env.example` additionally documents `AI_DETECTOR`, `LLM_BASE_URL`, `MAX_REQUEST_MB` that local `.env` may omit (defaults still apply via `Settings`).

## SKIPPED

| Item | Reason |
|------|--------|
| `test_student_self_signup_not_available` | No signup route in the API contract |
| `test_real_llm_smoke_placeholder` (`llm_real`) | **SKIPPED: no key** — `LLM_PROVIDER=mock`, empty `LLM_API_KEY` |
| Phase 9 real-LLM budget run | Same — no key present in env or `.env` |

## KNOWN RISKS / WEAK SPOTS

- **`services/llm.py` 73% / `exam_generator.py` 79% / `grading.py` 80%:** Real provider clients and some malformed-LLM retry paths are under-exercised under `mock`. A keyed `llm_real` run is the right follow-up.
- **`core/db.py` `create_indexes` (lines 37–45):** Not invoked from lifespan (by design); seed now recreates indexes, but a cold app without seed still has no indexes until something calls `create_indexes`.
- **Materials router 92%:** Branches for missing multipart file / missing JSON fields / wrong content-type are lightly hit.
- **Dashboard numbers in e2e:** Asserted for shape and key counters; not every seeded dashboard cell is hand-recomputed to the last integer.
- **Concurrency:** ThreadPool parallel submit/join covered; full asyncio ASGI storm is lighter.
- **Spec gaps:** OpenAPI includes exam lifecycle routes (`submit`/`withdraw`/`publish`/`close`/`approve`/`return`/`checks`) and `GET /api/hod/approvals` that are thin or missing as dedicated rows in `docs/API.md` (see inventory “Spec gaps”). Behaviour is tested; docs should catch up.

## Reproduce

```bash
# Mongo (once)
docker start cogni-mongo 2>/dev/null || \
  docker run -d --name cogni-mongo --ulimit nofile=65536:65536 -p 27017:27017 mongo:7

# One command
cd backend && ./scripts/test_backend.sh
# or: make test-backend
# or: cd backend && source .venv/bin/activate && python -m pytest -q

# Coverage (also done by test_backend.sh)
cd backend && source .venv/bin/activate && \
  python -m pytest -q --cov=app --cov-report=term-missing --cov-report=html:htmlcov

# Random order / flake check
cd backend && source .venv/bin/activate && \
  python -m pytest -p randomly -q --randomly-seed=99
```

## Artifacts

- `docs/test/ENDPOINT_INVENTORY.md` — 69 OpenAPI routes, enriched
- `docs/test/TEST_PLAN.md` — how to extend the suite
- `backend/scripts/test_backend.sh` — Mongo + pytest + coverage
- `backend/requirements-dev.txt` — pytest-cov, randomly, freezegun, reportlab, …
- `backend/htmlcov/` — HTML coverage report from last run
