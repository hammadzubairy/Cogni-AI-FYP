import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import BloomTag from '../../components/BloomTag'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { formatShortDate } from '../../utils/format'
import { keyConceptFraction, mcqLetter, scoreColor } from '../../utils/results'

function AiChip({ children = 'AI grading' }) {
  return (
    <span className="chip-ai">
      <Icon name="spark" />
      {children}
    </span>
  )
}

function HumanChip({ children = 'Final score' }) {
  return (
    <span className="chip-human">
      <Icon name="check" />
      {children}
    </span>
  )
}

/**
 * Teacher attempt review (v7 `P['t-attempt']`).
 */
export default function AttemptReview() {
  const { id } = useParams()
  const toast = useToast()

  const [detail, setDetail] = useState(null)
  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scores, setScores] = useState({})
  const [scoreErrors, setScoreErrors] = useState({})
  const [busyQ, setBusyQ] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.getAttemptDetail(id)
      const ex = await api.getExam(d.exam_id)
      const c = await api.getClass(ex.class_id).catch(() => null)
      const nextScores = {}
      ;(d.questions || []).forEach((q) => {
        nextScores[q.qid] = q.effective_score
      })
      setDetail(d)
      setExam(ex)
      setCls(c)
      setScores(nextScores)
      setScoreErrors({})
    } catch (err) {
      setError(err)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function onFlag(qid, decision) {
    setBusyQ(qid)
    try {
      await api.decideAttemptFlag(id, qid, decision)
      toast(
        decision === 'cleared'
          ? 'Flag cleared. Grade stands. Neither Clear nor Ask to discuss changes the grade.'
          : 'Student notified. Neither Clear nor Ask to discuss changes the grade.',
      )
      await load()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update flag.', { type: 'error' })
    } finally {
      setBusyQ(null)
    }
  }

  async function onOverride(qid, marks) {
    const raw = scores[qid]
    if (raw === '' || raw == null || Number.isNaN(Number(raw)) || Number(raw) < 0 || Number(raw) > marks) {
      setScoreErrors((e) => ({
        ...e,
        [qid]: `Enter a score from 0 to ${marks}`,
      }))
      return
    }
    const v = Math.round(Number(raw) * 2) / 2
    setBusyQ(qid)
    setScoreErrors((e) => {
      const n = { ...e }
      delete n[qid]
      return n
    })
    try {
      await api.overrideAttemptScore(id, qid, v)
      toast('Score saved')
      await load()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save score.', { type: 'error' })
    } finally {
      setBusyQ(null)
    }
  }

  if (loading) return <ShellLoading label="Loading submission…" />
  if (error) {
    return (
      <ShellError
        message={error.message || 'Submission not found.'}
        onRetry={load}
      />
    )
  }
  if (!detail) return <EmptyState>Submission not found.</EmptyState>

  const total = (detail.questions || []).reduce(
    (s, q) => s + (Number(q.effective_score) || 0),
    0,
  )
  const max = (detail.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0)
  const thr = detail.ai_threshold ?? exam?.ai_threshold ?? 70

  return (
    <>
      <PageTop
        crumb={
          <>
            <Link to="/app/teacher">Home</Link>
            <span aria-hidden="true"> / </span>
            {cls ? (
              <>
                <Link to={`/app/teacher/classes/${exam?.class_id}?tab=exams`}>
                  {cls.code}
                </Link>
                <span aria-hidden="true"> / </span>
                <Link to={`/app/teacher/classes/${exam?.class_id}?tab=exams`}>Exams</Link>
                <span aria-hidden="true"> / </span>
              </>
            ) : null}
            <Link to={`/app/teacher/exams/${detail.exam_id}/results`}>
              Results · {detail.exam_title}
            </Link>
          </>
        }
        title={`${detail.student_name} · ${total}/${max}`}
        actions={
          <Pill label={`Submitted ${formatShortDate(detail.submitted_at)}`} tone="p-grey" />
        }
      />

      <div className="grid" style={{ gap: 14 }}>
        {(detail.questions || []).map((q, i) => {
          const r = q.result || {}
          const a = q.student_answer
          const ov = q.override
          const flagged = !!q.flagged
          const dec = q.flag_decision
          const ai = r.ai_probability
          const kc = keyConceptFraction(r)
          const isMcq = q.type === 'MCQ'
          const autoScore = r.score

          return (
            <div className="qcard" key={q.qid} id={`qc-${q.qid}`}>
              <div className="qtop">
                <div className="qtags">
                  <span className="mono" style={{ color: 'var(--color-muted-foreground)' }}>
                    Q{i + 1}
                  </span>
                  <Pill label={q.type} tone="p-grey" />
                  <BloomTag level={q.bloom} />
                  <span className="small">{q.topic}</span>
                  {r.fallback ? (
                    <span className="pill p-warn" title="Keyword-overlap fallback was used">
                      Fallback grading
                    </span>
                  ) : null}
                </div>
                <b
                  className="num"
                  style={{ color: scoreColor(q.effective_score, q.marks) }}
                >
                  {q.effective_score} / {q.marks}
                  {ov != null ? (
                    <span className="small">
                      {' '}
                      (overridden, auto {autoScore ?? '—'})
                    </span>
                  ) : null}
                </b>
              </div>
              <div className="qtext">{q.text}</div>

              {isMcq ? (
                <>
                  <div className="ans-block">
                    {a == null || a === '' ? (
                      <i>Not answered</i>
                    ) : (
                      `${mcqLetter(Number(a))}. ${(q.options || [])[Number(a)] ?? a}`
                    )}
                  </div>
                  <div className="small">{r.reason || ''}</div>
                </>
              ) : (
                <>
                  <div className="ans-block">
                    {a && String(a).trim() ? a : <i>No answer</i>}
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <AiChip>AI grading</AiChip>
                    <span className="small">
                      Suggested scores. You make the final call below.
                    </span>
                  </div>
                  <div className="scoregrid">
                    <div className="sg">
                      <span>Semantic similarity (40%)</span>
                      <b>{r.similarity != null ? `${r.similarity}%` : '—'}</b>
                    </div>
                    <div className="sg">
                      <span>Key concepts (20%)</span>
                      <b>
                        {kc.total ? `${kc.hit}/${kc.total}` : '—'}
                      </b>
                    </div>
                    <div className="sg">
                      <span>Reason</span>
                      <b className="small" style={{ fontWeight: 600, textAlign: 'left' }}>
                        {r.reason || '—'}
                      </b>
                    </div>
                    <div className="sg">
                      <span>
                        AI-writing likelihood
                        <span className="small" style={{ display: 'block', fontWeight: 400 }}>
                          heuristic estimate, advisory only
                        </span>
                      </span>
                      <b
                        style={{
                          color:
                            ai != null && ai >= thr
                              ? 'var(--color-destructive)'
                              : 'var(--color-foreground)',
                        }}
                      >
                        {ai != null ? `${Math.round(ai)}%` : '—'}
                      </b>
                    </div>
                  </div>
                  <div className="small">
                    {(r.key_points_hit || []).length
                      ? `Covered: ${(r.key_points_hit || []).join('; ')}. `
                      : ''}
                    {(r.key_points_missed || []).length
                      ? `Missed: ${(r.key_points_missed || []).join('; ')}. `
                      : ''}
                    {r.reason || ''}
                  </div>
                  {flagged ? (
                    <div
                      className={`callout ${
                        dec === 'cleared' ? 'green' : dec === 'discuss' ? 'red' : ''
                      }`}
                      style={{ margin: 0 }}
                    >
                      <Icon name={dec === 'cleared' ? 'check' : 'warn'} />
                      <div>
                        <b>
                          {dec === 'cleared'
                            ? 'Flag cleared.'
                            : dec === 'discuss'
                              ? 'Student asked to discuss this answer.'
                              : `Flagged: ${Math.round(ai)}% AI-writing likelihood (threshold ${thr}%).`}
                        </b>{' '}
                        {dec
                          ? 'Clear and Ask to discuss never change the grade.'
                          : "Compare with this student's earlier work before deciding. Clear and Ask to discuss never change the grade."}
                        {!dec ? (
                          <div className="row" style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="btn small"
                              disabled={busyQ === q.qid}
                              onClick={() => onFlag(q.qid, 'cleared')}
                            >
                              Clear flag
                            </button>
                            <button
                              type="button"
                              className="btn small bad"
                              disabled={busyQ === q.qid}
                              onClick={() => onFlag(q.qid, 'discuss')}
                            >
                              Ask student to discuss
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              <div className="ov">
                <HumanChip>Final score</HumanChip>
                <label className="lbl" htmlFor={`ov-${q.qid}`}>
                  Override score
                </label>
                <input
                  id={`ov-${q.qid}`}
                  type="number"
                  min={0}
                  max={q.marks}
                  step={0.5}
                  value={scores[q.qid] ?? ''}
                  aria-invalid={scoreErrors[q.qid] ? 'true' : undefined}
                  aria-describedby={scoreErrors[q.qid] ? `ov-err-${q.qid}` : undefined}
                  onChange={(e) =>
                    setScores((s) => ({ ...s, [q.qid]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onOverride(q.qid, q.marks)
                    }
                  }}
                />
                <span className="small">out of {q.marks}</span>
                <button
                  type="button"
                  className="btn small"
                  disabled={busyQ === q.qid}
                  onClick={() => onOverride(q.qid, q.marks)}
                >
                  Save score
                </button>
                {scoreErrors[q.qid] ? (
                  <p className="ferr" id={`ov-err-${q.qid}`} style={{ flexBasis: '100%' }}>
                    <Icon name="alert" className="sm" />
                    <span>{scoreErrors[q.qid]}</span>
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
