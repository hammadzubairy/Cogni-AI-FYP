import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { useConfirm } from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import Pill from '../../components/Pill'
import QuestionCard from '../../components/QuestionCard'
import { useToast } from '../../components/Toast'
import { formatShortDate } from '../../utils/format'
import { BLOOM_SPREAD, examMaxMarks, needsApproval } from '../../utils/teacher'

function Stepper({ step = 2 }) {
  return (
    <ol className="stepper" aria-label="Create exam progress">
      <li className="done">
        <span className="n">
          <Icon name="check" className="sm" />
        </span>
        Generate draft
        <span className="sr-only"> (done)</span>
      </li>
      <li aria-hidden="true">
        <span className="ln done" />
      </li>
      <li className={step === 2 ? 'cur' : ''}>
        <span className="n">2</span>
        Review and send
      </li>
    </ol>
  )
}

function ApprovalPill({ required }) {
  return required ? (
    <Pill tone="p-warn">HOD approval</Pill>
  ) : (
    <Pill tone="p-grey">No approval needed</Pill>
  )
}

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

function flashCard(qid) {
  const el = document.getElementById(`qc-${qid}`)
  if (!el) return
  el.classList.remove('flash-row')
  void el.offsetWidth
  el.classList.add('flash-row')
}

function enrichQuestions(questions, chunkByIdx) {
  return (questions || []).map((q) => {
    const chunk = chunkByIdx.get(q.source_chunk_idx)
    if (!chunk) return q
    return {
      ...q,
      source_page: chunk.page,
      source_heading: chunk.heading,
    }
  })
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
 * Teacher exam/paper editor (v7 `P['t-exam']` + `qCard` + ACT handlers).
 */
export default function ExamEditor() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const genWarnings = location.state?.warnings || []

  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [checks, setChecks] = useState([])
  const [classExams, setClassExams] = useState([])
  const [chunkByIdx, setChunkByIdx] = useState(() => new Map())
  const [hodName, setHodName] = useState('')
  const [approvalPolicy, setApprovalPolicy] = useState('major')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const [editQid, setEditQid] = useState(null)
  const [regenQid, setRegenQid] = useState(null)
  const [editedQids, setEditedQids] = useState(() => new Set())
  const [busyAction, setBusyAction] = useState(null)
  const [filterType, setFilterType] = useState('')
  const [filterBloom, setFilterBloom] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionError(null)
    try {
      const x = await api.getExam(id)
      setExam(x)

      // Teachers cannot read admin settings (403) — fall back to seed default `major`.
      try {
        const settings = await api.getAdminSettings()
        if (settings?.approval) setApprovalPolicy(settings.approval)
      } catch {
        /* keep major */
      }

      const [c, ck, xs] = await Promise.all([
        api.getClass(x.class_id).catch(() => null),
        api.getExamChecks(id).catch(() => []),
        api.listExams({ class_id: x.class_id }).catch(() => []),
      ])
      setCls(c)
      setChecks(Array.isArray(ck) ? ck : [])
      setClassExams(xs || [])
      setHodName('')

      const map = new Map()
      await Promise.all(
        (x.material_ids || []).map(async (mid) => {
          try {
            const mat = await api.getMaterial(mid)
            ;(mat.chunks || []).forEach((ch) => {
              if (ch.idx != null && !map.has(ch.idx)) map.set(ch.idx, ch)
            })
          } catch {
            /* ignore */
          }
        }),
      )
      setChunkByIdx(map)
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

  const refreshChecks = useCallback(async (examId) => {
    try {
      const ck = await api.getExamChecks(examId)
      setChecks(Array.isArray(ck) ? ck : [])
    } catch {
      /* keep prior */
    }
  }, [])

  const questions = useMemo(
    () => enrichQuestions(exam?.questions, chunkByIdx),
    [exam, chunkByIdx],
  )
  const repeats = useMemo(() => repeatedQids(exam, classExams), [exam, classExams])
  const editable = exam ? ['draft', 'returned'].includes(exam.status) : false
  const na = exam ? needsApproval(exam, approvalPolicy) : false
  const maxMarks = examMaxMarks(exam)

  const filtered = useMemo(() => {
    return questions
      .map((q, i) => [q, i])
      .filter(([q]) => (!filterType || q.type === filterType) && (!filterBloom || q.bloom === filterBloom))
  }, [questions, filterType, filterBloom])

  function errMsg(err) {
    return err instanceof ApiError ? err.message : 'Something went wrong.'
  }

  async function withExamUpdate(fn, { toastMsg, clearEdit = true } = {}) {
    setActionError(null)
    setBusyAction(true)
    try {
      const next = await fn()
      if (next) {
        setExam(next)
        if (clearEdit) setEditQid(null)
        await refreshChecks(next.id || id)
        try {
          setClassExams(await api.listExams({ class_id: next.class_id }))
        } catch {
          /* ignore */
        }
      }
      if (toastMsg) toast(toastMsg)
      return next
    } catch (err) {
      const msg = errMsg(err)
      setActionError(msg)
      toast(msg, { type: 'error' })
      throw err
    } finally {
      setBusyAction(null)
    }
  }

  async function onSaveQuestion(qid, body) {
    try {
      await withExamUpdate(() => api.patchExamQuestion(id, qid, body), {
        toastMsg: 'Question saved',
      })
      setEditedQids((prev) => new Set(prev).add(qid))
      requestAnimationFrame(() => flashCard(qid))
    } catch {
      /* toasted */
    }
  }

  async function onDeleteQuestion(qid, index) {
    if ((exam.questions || []).length <= 1) {
      toast('A paper needs at least one question', { type: 'error' })
      return
    }
    const ok = await confirm({
      title: `Remove Q${index + 1}?`,
      body: 'This question is removed from the paper. You can add another of the same type later.',
      ok: 'Remove question',
      tone: 'bad',
    })
    if (!ok) return
    try {
      await withExamUpdate(() => api.deleteExamQuestion(id, qid), {
        toastMsg: `Q${index + 1} removed`,
      })
    } catch {
      /* toasted */
    }
  }

  async function onRegenQuestion(qid) {
    if (regenQid) return
    setRegenQid(qid)
    try {
      const next = await withExamUpdate(() => api.regenerateExamQuestion(id, qid), {
        toastMsg: 'New question generated and checked',
        clearEdit: editQid === qid,
      })
      setEditedQids((prev) => {
        const s = new Set(prev)
        s.delete(qid)
        return s
      })
      const newQ = (next?.questions || []).find((q) => q.qid === qid)
      if (newQ) requestAnimationFrame(() => flashCard(newQ.qid))
    } catch {
      /* toasted */
    } finally {
      setRegenQid(null)
    }
  }

  async function onAddQuestion(type) {
    try {
      const res = await withExamUpdate(
        async () => {
          const r = await api.addExamQuestion(id, type)
          return r?.exam || r
        },
        { toastMsg: 'Question added at the end' },
      )
      const qs = res?.questions || []
      const last = qs[qs.length - 1]
      if (last) {
        requestAnimationFrame(() => {
          const card = document.getElementById(`qc-${last.qid}`)
          if (card) {
            card.scrollIntoView({
              block: 'center',
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
            })
            flashCard(last.qid)
          }
        })
      }
    } catch {
      /* toasted */
    }
  }

  async function onSubmit() {
    if (!(exam.questions || []).length) {
      toast('Add at least one question', { type: 'error' })
      return
    }
    try {
      await withExamUpdate(() => api.submitExamForApproval(id), {
        toastMsg: hodName ? `Sent to ${hodName}` : 'Sent to HOD for approval',
      })
    } catch {
      /* toasted */
    }
  }

  async function onWithdraw() {
    try {
      await withExamUpdate(() => api.withdrawExam(id), {
        toastMsg: 'Withdrawn. You can edit again.',
      })
    } catch {
      /* toasted */
    }
  }

  async function onPublish() {
    if (!(exam.questions || []).length) {
      toast('Add at least one question', { type: 'error' })
      return
    }
    if (na && exam.status !== 'approved') {
      toast('This paper needs HOD approval first', { type: 'error' })
      return
    }
    const n = cls?.student_count ?? cls?.student_ids?.length ?? 0
    const code = cls?.code || 'the class'
    const ok = await confirm({
      title: `Publish ${exam.title}?`,
      body: `${n} students in ${code} are notified and can start straight away. The paper can't be edited after publishing.`,
      ok: 'Publish to students',
      tone: 'good',
    })
    if (!ok) return
    try {
      await withExamUpdate(() => api.publishExam(id), {
        toastMsg: `Published. ${n} students notified.`,
      })
    } catch {
      /* toasted */
    }
  }

  async function onClose() {
    const ok = await confirm({
      title: `Close ${exam.title}?`,
      body: "Students can no longer start or continue it. In-progress attempts will be submitted as they are. This can't be reopened.",
      ok: 'Close exam',
      tone: 'bad',
    })
    if (!ok) return
    try {
      await withExamUpdate(() => api.closeExam(id), {
        toastMsg: 'Exam closed. In-progress attempts were submitted.',
      })
    } catch {
      /* toasted */
    }
  }

  async function onDeleteDraft() {
    const n = exam.questions?.length ?? 0
    const ok = await confirm({
      title: 'Delete this draft?',
      body: `${exam.title} and all ${n} of its questions are removed. This can't be undone.`,
      ok: 'Delete draft',
      tone: 'bad',
    })
    if (!ok) return
    setBusyAction('delete')
    setActionError(null)
    try {
      await api.deleteExam(id)
      toast('Draft deleted')
      navigate(
        cls ? `/app/teacher/classes/${cls.id}?tab=exams` : '/app/teacher/exams',
        { replace: true },
      )
    } catch (err) {
      const msg = errMsg(err)
      setActionError(msg)
      toast(msg, { type: 'error' })
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) return <ShellLoading label="Loading exam…" />
  if (error) {
    return <ShellError message={error.message || 'Exam not found.'} onRetry={load} />
  }
  if (!exam) return <EmptyState>Exam not found.</EmptyState>

  const status = exam.status
  let acts = null
  if (editable) {
    acts = (
      <>
        <button
          type="button"
          className="btn ghost"
          style={{ color: 'var(--color-destructive)' }}
          onClick={onDeleteDraft}
          disabled={!!busyAction}
        >
          <Icon name="trash" className="sm" />
          Delete draft…
        </button>
        <span className="vsep" aria-hidden="true" />
        {na ? (
          <button
            type="button"
            className="btn primary"
            onClick={onSubmit}
            disabled={!!busyAction}
          >
            <Icon name="send" className="sm" />
            {status === 'returned' ? 'Resubmit to HOD' : 'Send to HOD for approval'}
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={onPublish}
            disabled={!!busyAction}
          >
            Publish to students…
          </button>
        )}
      </>
    )
  } else if (status === 'pending') {
    acts = (
      <button type="button" className="btn" onClick={onWithdraw} disabled={!!busyAction}>
        Withdraw and edit
      </button>
    )
  } else if (status === 'approved') {
    acts = (
      <button type="button" className="btn primary" onClick={onPublish} disabled={!!busyAction}>
        Publish to students…
      </button>
    )
  } else if (status === 'published') {
    acts = (
      <>
        <button type="button" className="btn" onClick={onClose} disabled={!!busyAction}>
          Close exam…
        </button>
        <Link className="btn primary" to={`/app/teacher/exams/${exam.id}/results`}>
          View results
        </Link>
      </>
    )
  } else if (status === 'closed') {
    acts = (
      <Link className="btn primary" to={`/app/teacher/exams/${exam.id}/results`}>
        View results
      </Link>
    )
  }

  const crumb = (
    <>
      <Link to="/app/teacher">Home</Link> <span aria-hidden="true">/</span>{' '}
      {cls ? (
        <>
          <Link to={`/app/teacher/classes/${cls.id}`}>{cls.code}</Link>{' '}
          <span aria-hidden="true">/</span>{' '}
          <Link to={`/app/teacher/classes/${cls.id}?tab=exams`}>Exams</Link>
        </>
      ) : (
        <Link to="/app/teacher/exams">My exams</Link>
      )}{' '}
      <span aria-hidden="true">/</span> {exam.kind} · {exam.duration_min} min · {maxMarks} marks
    </>
  )

  return (
    <>
      <PageTop
        crumb={crumb}
        title={
          <h1>
            {exam.title} <Pill status={exam.status} /> <ApprovalPill required={na} />
          </h1>
        }
        actions={acts}
      />

      {editable ? <Stepper step={2} /> : null}

      {status === 'returned' ? (
        <div className="callout red">
          <Icon name="alert" />
          <div>
            <b>Returned by {hodName || 'HOD'}:</b> {exam.hod_comment}
            <br />
            Edit the paper, then resubmit.
          </div>
        </div>
      ) : null}
      {status === 'draft' ? (
        <div className="callout blue">
          <Icon name="info" />
          <div>
            <b>Review each question.</b> Edit, regenerate or remove anything that isn&apos;t right,
            then {na ? 'send the paper to your HOD' : 'publish it to students'}.
          </div>
        </div>
      ) : null}
      {status === 'pending' ? (
        <div className="callout">
          <Icon name="clock" />
          <div>
            <b>Waiting for HOD approval.</b> {hodName || 'Your HOD'} has been notified. Editing is
            locked while it&apos;s under review.
          </div>
        </div>
      ) : null}
      {status === 'approved' ? (
        <div className="callout green">
          <Icon name="check" />
          <div>
            <b>Approved{exam.hod_comment ? ':' : '.'}</b>{' '}
            {exam.hod_comment} Publish when you&apos;re ready.
          </div>
        </div>
      ) : null}
      {!editable && status !== 'pending' && status !== 'approved' ? (
        <div className="callout">
          <Icon name="info" />
          <div>
            <b>Editing is locked.</b> Questions can only be changed while the paper is a draft or
            has been returned by the HOD.
          </div>
        </div>
      ) : null}

      {genWarnings.length ? (
        <div className="callout">
          <Icon name="warn" />
          <div>
            {genWarnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="callout red">
          <Icon name="alert" />
          <div>{actionError}</div>
        </div>
      ) : null}

      <div className="grid g2">
        <div>
          <div className="filters">
            <select
              aria-label="Filter by type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All types</option>
              {['MCQ', 'Short', 'Essay'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by Bloom level"
              value={filterBloom}
              onChange={(e) => setFilterBloom(e.target.value)}
            >
              <option value="">All Bloom levels</option>
              {['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="small" role="status">
              {filtered.length} of {questions.length} shown
            </span>
            {editable ? (
              <>
                <span className="sp" />
                <span className="small">Add:</span>
                {['MCQ', 'Short', 'Essay'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="btn small"
                    onClick={() => onAddQuestion(t)}
                    disabled={!!busyAction || !!regenQid}
                  >
                    <Icon name="plus" className="sm" />
                    {t}
                  </button>
                ))}
              </>
            ) : null}
          </div>

          <div className="grid" style={{ gap: 12 }}>
            {filtered.length ? (
              filtered.map(([q, i]) => (
                <QuestionCard
                  key={q.qid}
                  question={q}
                  index={i}
                  editable={editable}
                  editing={editQid === q.qid}
                  regenerating={regenQid === q.qid}
                  humanEdited={editedQids.has(q.qid)}
                  repeats={repeats.has(q.qid)}
                  onEdit={(qid) => setEditQid(qid)}
                  onCancel={() => setEditQid(null)}
                  onSave={onSaveQuestion}
                  onRegen={onRegenQuestion}
                  onDelete={onDeleteQuestion}
                />
              ))
            ) : (
              <div className="panel empty">
                {questions.length
                  ? 'No questions match these filters.'
                  : 'No questions yet. Add one above.'}
              </div>
            )}
          </div>
        </div>

        <div className="sticky" style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <Panel title={na ? 'Checks your HOD will see' : 'Automatic checks'}>
            {checks.length ? (
              checks.map((k, i) => <PolRow key={i} check={k} />)
            ) : (
              <div className="empty">No checks yet.</div>
            )}
          </Panel>

          <Panel title="Bloom spread">
            <div className="statusbars">
              {BLOOM_SPREAD.map((b) => {
                const n = questions.filter((q) => q.bloom === b).length
                const pct = questions.length ? (n / questions.length) * 100 : 0
                return (
                  <div className="sb" key={b}>
                    <span>{b}</span>
                    <div className="bar" aria-hidden="true">
                      <i style={{ width: `${pct}%`, background: 'var(--color-primary)' }} />
                    </div>
                    <b className="num">{n}</b>
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel title="History">
            <div className="hist">
              {(exam.history || []).length ? (
                [...exam.history].reverse().map((h, i) => (
                  <div key={i}>
                    <span>{formatShortDate(h.at)}</span>
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
