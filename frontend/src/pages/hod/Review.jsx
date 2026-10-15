import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { useConfirm } from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import Pill from '../../components/Pill'
import QuestionCard from '../../components/QuestionCard'
import { useToast } from '../../components/Toast'
import { formatHistStamp } from '../../utils/hod'
import { examMaxMarks } from '../../utils/teacher'

function PolRow({ check }) {
  const ok = !!check.ok
  return (
    <div className="pol">
      <span className={`ic ${ok ? 'ok' : 'w'}`} aria-hidden="true">
        {ok ? <Icon name="check" /> : <b style={{ fontSize: 13 }}>!</b>}
      </span>
      <span>
        <span className="sr-only">{ok ? 'Passed: ' : 'Needs attention: '}</span>
        {check.text}
      </span>
      <span className="small">{check.detail}</span>
    </div>
  )
}

function HumanChip({ children = 'You decide' }) {
  return (
    <span className="chip-human">
      <Icon name="check" />
      {children}
    </span>
  )
}

function repeatedQids(exam, classExams) {
  if (!exam) return new Set()
  const prior = (classExams || []).filter(
    (e) =>
      e.id !== exam.id &&
      e.status !== 'draft' &&
      String(e.created_at || '') < String(exam.created_at || '~'),
  )
  const used = new Set()
  prior.forEach((e) => {
    ;(e.questions || []).forEach((q) => {
      if (q.source_chunk_idx != null) used.add(q.source_chunk_idx)
    })
  })
  return new Set(
    (exam.questions || [])
      .filter((q) => q.source_chunk_idx != null && used.has(q.source_chunk_idx))
      .map((q) => q.qid),
  )
}

/**
 * HOD paper review (v7 `P['h-review']` + ACT h-approve / h-return).
 */
export default function Review() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [checks, setChecks] = useState([])
  const [classExams, setClassExams] = useState([])
  const [teacherName, setTeacherName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [comment, setComment] = useState('')
  const [commentErr, setCommentErr] = useState('')
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const x = await api.getExam(id)
      setExam(x)

      const [c, ck, xs, analytics] = await Promise.all([
        api.getClass(x.class_id).catch(() => null),
        api.getExamChecks(id).catch(() => []),
        api.listExams({ class_id: x.class_id }).catch(() => []),
        api.getHodAnalytics().catch(() => null),
      ])
      setCls(c)
      setChecks(ck || [])
      setClassExams(xs || [])

      const fromAnalytics = (analytics?.teacher_activity || []).find(
        (t) => t.teacher_id === x.teacher_id,
      )
      setTeacherName(fromAnalytics?.teacher_name || 'Teacher')

      const failed = (ck || []).filter((k) => !k.ok)
      if (x.status === 'pending') {
        setComment(
          failed.length
            ? `Please fix: ${failed.map((k) => k.text).join('; ')}.`
            : '',
        )
      } else {
        setComment('')
      }
      setCommentErr('')
    } catch (err) {
      setError(err)
      setExam(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const repeats = useMemo(() => repeatedQids(exam, classExams), [exam, classExams])
  const failed = useMemo(() => checks.filter((k) => !k.ok).length, [checks])
  const pending = exam?.status === 'pending'
  const maxMarks = exam ? examMaxMarks(exam) : 0
  const questions = exam?.questions || []

  const onReturn = async () => {
    const cm = comment.trim()
    if (!cm) {
      setCommentErr('Add a comment so the teacher knows what to change')
      document.getElementById('h-comment')?.focus()
      return
    }
    setCommentErr('')
    setBusy('return')
    try {
      await api.returnExam(id, cm)
      toast(`Returned to ${teacherName}`)
      navigate('/app/hod/approvals')
    } catch (err) {
      toast(err.message || 'Could not return the paper.', { type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const onApprove = async () => {
    const ok = await confirm({
      title: `Approve ${exam.title}?`,
      body: (
        <>
          {teacherName} is notified and can publish it to students.
          {failed ? (
            <>
              {' '}
              <b>Some policy checks have not passed.</b>
            </>
          ) : null}
        </>
      ),
      ok: 'Approve paper',
      tone: 'good',
    })
    if (!ok) return
    setBusy('approve')
    try {
      await api.approveExam(id, comment.trim() || null)
      toast(`Approved. ${teacherName} has been notified.`)
      navigate('/app/hod/approvals')
    } catch (err) {
      toast(err.message || 'Could not approve the paper.', { type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <ShellLoading label="Loading paper…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load this paper.'} onRetry={load} />
    )
  }
  if (!exam) {
    return <EmptyState>Paper not found.</EmptyState>
  }

  return (
    <>
      <PageTop
        crumb={
          <>
            <Link to="/app/hod/approvals">
              <Icon name="left" className="sm" />
              Paper approvals
            </Link>{' '}
            <span aria-hidden="true">/</span> {cls?.code || '—'} · {teacherName} · {exam.kind}{' '}
            · {questions.length} questions · {maxMarks} marks
          </>
        }
        title={
          <h1>
            {exam.title} <Pill status={exam.status} />
          </h1>
        }
        actions={
          pending ? (
            <a className="btn" href="#decision">
              Go to decision <Icon name="chev" className="sm" />
            </a>
          ) : null
        }
      />

      {!pending && exam.hod_comment ? (
        <div className={`callout ${exam.status === 'returned' ? 'red' : 'green'}`}>
          <Icon name={exam.status === 'returned' ? 'alert' : 'check'} />
          <div>
            <b>Your comment:</b> {exam.hod_comment}
          </div>
        </div>
      ) : null}

      <div className="grid g2">
        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          {questions.length ? (
            questions.map((q, i) => (
              <QuestionCard
                key={q.qid}
                question={q}
                index={i}
                editable={false}
                repeats={repeats.has(q.qid)}
              />
            ))
          ) : (
            <EmptyState>This paper has no questions.</EmptyState>
          )}
        </div>

        <div className="sticky" style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          {pending ? (
            <section
              className="panel decision human-card"
              id="decision"
              aria-labelledby="dec-h"
            >
              <div className="panel-h">
                <h3 id="dec-h" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  Your decision <HumanChip>You decide</HumanChip>
                </h3>
                <Pill
                  label={
                    failed
                      ? `${failed} check${failed > 1 ? 's' : ''} failed`
                      : 'All checks passed'
                  }
                  tone={failed ? 'p-warn' : 'p-good'}
                />
              </div>
              <div className="panel-b">
                <Field
                  id="h-comment"
                  label={`Comment to ${teacherName}`}
                  hint="Required when returning. Optional when approving."
                  error={commentErr}
                >
                  <textarea
                    id="h-comment"
                    rows={4}
                    aria-describedby="h-comment-h"
                    aria-invalid={commentErr ? 'true' : undefined}
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value)
                      if (commentErr) setCommentErr('')
                    }}
                    disabled={!!busy}
                  />
                </Field>
                <div className="acts">
                  <button
                    type="button"
                    className="btn bad"
                    onClick={onReturn}
                    disabled={!!busy}
                  >
                    Return with comments
                  </button>
                  <button
                    type="button"
                    className="btn good"
                    onClick={onApprove}
                    disabled={!!busy}
                  >
                    <Icon name="check" className="sm" />
                    Approve paper…
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <Panel
            title="Policy checks"
            headerRight={
              <Link className="btn ghost small" to="/app/hod/policy">
                Edit policy
              </Link>
            }
          >
            {checks.length ? (
              checks.map((k, i) => <PolRow key={i} check={k} />)
            ) : (
              <div className="empty">No checks yet.</div>
            )}
          </Panel>

          <Panel title="History">
            <div className="hist">
              {(exam.history || []).length ? (
                [...exam.history].reverse().map((h, i) => (
                  <div key={i}>
                    <span>{formatHistStamp(h.at)}</span>
                    {h.text}
                  </div>
                ))
              ) : (
                <div className="empty">No history yet.</div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
