# OpenAPI routes (raw)

Generated from `app.openapi()` — 69 operations.

| Method | Path | Request model | Response model |
|--------|------|---------------|----------------|
| GET | /api/admin/activity | — | list[ActivityLogOut] |
| GET | /api/admin/classes | — | list[ClassOut] |
| PATCH | /api/admin/classes/{class_id} | ClassUpdate | ClassOut |
| GET | /api/admin/departments | — | list[DepartmentOut] |
| POST | /api/admin/departments | DepartmentCreate | DepartmentOut |
| PATCH | /api/admin/departments/{dept_id} | DepartmentUpdate | DepartmentOut |
| GET | /api/admin/settings | — | SettingsOut |
| PUT | /api/admin/settings | SettingsUpdate | SettingsOut |
| GET | /api/admin/summary | — | SummaryOut |
| GET | /api/admin/users | — | list[UserOut] |
| POST | /api/admin/users | UserCreate | UserOut |
| PATCH | /api/admin/users/{user_id} | UserUpdate | UserOut |
| POST | /api/admin/users/{user_id}/reset-password | — | 204 empty |
| GET | /api/attempts/mine | — | — |
| GET | /api/attempts/{attempt_id} | — | — |
| PUT | /api/attempts/{attempt_id}/answers | AnswerIn | — |
| GET | /api/attempts/{attempt_id}/detail | — | — |
| GET | /api/attempts/{attempt_id}/feedback | — | — |
| POST | /api/attempts/{attempt_id}/flags | FlagIn | — |
| POST | /api/attempts/{attempt_id}/override | OverrideIn | — |
| POST | /api/attempts/{attempt_id}/submit | — | — |
| GET | /api/auth/demo-accounts | — | list[DemoAccountOut] |
| POST | /api/auth/login | LoginRequest | LoginResponse |
| GET | /api/auth/me | — | UserOut |
| GET | /api/classes | — | list[ClassOut] |
| POST | /api/classes | ClassCreate | ClassOut |
| POST | /api/classes/join | JoinClassRequest | ClassOut |
| GET | /api/classes/{class_id} | — | ClassOut |
| GET | /api/classes/{class_id}/materials | — | list[MaterialSummaryOut] |
| POST | /api/classes/{class_id}/materials | — | MaterialSummaryOut |
| POST | /api/classes/{class_id}/students | AddStudentRequest | ClassOut |
| DELETE | /api/classes/{class_id}/students/{student_id} | — | 204 empty |
| GET | /api/dashboard/hod | — | HodDashboardOut |
| GET | /api/dashboard/student | — | StudentDashboardOut |
| GET | /api/dashboard/teacher | — | TeacherDashboardOut |
| GET | /api/exams | — | — |
| POST | /api/exams/generate | ExamGenerateRequest | — |
| DELETE | /api/exams/{exam_id} | — | 204 empty |
| GET | /api/exams/{exam_id} | — | — |
| PATCH | /api/exams/{exam_id} | ExamPatch | — |
| POST | /api/exams/{exam_id}/approve | ApproveRequest | — |
| POST | /api/exams/{exam_id}/attempts | — | — |
| GET | /api/exams/{exam_id}/checks | — | — |
| POST | /api/exams/{exam_id}/close | — | — |
| POST | /api/exams/{exam_id}/publish | — | — |
| POST | /api/exams/{exam_id}/questions | QuestionCreateRequest | — |
| DELETE | /api/exams/{exam_id}/questions/{qid} | — | — |
| PATCH | /api/exams/{exam_id}/questions/{qid} | QuestionPatch | — |
| POST | /api/exams/{exam_id}/questions/{qid}/regenerate | — | — |
| POST | /api/exams/{exam_id}/release | — | — |
| GET | /api/exams/{exam_id}/results | — | — |
| POST | /api/exams/{exam_id}/return | ReturnRequest | — |
| POST | /api/exams/{exam_id}/submit | — | — |
| PUT | /api/exams/{exam_id}/threshold | ThresholdIn | — |
| POST | /api/exams/{exam_id}/withdraw | — | — |
| GET | /api/flags | — | — |
| GET | /api/health | — | — |
| GET | /api/hod/analytics | — | HodAnalyticsOut |
| GET | /api/hod/approvals | — | list[ExamOut] |
| GET | /api/hod/policy | — | DeptPolicy |
| PUT | /api/hod/policy | DeptPolicy | DeptPolicy |
| DELETE | /api/materials/{material_id} | — | 204 empty |
| GET | /api/materials/{material_id} | — | MaterialOut |
| POST | /api/materials/{material_id}/ask | AskRequest | AskResponse |
| GET | /api/notifications | — | NotificationsListOut |
| POST | /api/notifications/read-all | — | 204 empty |
| POST | /api/notifications/{notif_id}/read | — | 204 empty |
| GET | /api/requests | — | list[RequestOut] |
| POST | /api/requests | RequestCreate | RequestOut |
