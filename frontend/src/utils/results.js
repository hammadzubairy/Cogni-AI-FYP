import { isMcqQuestion } from './teacher'
/** Teacher results / attempt-review helpers. */

import { pctColor } from './status'

export function aggregateTopics(details) {
  const totals = {}
  ;(details || []).forEach((d) => {
    ;(d.questions || []).forEach((q) => {
      const topic = q.topic || 'General'
      const row = totals[topic] || [0, 0]
      row[0] += Number(q.effective_score) || 0
      row[1] += Number(q.marks) || 0
      totals[topic] = row
    })
  })
  return Object.entries(totals)
    .map(([topic, [s, m]]) => [topic, m ? Math.round((s / m) * 100) : 0])
    .sort((a, b) => a[1] - b[1])
}

/** Count written answers at/above threshold across attempt details. */
export function countAtThreshold(details, threshold) {
  const thr = Number(threshold) || 0
  let n = 0
  ;(details || []).forEach((d) => {
    ;(d.questions || []).forEach((q) => {
      if (isMcqQuestion(q)) return
      const ai = q.result?.ai_probability
      if (ai != null && ai >= thr) n += 1
    })
  })
  return n
}

/** Flag pills for one attempt detail at a threshold. */
export function flagsForAttempt(detail, threshold) {
  const thr = Number(threshold) || 0
  const out = []
  ;(detail?.questions || []).forEach((q, i) => {
    if (isMcqQuestion(q)) return
    const ai = q.result?.ai_probability
    if (ai == null || ai < thr) return
    const dec = q.flag_decision
    out.push({
      i,
      qid: q.qid,
      p: Math.round(ai),
      dec: dec === 'cleared' ? 'clear' : dec === 'discuss' ? 'discuss' : null,
    })
  })
  return out
}

export function flagPillTone(dec) {
  if (dec === 'clear' || dec === 'cleared') return 'p-good'
  if (dec === 'discuss') return 'p-bad'
  return 'p-warn'
}

export function flagPillLabel(f) {
  const base = `Q${f.i + 1} ${f.p}%`
  if (f.dec === 'clear' || f.dec === 'cleared') return `${base} · cleared`
  if (f.dec === 'discuss') return `${base} · discuss`
  return base
}

export function scoreColor(earned, max) {
  if (!max) return undefined
  return pctColor((Number(earned) / Number(max)) * 100)
}

export function mcqLetter(index) {
  return 'ABCD'[index] || '?'
}

/** Key-concept fraction from hit/miss lists. */
export function keyConceptFraction(result) {
  const hit = result?.key_points_hit || []
  const miss = result?.key_points_missed || []
  const total = hit.length + miss.length
  return { hit: hit.length, total }
}
