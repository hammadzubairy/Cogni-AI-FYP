/** Initials helper matching v7 `ini()`. */
export function initials(name) {
  return String(name || '')
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Short date like v7 notification stamps ("26 Sep"). */
export function formatShortDate(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function clampPct(v) {
  const n = Number(v) || 0
  return Math.max(0, Math.min(100, n))
}

/** Relative time for activity log (e.g. "3h ago", "just now"). */
export function formatRelativeTime(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const sec = Math.round((Date.now() - d.getTime()) / 1000)
  if (sec < 45) return 'just now'
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m ago`
  if (sec < 86400) return `${Math.max(1, Math.round(sec / 3600))}h ago`
  if (sec < 86400 * 7) return `${Math.max(1, Math.round(sec / 86400))}d ago`
  return formatShortDate(d)
}
