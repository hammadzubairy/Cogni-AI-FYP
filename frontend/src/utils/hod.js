/** HOD-portal helpers (request status labels, due formatting). */

import { formatShortDate } from './format'
import { pctColor } from './status'

export { greetingLine, todayLong } from './teacher'

export const REQ_STATUS = {
  open: ['Not started', 'p-grey'],
  submitted: ['Submitted', 'p-warn'],
  approved: ['Approved', 'p-good'],
}

export function requestStatusLabel(status) {
  return REQ_STATUS[status]?.[0] || status
}

export function requestStatusTone(status) {
  return REQ_STATUS[status]?.[1] || 'p-grey'
}

/** Display due as YYYY-MM-DD (v7) when possible. */
export function formatDue(value) {
  if (!value) return '—'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatHistStamp(value) {
  return formatShortDate(value) || '—'
}

export function avgColor(avg) {
  if (avg == null) return ''
  return pctColor(avg)
}

/** Default due date ~2 weeks out (YYYY-MM-DD). */
export function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const DEFAULT_REQUEST_NOTE =
  'Cover every CLO, with at least 25% higher-order questions.'

export const APPROVAL_LABELS = {
  all: 'all papers',
  major: 'midterms and finals',
  none: 'no papers',
}
