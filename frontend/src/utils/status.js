/** Exam status map from v7 `ST` / `pill`. */
export const ST = {
  draft: ['Draft', 'p-grey'],
  pending: ['Pending HOD', 'p-warn'],
  returned: ['Returned', 'p-bad'],
  approved: ['Approved', 'p-good'],
  published: ['Live', 'p-blue'],
  closed: ['Closed', 'p-grey'],
}

export function statusLabel(status) {
  return ST[status]?.[0] || status
}

export function statusClass(status) {
  return ST[status]?.[1] || 'p-grey'
}

export function pctColor(v) {
  if (v >= 75) return 'var(--color-success)'
  if (v >= 60) return 'var(--color-accent)'
  return 'var(--color-destructive)'
}
