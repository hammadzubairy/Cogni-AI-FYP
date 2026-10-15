/** Admin-portal helpers. */

export function greetingLine(fullName) {
  const first = String(fullName || '')
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)[0] || 'there'
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${first}`
}

export function todayLong() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function usersByRoleTotal(usersByRole = {}) {
  return (
    (usersByRole.admin || 0) +
    (usersByRole.hod || 0) +
    (usersByRole.teacher || 0) +
    (usersByRole.student || 0)
  )
}

export function papersSubmittedCount(papersByStatus = {}) {
  return Object.values(papersByStatus || {}).reduce((n, v) => n + (Number(v) || 0), 0)
}

export const APPROVAL_LABELS = {
  all: 'all papers',
  major: 'midterms and finals',
  none: 'no papers',
}

export function roleTabFilter(tab) {
  if (tab === 'teachers') return (u) => u.role === 'teacher' || u.role === 'hod'
  if (tab === 'students') return (u) => u.role === 'student'
  if (tab === 'admins') return (u) => u.role === 'admin'
  return () => true
}
