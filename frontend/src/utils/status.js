/** Exam status → label + pill tone (Final Color Palette). */
export const ST = {
  draft: ['Draft', 'p-grey'],
  pending: ['Pending HOD', 'p-progress'],
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
  if (v >= 60) return 'var(--color-warning)'
  return 'var(--color-destructive)'
}
