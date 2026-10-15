# Architecture

## Request flow

Browser (React, Vite dev server) -> `/api/*` (proxied in dev to
`http://localhost:8000`) -> FastAPI app -> routers -> services -> MongoDB
(PyMongo async client). Auth is a bearer JWT issued on login, decoded by a
dependency on every non-public route; the dependency attaches the current
user (id, role, dept_id) to the request so routers can enforce role and
ownership checks before touching the database.

## Folder responsibilities

**backend/app/**
- `main.py` — FastAPI app instance, CORS, router registration, `/api/health`.
- `core/config.py` — typed settings loaded from env (Mongo URI/DB, JWT
  secret/expiry, LLM provider/model/key, CORS origins, max upload size).
- `core/db.py` — async Mongo client lifecycle (connect on startup, close on
  shutdown via FastAPI lifespan) and index creation.
- `core/security.py` — password hashing (bcrypt) and JWT issue/verify.
- `routers/` — one module per resource (auth, users, departments, classes,
  materials, exams, attempts, requests, notifications, admin, dashboard).
  Routers only validate input, call services, and shape output.
- `schemas/` — Pydantic v2 request/response models, one module per resource,
  mirroring `docs/DATA_MODEL.md`.
- `services/` — business logic and Mongo queries (one module per resource),
  plus `services/llm.py` for AI calls. Routers never talk to Mongo directly.
- Test fixture world — `backend/tests/support/world.py` populates a fresh
  database with the same demo users, depts, classes and exams as the v7
  prototype's `seed()`, for pytest and local dev (`python -m tests.support.world`).
  Not shipped as part of the application package.

**frontend/src/**
- `api/` — a thin fetch wrapper (base URL, JSON headers, bearer token
  injection, error unwrapping) plus one module per resource.
- `auth/` — login, token storage, current-user context, route guards per
  role.
- `components/` — shared UI pieces ported from v7 (topbar, sidebar nav,
  modal, toast, bloom/status pills, etc).
- `pages/{admin,hod,teacher,student,public}/` — one component per v7 page
  function (`P['t-dash']`, `P['h-approvals']`, ...), one role folder each,
  plus `public/` for landing and login.
- `styles/` — CSS lifted verbatim from the v7 `<style>` block, split into
  `tokens.css`, `base.css`, `components.css`, `landing.css`, `auth.css`,
  and `app.css` (imported in that order from `main.jsx`).
- `utils/` — pure helpers ported from v7 (bloom pill, status pill, grading
  display helpers, date formatting) with no DOM or fetch dependencies.

## Auth

Login issues a JWT (`sub`=user id, `role`, `dept_id`, expiry from
`JWT_EXPIRE_MIN`). The frontend stores it and attaches
`Authorization: Bearer <token>` to every `/api` call. `core/security.py`
decodes and verifies it; a FastAPI dependency wraps that and 401s on
missing/invalid/expired tokens. Role-gated routers additionally depend on a
`require_role(...)` check, and ownership (e.g. a teacher only editing their
own exams, a student only submitting their own attempts) is checked inside
each service function against the decoded user, never trusted from the
request body.

## LLM abstraction

`services/llm.py` defines an abstract `LLMClient` with
`json_complete(system, user, schema_hint) -> dict`. Concrete clients
(`OpenAIClient`, `AnthropicClient`, `MockLLM`) implement it; `MockLLM`
returns deterministic canned JSON shaped like the v7 `POOLS` content so the
app is fully runnable with `LLM_PROVIDER=mock` and no API key. A factory
reads `LLM_PROVIDER` from settings and returns the right client. Student
written-answer text passed to any client is wrapped in explicit delimiters
with an instruction to treat it as data, not instructions, since it is
untrusted input.

## v7 pages -> React routes

Public routes live outside the app shell. Authenticated pages sit under
`/app/<role>/…`, with a `RoleRoute` guard that blocks cross-role URLs and
redirects to that role's home. After login the client navigates to
`/app/admin`, `/app/hod`, `/app/teacher`, or `/app/student`.

| v7 page id | React route | Component (planned) |
|------------|-------------|---------------------|
| *(landing)* | `/` | `pages/public/Landing.jsx` |
| *(login)* | `/login` | `pages/public/Login.jsx` |
| `a-dash` | `/app/admin` | `pages/admin/Dashboard.jsx` |
| `a-depts` | `/app/admin/departments` | `pages/admin/Departments.jsx` |
| `a-classes` | `/app/admin/departments?tab=classes` | `pages/admin/Departments.jsx` |
| `a-hod` | `/app/admin/departments/:id/head` | `pages/admin/ChangeHead.jsx` |
| `a-users` | `/app/admin/users` | `pages/admin/Users.jsx` |
| `a-add` | `/app/admin/users/new` | `pages/admin/AddStaff.jsx` |
| `a-settings` | `/app/admin/settings` | `pages/admin/Settings.jsx` |
| `a-audit` | `/app/admin/settings?tab=activity` | `pages/admin/Settings.jsx` |
| `h-dash` | `/app/hod` | `pages/hod/Dashboard.jsx` |
| `h-assign` | `/app/hod/requests` | `pages/hod/Requests.jsx` |
| `h-approvals` | `/app/hod/approvals` | `pages/hod/Approvals.jsx` |
| `h-review` | `/app/hod/approvals/:id` | `pages/hod/Review.jsx` |
| `h-analytics` | `/app/hod/analytics` | `pages/hod/Analytics.jsx` |
| `h-policy` | `/app/hod/policy` | `pages/hod/Policy.jsx` |
| `t-dash` | `/app/teacher` | `pages/teacher/Dashboard.jsx` |
| `t-classes` | `/app/teacher/classes` | `pages/teacher/Classes.jsx` |
| `t-class` | `/app/teacher/classes/:id` | `pages/teacher/ClassDetail.jsx` |
| `t-materials` | `/app/teacher/materials` | `pages/teacher/Materials.jsx` |
| `t-create` | `/app/teacher/exams/new` | `pages/teacher/CreateExam.jsx` |
| `t-exams` | `/app/teacher/exams` | `pages/teacher/Exams.jsx` |
| `t-exam` | `/app/teacher/exams/:id` | `pages/teacher/ExamEditor.jsx` |
| `t-results` | `/app/teacher/exams/:id/results` | `pages/teacher/Results.jsx` |
| `t-attempt` | `/app/teacher/attempts/:id` | `pages/teacher/AttemptReview.jsx` |
| `t-flags` | `/app/teacher/flags` | `pages/teacher/Flags.jsx` |
| `s-dash` | `/app/student` | `pages/student/Dashboard.jsx` |
| `s-classes` | `/app/student/classes` | `pages/student/Classes.jsx` |
| `s-class` | `/app/student/classes/:id` | `pages/student/ClassDetail.jsx` |
| `s-exams` | `/app/student/exams` | `pages/student/Exams.jsx` |
| `s-take` | `/app/student/exams/:id/take` | `pages/student/TakeExam.jsx` |
| `s-done` | `/app/student/attempts/:id/done` | `pages/student/ExamDone.jsx` |
| `s-results` | `/app/student/results` | `pages/student/Results.jsx` |
| `s-feedback` | `/app/student/attempts/:id/feedback` | `pages/student/Feedback.jsx` |
| `s-study` | `/app/student/study` | `pages/student/StudyAssistant.jsx` |

Unknown paths render `pages/NotFound.jsx`. Phase F2 wires public pages,
auth, and placeholder role homes. Phase F3 adds the authenticated `AppShell`
(sidebar, topbar bell, demo switcher), notification drawer (poll + mark read),
shared UI components (`PageTop`, `Stat`, `Pill`, `Modal`, `Toast`, …), and
`useCounts()` for nav badges. Phase F4 (part 1) replaces the teacher
under-construction home with real pages: `t-dash`, `t-classes`, `t-class`,
`t-materials`, `t-create`, `t-exams` (plus a thin `t-exam` stub so generate can
navigate). Phase F5 completes `t-exam` (`ExamEditor` + full `QuestionCard`):
policy checks, Bloom spread, history, status actions
(submit/withdraw/publish/close/delete), and per-question
edit/regen/delete/add against the real API. Phase F6 replaces the HOD
under-construction home with `HodApp`: `h-dash`, `h-approvals`, `h-review`
(approve / return with comments), `h-assign` (paper requests), `h-policy`,
and `h-analytics` (plain CSS bars). Phase F7 replaces the student
under-construction home with `StudentApp`: `s-dash`, `s-classes`,
`s-class`, `s-exams`, `s-take` (timer + autosave + submit modal),
`s-done`, `s-results`, `s-feedback`, and `s-study`. Phase F8 finishes
teacher results (`t-results`), attempt review (`t-attempt`), flags
(`t-flags`), and the admin portal (`AdminApp`: `a-dash`, `a-users`,
`a-add`, `a-depts`/`a-classes`, `a-hod`, `a-settings`/`a-audit`), plus
polish (styleguide removed, loading/error/empty everywhere, README demo
script).
