import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import { useToast } from '../../components/Toast'

function AiChip({ children = 'AI detector' }) {
  return (
    <span className="chip-ai">
      <Icon name="spark" />
      {children}
    </span>
  )
}

/**
 * Teacher AI-writing flags inbox (v7 `P['t-flags']`).
 * API returns undecided flags only; decided ones leave this list.
 */
export default function Flags() {
  const navigate = useNavigate()
  const toast = useToast()

  const [flags, setFlags] = useState([])
  const [exams, setExams] = useState([])
  const [examFilter, setExamFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fl, xs] = await Promise.all([api.listFlags(), api.listExams().catch(() => [])])
      setFlags(fl || [])
      setExams(xs || [])
    } catch (err) {
      setError(err)
      setFlags([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const examOptions = useMemo(() => {
    const ids = new Set(flags.map((f) => f.exam_id))
    const fromFlags = [...ids].map((eid) => {
      const hit = flags.find((f) => f.exam_id === eid)
      const ex = exams.find((x) => x.id === eid)
      return { id: eid, title: hit?.exam_title || ex?.title || 'Exam' }
    })
    const withSubs = (exams || [])
      .filter((x) => ['published', 'closed'].includes(x.status))
      .map((x) => ({ id: x.id, title: x.title }))
    const map = new Map()
    ;[...withSubs, ...fromFlags].forEach((e) => map.set(e.id, e))
    return [...map.values()]
  }, [flags, exams])

  const list = useMemo(
    () => (examFilter ? flags.filter((f) => f.exam_id === examFilter) : flags),
    [flags, examFilter],
  )

  async function onFlag(f, decision) {
    const key = `${f.attempt_id}:${f.qid}`
    setBusyKey(key)
    try {
      await api.decideAttemptFlag(f.attempt_id, f.qid, decision)
      toast(
        decision === 'cleared'
          ? 'Flag cleared. Grade stands.'
          : 'Student notified. Grade unchanged.',
      )
      setFlags((prev) =>
        prev.filter((x) => !(x.attempt_id === f.attempt_id && x.qid === f.qid)),
      )
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update flag.', {
        type: 'error',
      })
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) return <ShellLoading label="Loading flags…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load flags.'} onRetry={load} />
    )
  }

  return (
    <>
      <PageTop title="AI-writing flags" />

      <div className="callout">
        <Icon name="info" />
        <div>
          <b>A flag is a prompt to look, not a verdict.</b> Detectors misread non-native
          English more often. Grades never change automatically. Clear the flag, or ask the
          student to talk it through. Neither action changes the grade.
        </div>
      </div>

      <div className="filters">
        <select
          aria-label="Filter by exam"
          value={examFilter}
          onChange={(e) => setExamFilter(e.target.value)}
        >
          <option value="">All exams</option>
          {examOptions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
        <span className="small">
          {list.length} awaiting review · 0 decided
        </span>
      </div>

      <div className="panel">
        {list.length ? (
          list.map((f) => {
            const p = Math.round(f.ai_probability ?? 0)
            const key = `${f.attempt_id}:${f.qid}`
            const busy = busyKey === key
            return (
              <div className="lrow flagrow ai-card" key={key}>
                <div className="grow">
                  <div className="row">
                    <b>{f.student_name}</b>
                    <span className="small">
                      {f.exam_title} · {f.question_text ? truncateQ(f) : f.qid}
                    </span>
                  </div>
                  <div
                    className="small"
                    style={{ marginTop: 4, maxWidth: '80ch' }}
                  >
                    &ldquo;{f.answer_excerpt || ''}&rdquo;
                  </div>
                </div>
                <div className="meter">
                  <div
                    className="row small"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span>AI likelihood</span>
                    <b className="mono">
                      {p}%{p >= 85 ? ' · high' : ''}
                    </b>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <AiChip>AI detector</AiChip>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${p}%`,
                        background:
                          p >= 85
                            ? 'var(--color-destructive)'
                            : 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => navigate(`/app/teacher/attempts/${f.attempt_id}`)}
                  >
                    Open answer
                  </button>
                  <Link
                    className="sr-only"
                    to={`/app/teacher/attempts/${f.attempt_id}`}
                  >
                    Open attempt
                  </Link>
                  <button
                    type="button"
                    className="btn small"
                    disabled={busy}
                    aria-label={`Clear flag for ${f.student_name}`}
                    onClick={() => onFlag(f, 'cleared')}
                  >
                    <Icon name="check" className="sm" />
                    Clear flag
                  </button>
                  <button
                    type="button"
                    className="btn small bad"
                    disabled={busy}
                    aria-label={`Ask ${f.student_name} to discuss`}
                    onClick={() => onFlag(f, 'discuss')}
                  >
                    Ask to discuss
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <EmptyState panel={false}>
            No flagged answers. Flags appear when a student&apos;s written answer scores
            above the exam threshold.
          </EmptyState>
        )}
      </div>
    </>
  )
}

function truncateQ(f) {
  const t = f.question_text || ''
  // Prefer "Qn Type" style when we only have text — show short label
  const short = t.length > 40 ? `${t.slice(0, 40)}…` : t
  return short
}
