/**
 * One named function per API endpoint (docs/API.md + exam lifecycle routes).
 * Components must use these helpers — never call fetch directly.
 */
import { del, get, patch, post, put, upload } from './client'

function qs(params) {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (!entries.length) return ''
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}`
}

/* ---------- health ---------- */
export function getHealth() {
  return get('/health', { skipAuth: true })
}

/* ---------- auth ---------- */
export function login(email, password) {
  return post('/auth/login', { email, password }, { skipAuth: true })
}

export function getMe() {
  return get('/auth/me')
}

export function publicConfig() {
  return get('/public/config', { skipAuth: true })
}

export function publicDepartments() {
  return get('/public/departments', { skipAuth: true })
}

export function setupAdmin(body) {
  return post('/setup/admin', body, { skipAuth: true })
}

export function register(body) {
  return post('/auth/register', body, { skipAuth: true })
}

export function verifyEmail(token) {
  return post('/auth/verify-email', { token }, { skipAuth: true })
}

export function resendVerification(email) {
  return post('/auth/resend-verification', { email }, { skipAuth: true })
}

export function forgotPassword(email) {
  return post('/auth/forgot', { email }, { skipAuth: true })
}

export function resetPassword(body) {
  return post('/auth/reset', body, { skipAuth: true })
}

export function changePassword(body) {
  return post('/auth/change-password', body)
}

/* ---------- admin ---------- */
export function listAdminUsers({ role, q } = {}) {
  return get(`/admin/users${qs({ role, q })}`)
}

export function createAdminUser(body) {
  return post('/admin/users', body)
}

export function patchAdminUser(id, body) {
  return patch(`/admin/users/${id}`, body)
}

export function resetAdminUserPassword(id) {
  return post(`/admin/users/${id}/reset-password`)
}

export function listAdminDepartments() {
  return get('/admin/departments')
}

export function createAdminDepartment(body) {
  return post('/admin/departments', body)
}

export function patchAdminDepartment(id, body) {
  return patch(`/admin/departments/${id}`, body)
}

export function listAdminClasses() {
  return get('/admin/classes')
}

export function patchAdminClass(id, body) {
  return patch(`/admin/classes/${id}`, body)
}

export function getAdminSettings() {
  return get('/admin/settings')
}

export function putAdminSettings(body) {
  return put('/admin/settings', body)
}

export function listAdminActivity({ role, limit } = {}) {
  return get(`/admin/activity${qs({ role, limit })}`)
}

export function getAdminSummary() {
  return get('/admin/summary')
}

export function getAdminOnboarding() {
  return get('/admin/onboarding')
}

export function getAdminLlmStatus() {
  return get('/admin/llm-status')
}

/* ---------- classes ---------- */
export function listClasses() {
  return get('/classes')
}

export function createClass(body) {
  return post('/classes', body)
}

export function getClass(id) {
  return get(`/classes/${id}`)
}

export function addClassStudent(classId, email) {
  return post(`/classes/${classId}/students`, { email })
}

export function removeClassStudent(classId, studentId) {
  return del(`/classes/${classId}/students/${studentId}`)
}

export function joinClass(joinCode) {
  return post('/classes/join', { join_code: joinCode })
}

/* ---------- materials ---------- */
export function listMaterials(classId) {
  return get(`/classes/${classId}/materials`)
}

export function uploadMaterialPdf(classId, formData) {
  return upload(`/classes/${classId}/materials`, formData)
}

export function uploadMaterialText(classId, body) {
  return post(`/classes/${classId}/materials`, body)
}

export function uploadMaterialUrl(classId, body) {
  return post(`/classes/${classId}/materials`, body)
}

export function getMaterial(id) {
  return get(`/materials/${id}`)
}

export function deleteMaterial(id) {
  return del(`/materials/${id}`)
}

export function askMaterial(id, question) {
  return post(`/materials/${id}/ask`, { question })
}

/* ---------- exams ---------- */
export function generateExam(body) {
  return post('/exams/generate', body)
}

export function listExams({ status, class_id } = {}) {
  return get(`/exams${qs({ status, class_id })}`)
}

export function getExam(id) {
  return get(`/exams/${id}`)
}

export function patchExam(id, body) {
  return patch(`/exams/${id}`, body)
}

export function deleteExam(id) {
  return del(`/exams/${id}`)
}

export function patchExamQuestion(examId, qid, body) {
  return patch(`/exams/${examId}/questions/${qid}`, body)
}

export function deleteExamQuestion(examId, qid) {
  return del(`/exams/${examId}/questions/${qid}`)
}

export function regenerateExamQuestion(examId, qid) {
  return post(`/exams/${examId}/questions/${qid}/regenerate`)
}

export function addExamQuestion(examId, type) {
  return post(`/exams/${examId}/questions`, { type })
}

export function submitExamForApproval(examId) {
  return post(`/exams/${examId}/submit`)
}

export function withdrawExam(examId) {
  return post(`/exams/${examId}/withdraw`)
}

export function publishExam(examId) {
  return post(`/exams/${examId}/publish`)
}

export function closeExam(examId) {
  return post(`/exams/${examId}/close`)
}

export function approveExam(examId, comment) {
  return post(`/exams/${examId}/approve`, { comment: comment ?? null })
}

export function returnExam(examId, comment) {
  return post(`/exams/${examId}/return`, { comment })
}

export function getExamChecks(examId) {
  return get(`/exams/${examId}/checks`)
}

export function getExamResults(examId) {
  return get(`/exams/${examId}/results`)
}

export function putExamThreshold(examId, value) {
  return put(`/exams/${examId}/threshold`, { value })
}

export function releaseExamResults(examId) {
  return post(`/exams/${examId}/release`)
}

/* ---------- attempts ---------- */
export function startAttempt(examId) {
  return post(`/exams/${examId}/attempts`)
}

export function putAttemptAnswer(attemptId, qid, value) {
  return put(`/attempts/${attemptId}/answers`, { qid, value })
}

export function submitAttempt(attemptId) {
  return post(`/attempts/${attemptId}/submit`)
}

export function listMyAttempts({ exam_id } = {}) {
  return get(`/attempts/mine${qs({ exam_id })}`)
}

export function getAttempt(id) {
  return get(`/attempts/${id}`)
}

export function getAttemptDetail(id) {
  return get(`/attempts/${id}/detail`)
}

export function decideAttemptFlag(attemptId, qid, decision) {
  return post(`/attempts/${attemptId}/flags`, { qid, decision })
}

export function overrideAttemptScore(attemptId, qid, score) {
  return post(`/attempts/${attemptId}/override`, { qid, score })
}

export function getAttemptFeedback(id) {
  return get(`/attempts/${id}/feedback`)
}

export function listFlags() {
  return get('/flags')
}

/* ---------- notifications ---------- */
export function listNotifications() {
  return get('/notifications')
}

export function markNotificationRead(id) {
  return post(`/notifications/${id}/read`)
}

export function markAllNotificationsRead() {
  return post('/notifications/read-all')
}

/* ---------- requests (teacher / hod) ---------- */
export function listRequests() {
  return get('/requests')
}

export function createRequest(body) {
  return post('/requests', body)
}

/* ---------- hod ---------- */
export function getHodPolicy() {
  return get('/hod/policy')
}

export function putHodPolicy(body) {
  return put('/hod/policy', body)
}

export function listHodApprovals() {
  return get('/hod/approvals')
}

export function getHodAnalytics() {
  return get('/hod/analytics')
}

/* ---------- dashboards ---------- */
export function getTeacherDashboard() {
  return get('/dashboard/teacher')
}

export function getStudentDashboard() {
  return get('/dashboard/student')
}

export function getHodDashboard() {
  return get('/dashboard/hod')
}
