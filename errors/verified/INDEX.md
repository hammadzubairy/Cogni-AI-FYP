# Errors folder — verification results

All 7 Playwright checks in `frontend/e2e/errors-verify.spec.js` passed (local mock LLM + seeded Mongo).

| ID | Original error | Status | Screenshot |
|----|----------------|--------|------------|
| E1 | Duplicate file fills space — need replace confirm | Fixed | `E1-duplicate-replace.png` |
| E2 | DOCX support is not installed | Fixed | `E2-docx-ok.png` |
| E3 | Slides / PDF not supported | Fixed | `E3-slides-pdf.png` |
| E4 | Exam generation fails on small PDF | Fixed | `E4-exam-generated.png` |
| E5 | Vague Study Assistant page chips | Fixed | `E5-page-labels.png` |
| E6 | Score save full-page spinner | Fixed | `E6-score-soft-save.png` |
| E7 | Admin departments credentials error | Fixed | `E7-admin-departments.png` |

Note: E2/E3 packaging also synced `python-docx` / `python-pptx` / `pymupdf` into `backend/pyproject.toml` for Vercel. Redeploy backend for production to pick that up. Scanned PDFs still need a live OpenAI-compatible OCR provider (mock shows the clear callout).

## Auth + materials UI (2026-10-26)

| ID | Check | Status | Screenshot |
|----|--------|--------|------------|
| M1 | Process material clears dropzone border | Fixed | `M1-materials-process-gap.png` |
| A1 | HOD analytics loads (no permission banner) | Fixed | `A1-hod-analytics-ok.png` |
| A2 | Demoted HOD JWT → 401 (not sticky 403) | Fixed | (API assert) |
| A3 | HOD nav without forced re-login | Fixed | `A3-hod-nav-no-relogin.png` |

Playwright: `frontend/e2e/auth-materials-verify.spec.js` — 4/4 passed.
