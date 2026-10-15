# Backend test plan

## How to run

```bash
cd backend
source .venv/bin/activate
# or: ./scripts/test_backend.sh
python -m pytest -q
```

`scripts/test_backend.sh` starts the `cogni-mongo` Docker container if needed,
forces `LLM_PROVIDER=mock`, and runs the suite with coverage.

## Layout

| Path | Purpose |
|------|---------|
| `tests/conftest.py` | Env overrides, random `cogni_test_<hex>_dev` DB, reseed per test, rate-limit reset, route hit tracker |
| `tests/helpers.py` | `login_as`, persona map, factories (`make_class`, `upload_material`, `make_exam_draft`, …) |
| `tests/pdf_fixtures.py` | Fixture PDFs (multipage text, scanned/empty) |
| `tests/test_*.py` | Domain / security / smoke modules |
| `tests/e2e/` | Full demo loop and shorter lifecycle scenarios |
| `docs/test/ENDPOINT_INVENTORY.md` | Every OpenAPI route + roles + side effects |

## Markers

- `unit` — no HTTP / Mongo
- `api` — HTTP against the ASGI app
- `e2e` — multi-step scenarios
- `security` — auth, RBAC, injection, fuzz
- `llm_real` — real provider (skipped unless a key is configured)

## Adding a test for a new route

1. Implement the route and document it in `docs/API.md`.
2. Regenerate / update `docs/test/ENDPOINT_INVENTORY.md` (`python scripts/gen_endpoint_inventory.py`).
3. Add the `(METHOD, path)` entry to `ALLOWED_ROLES` in `tests/test_rbac_matrix.py`.
   The matrix coverage test fails the build if OpenAPI has a route missing from the map.
4. Add a focused domain test in the matching `test_<area>.py` (or a new module).
5. If the route is mutating, assert the notification and/or activity-log side effect
   when the inventory says it has one.
6. Extend `tests/test_route_coverage.py` planned calls if the soft matrix does not
   already hit the new path via an existing happy path.
7. Run `pytest -q` and `pytest -q --randomly-seed=...` once.

## Isolation rules

- Every test gets a freshly seeded DB (`client` fixture).
- Do not rely on insertion order across tests.
- Prefer `freezegun` or direct `started_at` updates over sleeps > 1s.
- Never skip a failing test to greenwash; fix the app or the test and log it.

## Coverage gates

- Line coverage target: ≥ 85% of `app/` (`pytest --cov=app`).
- Route coverage: `test_route_coverage.py` and the RBAC map completeness test.
- Routers should stay at or near 100% line coverage.
