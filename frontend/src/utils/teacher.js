/** Teacher-portal helpers (greeting, class hue, clipboard, title defaults). */

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

/** Stable hue CSS var from class id / list index (v7 `classHue`). */
export function classHue(indexOrId, list = []) {
  let idx = 0
  if (typeof indexOrId === 'number') idx = indexOrId
  else if (indexOrId != null) {
    const found = list.findIndex((c) => c.id === indexOrId)
    idx = found >= 0 ? found : String(indexOrId).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  }
  return `var(--class-hue-${(Math.abs(idx) % 5) + 1})`
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function defaultExamTitle(kind, className, quizIndex = 1) {
  if (kind === 'Quiz') return `Quiz ${quizIndex}: ${className}`
  return `${className} ${kind}`
}

export function defaultDuration(kind) {
  return kind === 'Quiz' ? 20 : 60
}

export function defaultCounts(kind) {
  if (kind === 'Quiz') return { MCQ: 4, Short: 2, Essay: 1 }
  return { MCQ: 6, Short: 2, Essay: 1 }
}

export const QUESTION_CAP = 40

export const MATERIAL_PIPE_STEPS = [
  'Reading file',
  'Cleaning text',
  'Splitting into topics',
  'Saving',
]

export const GENERATE_PIPE_STEPS = [
  'Reading material',
  'Choosing topics',
  'Writing questions',
  'Checking quality',
  'Saving draft',
]

export const SCANNED_PDF_MESSAGE =
  'Could not read enough text from this file. Try a clearer scan, another format, or paste the notes.'

export const MIN_PASTE_CHARS = 300

export const MATERIAL_ACCEPT =
  '.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function kindLabel(kind) {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'docx') return 'DOCX'
  if (kind === 'pptx') return 'PPTX'
  if (kind === 'text') return 'Notes'
  if (kind === 'url') return 'Web page'
  return kind || '—'
}

export function isMaterialFile(name) {
  return /\.(pdf|docx|pptx)$/i.test(name || '')
}

/** Match backend `needs_approval` / v7 `needsApproval`. Default policy is seed `major`. */
export function needsApproval(exam, approval = 'major') {
  if (exam && exam.approval != null) return !!exam.approval
  if (approval === 'all') return true
  if (approval === 'major') return exam?.kind !== 'Quiz'
  return false
}

export function examMaxMarks(exam) {
  return (exam?.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0)
}

export const BLOOM_SPREAD = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate']

export function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}
