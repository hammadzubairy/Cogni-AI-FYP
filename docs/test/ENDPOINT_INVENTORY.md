# Endpoint inventory

Generated from `app.openapi()` via `backend/scripts/gen_endpoint_inventory.py`
(`LLM_PROVIDER=mock`, `MONGO_DB=cogni_inventory_tmp_dev`, `JWT_SECRET=test-secret`),
then enriched by hand from `docs/API.md`, routers under `backend/app/routers/`, and
services under `backend/app/services/`.

**Route count:** 69 operations (path + method).

Path params in OpenAPI use names like `{exam_id}` / `{user_id}`; `docs/API.md` often
writes `{id}`. Same routes.

**Auth:** `public` = no Bearer token. `Bearer` = `Authorization: Bearer <jwt>` required.
**Side effects:** notification / activity log / state change only when the handler does
that work (reads and pure status flips with no notify/log are noted accordingly).

| Method | Path | Auth | Allowed roles | Request model | Response model | Side effects (notification / activity log / state change) |
|--------|------|------|---------------|---------------|----------------|-----------------------------------------------------------|
| GET | /api/health | public | public | — | `{status}` | none |
| POST | /api/auth/login | public | public | `LoginRequest` | `LoginResponse` | none (rate-limited 10/min/IP) |
| GET | /api/auth/me | Bearer | any authenticated | — | `UserOut` | none |
| GET | /api/auth/demo-accounts | public | public | — | `list[DemoAccountOut]` | none |
| GET | /api/admin/users | Bearer | admin | query `role?`, `q?` | `list[UserOut]` | none |
| POST | /api/admin/users | Bearer | admin | `UserCreate` | `UserOut` (201) | notify (new HOD / dept HOD); activity log; creates user (+ may set dept `hod_id`) |
| PATCH | /api/admin/users/{user_id} | Bearer | admin | `UserUpdate` | `UserOut` | notify (role change / HOD promotion); activity log; may clear/set dept `hod_id` |
| POST | /api/admin/users/{user_id}/reset-password | Bearer | admin | — | 204 | notify user; activity log; password → `demo123` |
| GET | /api/admin/departments | Bearer | admin | — | `list[DepartmentOut]` | none |
| POST | /api/admin/departments | Bearer | admin | `DepartmentCreate` | `DepartmentOut` (201) | activity log; creates department |
| PATCH | /api/admin/departments/{dept_id} | Bearer | admin | `DepartmentUpdate` | `DepartmentOut` | notify (new/old head); activity log; role flips HOD↔teacher; sets `hod_id` |
| GET | /api/admin/classes | Bearer | admin | — | `list[ClassOut]` | none |
| PATCH | /api/admin/classes/{class_id} | Bearer | admin | `ClassUpdate` | `ClassOut` | notify both teachers; activity log; reassigns `teacher_id` + moves exams |
| GET | /api/admin/settings | Bearer | admin | — | `SettingsOut` | none |
| PUT | /api/admin/settings | Bearer | admin | `SettingsUpdate` | `SettingsOut` | notify all teachers+HODs if `approval` changes; activity log; updates settings |
| GET | /api/admin/activity | Bearer | admin | query `role?`, `limit?` | `list[ActivityLogOut]` | none |
| GET | /api/admin/summary | Bearer | admin | — | `SummaryOut` | none |
| GET | /api/classes | Bearer | any authenticated | — | `list[ClassOut]` | none (scoped by role) |
| POST | /api/classes | Bearer | teacher | `ClassCreate` | `ClassOut` (201) | notify dept HOD; activity log; creates class + join_code |
| GET | /api/classes/{class_id} | Bearer | teacher (owner), hod (same dept), student (enrolled), admin | — | `ClassOut` | none |
| POST | /api/classes/{class_id}/students | Bearer | teacher (owner) | `AddStudentRequest` | `ClassOut` | notify student; activity log; enrolls student |
| DELETE | /api/classes/{class_id}/students/{student_id} | Bearer | teacher (owner) | — | 204 | notify student; activity log; unenrolls |
| POST | /api/classes/join | Bearer | student | `JoinClassRequest` | `ClassOut` | notify teacher; activity log; enrolls caller |
| GET | /api/requests | Bearer | teacher, hod | — | `list[RequestOut]` | none |
| POST | /api/requests | Bearer | hod | `RequestCreate` | `RequestOut` (201) | notify teacher; activity log; creates request |
| GET | /api/hod/policy | Bearer | hod | — | `DeptPolicy` | none |
| PUT | /api/hod/policy | Bearer | hod | `DeptPolicy` | `DeptPolicy` | notify dept teachers; activity log; updates dept policy |
| GET | /api/hod/approvals | Bearer | hod | — | `list[ExamOut]` | none (lists non-draft exams in HOD’s dept; pending first) |
| GET | /api/hod/analytics | Bearer | hod | — | `HodAnalyticsOut` | none |
| GET | /api/notifications | Bearer | any authenticated | — | `NotificationsListOut` | none |
| POST | /api/notifications/{notif_id}/read | Bearer | any authenticated (owner) | — | 204 | state: mark one notification read |
| POST | /api/notifications/read-all | Bearer | any authenticated | — | 204 | state: mark all caller notifications read |
| POST | /api/classes/{class_id}/materials | Bearer | teacher (owner) | multipart PDF or JSON `{name,text}` | `MaterialSummaryOut` (201) | notify enrolled students; activity log; creates material + chunks |
| GET | /api/classes/{class_id}/materials | Bearer | teacher (owner), hod (same dept), student (enrolled), admin | — | `list[MaterialSummaryOut]` | none |
| GET | /api/materials/{material_id} | Bearer | same as list (via class) | — | `MaterialOut` | none |
| DELETE | /api/materials/{material_id} | Bearer | teacher (class owner) | — | 204 | activity log; deletes material |
| POST | /api/materials/{material_id}/ask | Bearer | student (enrolled) | `AskRequest` | `AskResponse` | none persisted (LLM call; rate-limited 20/min/user) |
| POST | /api/exams/generate | Bearer | teacher (owns class) | `ExamGenerateRequest` | `{exam: ExamOut, warnings[]}` (201) | activity log; creates draft exam; may link `request_id` (LLM) |
| GET | /api/exams | Bearer | any authenticated | query `status?`, `class_id?` | `list[ExamOut]` (stripped for students) | none |
| GET | /api/exams/{exam_id} | Bearer | same visibility as list | — | `ExamOut` | none |
| PATCH | /api/exams/{exam_id} | Bearer | teacher (owner) | `ExamPatch` | `ExamOut` | state: updates draft/returned metadata |
| DELETE | /api/exams/{exam_id} | Bearer | teacher (owner) | — | 204 | activity log; deletes draft; may reopen linked request |
| PATCH | /api/exams/{exam_id}/questions/{qid} | Bearer | teacher (owner) | `QuestionPatch` | `ExamOut` | state: edits question on draft/returned |
| DELETE | /api/exams/{exam_id}/questions/{qid} | Bearer | teacher (owner) | — | `ExamOut` | state: removes question (not last) on draft/returned |
| POST | /api/exams/{exam_id}/questions/{qid}/regenerate | Bearer | teacher (owner) | — | `ExamOut` | state: replaces one question (LLM; rate-limited) |
| POST | /api/exams/{exam_id}/questions | Bearer | teacher (owner) | `QuestionCreateRequest` | `{exam: ExamOut, warnings[]}` (201) | state: appends generated question (LLM) |
| POST | /api/exams/{exam_id}/submit | Bearer | teacher (owner) | — | `ExamOut` | notify HOD; activity log; status → `pending`; history; may set request `submitted` |
| POST | /api/exams/{exam_id}/withdraw | Bearer | teacher (owner) | — | `ExamOut` | notify HOD; activity log; status → `draft`; history |
| POST | /api/exams/{exam_id}/publish | Bearer | teacher (owner) | — | `ExamOut` | notify enrolled students; activity log; status → `published`; history |
| POST | /api/exams/{exam_id}/close | Bearer | teacher (owner) | — | `ExamOut` | activity log; status → `closed`; history; auto-finalizes in-progress attempts |
| POST | /api/exams/{exam_id}/approve | Bearer | hod (same dept) | `ApproveRequest` | `ExamOut` | notify teacher; activity log; status → `approved`; history; may set request `approved` |
| POST | /api/exams/{exam_id}/return | Bearer | hod (same dept) | `ReturnRequest` | `ExamOut` | notify teacher; activity log; status → `returned` + `hod_comment`; history |
| GET | /api/exams/{exam_id}/checks | Bearer | teacher (owner) or hod (same dept) | — | `list[{ok,text,detail}]` | none (policy compliance report) |
| POST | /api/exams/{exam_id}/attempts | Bearer | student (enrolled) | — | `AttemptOut` + `{deadline, server_now}` (201) | state: creates or resumes `in_progress` attempt |
| PUT | /api/attempts/{attempt_id}/answers | Bearer | student (owner) | `AnswerIn` | `AttemptOut` | state: saves answer; may auto-submit if past deadline+grace |
| POST | /api/attempts/{attempt_id}/submit | Bearer | student (owner) | — | `{status: "submitted"}` | activity log; grades answers (LLM for written); stores AI-writing likelihood; status → `submitted` |
| GET | /api/attempts/mine | Bearer | student | query `exam_id?` | `list[AttemptOut]` | may lazily auto-submit expired in-progress attempts |
| GET | /api/attempts/{attempt_id} | Bearer | student (owner) | — | `AttemptOut` | none (release-gated fields) |
| GET | /api/exams/{exam_id}/results | Bearer | teacher (owner) | — | results aggregate object | may lazily auto-close expired in-progress attempts |
| GET | /api/attempts/{attempt_id}/detail | Bearer | teacher (exam owner) | — | attempt detail object | none |
| PUT | /api/exams/{exam_id}/threshold | Bearer | teacher (owner) | `ThresholdIn` | `ExamOut` | state: updates `ai_threshold` |
| POST | /api/attempts/{attempt_id}/flags | Bearer | teacher (exam owner) | `FlagIn` | `AttemptOut` | notify student if `discuss`; activity log; records flag decision (no score change) |
| POST | /api/attempts/{attempt_id}/override | Bearer | teacher (exam owner) | `OverrideIn` | `AttemptOut` | notify student if results already released; activity log; records score override |
| POST | /api/exams/{exam_id}/release | Bearer | teacher (owner) | — | `ExamOut` | notify submitted students + HOD; activity log; `released: true` |
| GET | /api/flags | Bearer | teacher | — | undecided-flag list | may lazily auto-close expired in-progress attempts |
| GET | /api/attempts/{attempt_id}/feedback | Bearer | student (owner, released) or teacher (exam owner) | — | feedback + study_plan object | none persisted (may call LLM for tips) |
| GET | /api/dashboard/teacher | Bearer | teacher | — | `TeacherDashboardOut` | none |
| GET | /api/dashboard/student | Bearer | student | — | `StudentDashboardOut` | none |
| GET | /api/dashboard/hod | Bearer | hod | — | `HodDashboardOut` | none |

## Spec gaps

Routes present in OpenAPI / routers but **missing from `docs/API.md`**:

| Method | Path | Notes (from routers/services) |
|--------|------|-------------------------------|
| POST | /api/exams/{exam_id}/submit | Teacher sends draft/returned paper to HOD (`pending`). Notifies HOD; activity log; may mark linked request `submitted`. |
| POST | /api/exams/{exam_id}/withdraw | Teacher pulls `pending` paper back to `draft`. Notifies HOD; activity log. |
| POST | /api/exams/{exam_id}/publish | Teacher publishes `draft` (if approval not required) or `approved` → `published`. Notifies enrolled students; activity log. |
| POST | /api/exams/{exam_id}/close | Teacher closes `published` → `closed`; finalizes in-progress attempts; activity log. |
| POST | /api/exams/{exam_id}/approve | HOD approves `pending` → `approved` (`ApproveRequest.comment` optional). Notifies teacher; activity log. |
| POST | /api/exams/{exam_id}/return | HOD returns `pending` → `returned` (`ReturnRequest.comment` required). Notifies teacher; activity log. |
| GET | /api/exams/{exam_id}/checks | Teacher (owner) or HOD (same dept): policy checks (CLO coverage, higher-order %, repeats, model answers). |
| GET | /api/hod/approvals | HOD: non-draft exams in department classes, pending sorted first. Returns `list[ExamOut]`. |

These are the exam lifecycle / HOD approval surface that the frontend wireframes and services already implement; API.md still stops before documenting them.
