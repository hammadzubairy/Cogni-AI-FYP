/** Student-portal helpers (answers, timer display, score totals). */

export { greetingLine, todayLong, classHue, wordCount } from './teacher'

export function isAnswered(value) {
  return value != null && value !== ''
}

export function answeredCount(questions, answers) {
  return (questions || []).filter((q) => isAnswered(answers?.[q.qid])).length
}

export function unansweredIndexes(questions, answers) {
  return (questions || [])
    .map((q, i) => [q, i])
    .filter(([q]) => !isAnswered(answers?.[q.qid]))
}

export function formatMmSs(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** Seconds left from server deadline, corrected by server_now drift. */
export function secondsLeft(deadline, serverNow, receivedAt = Date.now()) {
  const end = new Date(deadline).getTime()
  const server = new Date(serverNow).getTime()
  if (Number.isNaN(end) || Number.isNaN(server)) return 0
  const drift = receivedAt - server
  const nowCorrected = Date.now() - drift
  return Math.max(0, Math.round((end - nowCorrected) / 1000))
}

export function examMaxMarks(exam) {
  return (exam?.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0)
}

export function effectiveScore(attempt, q) {
  if (!attempt || !q) return 0
  const ov = attempt.overrides?.[q.qid]
  if (ov != null) return Number(ov)
  const r = attempt.results?.[q.qid]
  return r != null ? Number(r.score) || 0 : 0
}

export function attemptTotal(attempt, exam) {
  return (exam?.questions || []).reduce((s, q) => s + effectiveScore(attempt, q), 0)
}

export function attemptPercent(attempt, exam) {
  const max = examMaxMarks(exam) || 1
  return Math.round(attemptTotal(attempt, exam) / max * 100)
}

export function formatTeacherName(name) {
  return name || 'Teacher'
}

export function formatSubmittedAt(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function materialKindLabel(kind) {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'docx') return 'DOCX'
  if (kind === 'pptx') return 'PPTX'
  if (kind === 'text') return 'Notes'
  return kind || 'File'
}

export function studySourceLabel(src) {
  if (!src) return null
  const page = src.page
  const heading = src.heading
  if (page != null && heading) return `p. ${page} · ${heading}`
  if (page != null) return `page ${page}`
  if (heading) return heading
  return null
}

export function reviseRef(item) {
  const bits = []
  if (item?.page != null) bits.push(`page ${item.page}`)
  if (item?.heading) bits.push(item.heading)
  if (bits.length) return bits.join(', ')
  return 'the lecture notes'
}

/** Build a name map from demo accounts (and any user-like objects). */
export function buildUserDirectory(list) {
  const dir = {}
  ;(list || []).forEach((u) => {
    if (u?.id) dir[u.id] = { name: u.name, email: u.email, role: u.role }
  })
  return dir
}
