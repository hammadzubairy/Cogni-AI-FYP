import { isMcqQuestion } from '../../utils/teacher'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { Icon } from '../../components/IconSprite'
import { useModal } from '../../components/Modal'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import { useToast } from '../../components/Toast'
import useExamLock, {
  exitExamFullscreen,
  MAX_EXAM_VIOLATIONS,
  requestExamFullscreen,
} from '../../hooks/useExamLock'
import {
  answeredCount,
  formatMmSs,
  isAnswered,
  secondsLeft,
  unansweredIndexes,
  wordCount,
} from '../../utils/student'

const SAVE_DEBOUNCE_MS = 800
const LETTERS = 'ABCD'

function SaveStatus({ status }) {
  if (status === 'saving') {
    return (
      <span className="saved" role="status">
        Saving…
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="saved" role="status" style={{ color: 'var(--color-destructive)' }}>
        Not saved, retrying
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="saved" role="status">
        <Icon name="check" className="sm" />
        <span>Saved</span>
      </span>
    )
  }
  return null
}

function violationLabel(type) {
  if (type === 'tab_hide') return 'tab switch or minimize'
  if (type === 'window_blur') return 'switched to another window'
  if (type === 'fullscreen_exit') return 'left fullscreen'
  return 'left the exam'
}

export default function TakeExam() {
  const { id: examId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const qIndex = Math.max(0, parseInt(searchParams.get('q') || '0', 10) || 0)
  const navigate = useNavigate()
  const toast = useToast()
  const { openModal, closeModal } = useModal()

  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [answers, setAnswers] = useState({})
  const [deadline, setDeadline] = useState(null)
  const [serverNow, setServerNow] = useState(null)
  const [receivedAt, setReceivedAt] = useState(null)
  const [left, setLeft] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | before | taking | submitted | closed | error
  const [error, setError] = useState(null)
  const [saveStatus, setSaveStatus] = useState('') // '' | saving | saved | error
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [fsError, setFsError] = useState('')

  const answersRef = useRef({})
  const attemptRef = useRef(null)
  const saveTimers = useRef({})
  const saveChains = useRef({})
  const warnedRef = useRef({})
  const submittingRef = useRef(false)
  const titleRef = useRef(null)
  const lockPayloadRef = useRef(() => ({ violation_count: 0, integrity_events: [] }))
  const disarmRef = useRef(() => {})

  useEffect(() => {
    answersRef.current = answers
  }, [answers])
  useEffect(() => {
    attemptRef.current = attempt
  }, [attempt])

  const questions = exam?.questions || []
  const qi = Math.min(qIndex, Math.max(0, questions.length - 1))
  const q = questions[qi]
  const answered = answeredCount(questions, answers)

  const goQ = useCallback(
    (i) => {
      const next = new URLSearchParams(searchParams)
      next.set('q', String(Math.max(0, i)))
      setSearchParams(next, { replace: true })
      requestAnimationFrame(() => titleRef.current?.focus())
    },
    [searchParams, setSearchParams],
  )

  const endExam = useCallback(
    async ({ endReason, toastMsg, forfeit = false }) => {
      if (submittingRef.current) return
      const at = attemptRef.current
      if (!at || at.status === 'submitted') return
      submittingRef.current = true
      setSubmitting(true)
      disarmRef.current()
      try {
        Object.values(saveTimers.current).forEach((t) => clearTimeout(t))
        saveTimers.current = {}
        await Promise.all(
          Object.entries(answersRef.current).map(async ([qid, value]) => {
            try {
              await api.putAttemptAnswer(at.id, qid, value)
            } catch {
              /* best effort */
            }
          }),
        )
        const integrity = lockPayloadRef.current()
        if (forfeit) {
          await api.forfeitAttempt(at.id, {
            reason: endReason === 'violations' ? 'violations' : 'exit',
            ...integrity,
          })
        } else {
          await api.submitAttempt(at.id, {
            end_reason: endReason || 'manual',
            ...integrity,
          })
        }
        try {
          await exitExamFullscreen()
        } catch {
          /* ignore */
        }
        setPhase('submitted')
        toast(toastMsg || 'Exam submitted')
        navigate(`/app/student/attempts/${at.id}/done`, { replace: true })
      } catch (err) {
        submittingRef.current = false
        setSubmitting(false)
        toast(err instanceof ApiError ? err.message : 'Could not submit. Try again.', {
          type: 'error',
        })
      }
    },
    [navigate, toast],
  )

  const doSubmit = useCallback(
    (auto) =>
      endExam({
        endReason: auto ? 'time_up' : 'manual',
        toastMsg: auto ? 'Time is up. Your answers have been submitted.' : 'Exam submitted',
        forfeit: false,
      }),
    [endExam],
  )

  const onMaxViolations = useCallback(
    () =>
      endExam({
        endReason: 'violations',
        toastMsg: 'Too many lock violations. Your exam has been submitted and cannot be retaken.',
        forfeit: true,
      }),
    [endExam],
  )

  const lock = useExamLock({
    active: phase === 'taking' && !submitting,
    onMaxViolations,
  })

  useEffect(() => {
    lockPayloadRef.current = lock.getIntegrityPayload
    disarmRef.current = lock.disarm
  }, [lock.getIntegrityPayload, lock.disarm])

  const load = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const x = await api.getExam(examId)
      setExam(x)
      try {
        const c = await api.getClass(x.class_id)
        setCls(c)
      } catch {
        setCls(null)
      }

      if (x.status !== 'published') {
        setPhase('closed')
        return
      }

      const mine = await api.listMyAttempts({ exam_id: examId })
      const existing = (mine || []).find((a) => a.exam_id === examId) || (mine || [])[0]

      if (existing?.status === 'submitted') {
        setAttempt(existing)
        setPhase('submitted')
        return
      }

      if (existing?.status === 'in_progress') {
        const started = await api.startAttempt(examId)
        const now = Date.now()
        setAttempt(started)
        setAnswers({ ...(started.answers || {}) })
        setDeadline(started.deadline)
        setServerNow(started.server_now)
        setReceivedAt(now)
        setPhase('taking')
        return
      }

      setPhase('before')
    } catch (err) {
      setError(err)
      setPhase('error')
    }
  }, [examId])

  useEffect(() => {
    load()
  }, [load])

  /* exam-mode body class */
  useEffect(() => {
    const on = phase === 'taking'
    document.body.classList.toggle('exam-mode', on)
    return () => document.body.classList.remove('exam-mode')
  }, [phase])

  /* online / offline */
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  /* Warn on hard tab close; do not auto-forfeit on refresh (resume + re-lock). */
  useEffect(() => {
    if (phase !== 'taking') return undefined
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase])

  /* Block in-app link navigation while locked (sidebar is CSS-hidden; crumbs/other links) */
  useEffect(() => {
    if (phase !== 'taking') return undefined
    const onClick = (e) => {
      const a = e.target.closest?.('a[href]')
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
      if (href.includes(`/exams/${examId}/take`)) return
      e.preventDefault()
      e.stopPropagation()
      askExit()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
    // askExit is stable enough via refs; eslint intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, examId])

  /* countdown timer */
  useEffect(() => {
    if (phase !== 'taking' || !deadline || !serverNow || !receivedAt) return undefined
    const tick = () => {
      const s = secondsLeft(deadline, serverNow, receivedAt)
      setLeft(s)
      const at = attemptRef.current
      if (!at) return
      const w = warnedRef.current
      ;[
        [300, '5 minutes left'],
        [60, '1 minute left'],
      ].forEach(([thresh, msg]) => {
        const k = `${at.id}-${thresh}`
        if (s <= thresh && s > 0 && !w[k]) {
          w[k] = 1
          toast(`${msg}. Your answers are saved.`)
        }
      })
      if (s <= 0) {
        doSubmit(true)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, deadline, serverNow, receivedAt, doSubmit, toast])

  const persistAnswer = useCallback(
    async (qid, value) => {
      const at = attemptRef.current
      if (!at || at.status === 'submitted') return
      const run = async () => {
        setSaveStatus('saving')
        try {
          const updated = await api.putAttemptAnswer(at.id, qid, value)
          setAttempt(updated)
          setSaveStatus('saved')
        } catch (err) {
          setSaveStatus('error')
          await new Promise((r) => setTimeout(r, 1200))
          try {
            const updated = await api.putAttemptAnswer(at.id, qid, value)
            setAttempt(updated)
            setSaveStatus('saved')
          } catch {
            setSaveStatus('error')
            toast(
              err instanceof ApiError ? err.message : 'Could not save answer. Check your connection.',
              { type: 'error' },
            )
          }
        }
      }
      const prev = saveChains.current[qid] || Promise.resolve()
      saveChains.current[qid] = prev.then(run, run)
      return saveChains.current[qid]
    },
    [toast],
  )

  const scheduleSave = useCallback(
    (qid, value) => {
      clearTimeout(saveTimers.current[qid])
      setSaveStatus('saving')
      saveTimers.current[qid] = setTimeout(() => {
        persistAnswer(qid, value)
      }, SAVE_DEBOUNCE_MS)
    },
    [persistAnswer],
  )

  function setAnswerLocal(qid, value) {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: value }
      answersRef.current = next
      return next
    })
    scheduleSave(qid, value)
  }

  async function onStart() {
    setStarting(true)
    setFsError('')
    try {
      try {
        await requestExamFullscreen()
      } catch {
        setFsError(
          'Fullscreen is required to start. Allow fullscreen, or use a desktop browser that supports it.',
        )
        setStarting(false)
        return
      }
      const started = await api.startAttempt(examId)
      const now = Date.now()
      setAttempt(started)
      setAnswers({ ...(started.answers || {}) })
      setDeadline(started.deadline)
      setServerNow(started.server_now)
      setReceivedAt(now)
      setPhase('taking')
      goQ(0)
      toast(`Exam started. You have ${exam.duration_min} minutes. Stay in fullscreen.`)
    } catch (err) {
      try {
        await exitExamFullscreen()
      } catch {
        /* ignore */
      }
      toast(err instanceof ApiError ? err.message : 'Could not start the exam.', { type: 'error' })
    } finally {
      setStarting(false)
    }
  }

  function askExit() {
    if (!exam || !attempt || submittingRef.current) return
    openModal(
      <>
        <h3>Exit exam?</h3>
        <p className="small">
          Leaving now will <b>submit your answers and use up your only attempt</b>. You will not be
          able to retake this exam.
        </p>
        <div className="acts">
          <button type="button" className="btn" onClick={closeModal}>
            Keep working
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={submitting}
            onClick={() => {
              closeModal()
              endExam({
                endReason: 'exit',
                toastMsg: 'You exited the exam. Your attempt has been submitted.',
                forfeit: true,
              })
            }}
          >
            Exit and forfeit attempt
          </button>
        </div>
      </>,
    )
  }

  function askSubmit() {
    if (!exam || !attempt || submittingRef.current) return
    const un = unansweredIndexes(questions, answersRef.current)
    const answeredN = questions.length - un.length
    openModal(
      <>
        <h3>Submit {exam.title}?</h3>
        <p className="small">
          {answeredN} of {questions.length} questions answered.{' '}
          {un.length ? (
            <b style={{ color: 'var(--color-destructive)' }}>
              Not answered: {un.map(([, i]) => `Q${i + 1}`).join(', ')}.
            </b>
          ) : null}{' '}
          You can&apos;t change answers after submitting.
        </p>
        {un.length ? (
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                closeModal()
                goQ(un[0][1])
              }}
            >
              Go to Q{un[0][1] + 1}
            </button>
          </div>
        ) : null}
        <div className="acts">
          <button type="button" className="btn" onClick={closeModal}>
            Keep working
          </button>
          <button
            type="button"
            className="btn good"
            disabled={submitting}
            onClick={() => {
              closeModal()
              doSubmit(false)
            }}
          >
            Submit exam
          </button>
        </div>
      </>,
    )
  }

  const crumb = useMemo(() => {
    if (!cls || phase === 'taking') return null
    return (
      <>
        <Link to="/app/student">Home</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/app/student/classes/${cls.id}`}>{cls.code}</Link>{' '}
        <span aria-hidden="true">/</span>{' '}
        <Link to={`/app/student/classes/${cls.id}?tab=exams`}>Exams</Link>
      </>
    )
  }, [cls, phase])

  if (phase === 'loading') return <ShellLoading label="Loading exam…" />
  if (phase === 'error') {
    return (
      <ShellError message={error?.message || 'Exam not found.'} onRetry={load} />
    )
  }
  if (!exam) return <ShellError message="Exam not found." onRetry={load} />

  if (phase === 'submitted') {
    return (
      <>
        <PageTop crumb={crumb} title={exam.title} />
        <div className="panel panel-b">
          You&apos;ve already submitted this exam.{' '}
          <Link className="btn small" to="/app/student/exams">
            My exams
          </Link>
        </div>
      </>
    )
  }

  if (phase === 'closed') {
    return (
      <>
        <PageTop crumb={crumb} title={exam.title} />
        <div className="panel panel-b">
          This exam is not open. It may have been closed by your teacher.
        </div>
      </>
    )
  }

  if (phase === 'before') {
    const counts = {}
    questions.forEach((qq) => {
      const label = qq.type || (isMcqQuestion(qq) ? 'MCQ' : 'Written')
      counts[label] = (counts[label] || 0) + 1
    })
    const mix = Object.entries(counts)
      .map(([label, n]) => `${n} ${label}`)
      .join(', ')
    const maxMarks = questions.reduce((s, qq) => s + (Number(qq.marks) || 0), 0)

    return (
      <>
        <PageTop crumb={crumb} title={exam.title} />
        <div className="panel" style={{ maxWidth: 680 }}>
          <div className="panel-b">
            <h2 style={{ fontSize: 20, marginBottom: 6 }}>Before you start</h2>
            <p style={{ color: 'var(--color-muted-foreground)', margin: '0 0 16px' }}>
              {exam.kind}
            </p>
            <div className="grid g3" style={{ gap: 10, marginBottom: 18 }}>
              <div className="sg">
                <span>Time limit</span>
                <b>{exam.duration_min} min</b>
              </div>
              <div className="sg">
                <span>Questions</span>
                <b>{questions.length}</b>
              </div>
              <div className="sg">
                <span>Total marks</span>
                <b>{maxMarks}</b>
              </div>
            </div>
            <ul
              style={{
                margin: '0 0 18px',
                paddingLeft: 20,
                color: 'var(--color-muted-foreground)',
              }}
            >
              <li>{mix}.</li>
              <li>
                The exam runs in <b>fullscreen lock</b>. Leaving the tab, another window, or
                fullscreen counts as a violation.
              </li>
              <li>
                After <b>{MAX_EXAM_VIOLATIONS} violations</b>, your answers are submitted
                automatically and you cannot retake.
              </li>
              <li>
                <b>Exit exam</b> also uses up your only attempt. You get one sitting.
              </li>
              <li>Answers save automatically. The exam submits itself when time runs out.</li>
              <li>
                Written answers must be your own; they are checked for AI-generated text and reviewed
                by your teacher.
              </li>
            </ul>
            {fsError ? (
              <div className="callout red" role="alert" style={{ marginBottom: 14 }}>
                <Icon name="alert" />
                <div>{fsError}</div>
              </div>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="btn good"
                style={{ minHeight: 48, paddingInline: 22 }}
                disabled={starting}
                onClick={onStart}
              >
                <Icon name="clock" className="sm" />
                {starting ? 'Starting…' : 'Start exam'}
              </button>
              <Link className="btn ghost" to="/app/student/exams">
                Not now
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  /* taking */
  if (!q) {
    return <ShellError message="This exam has no questions." />
  }

  const a = answers[q.qid]
  const last = qi === questions.length - 1
  const wc = wordCount(a)
  const low = left != null && left < 300
  const timerText = left == null ? '--:--' : formatMmSs(left)
  const strikesLeft = Math.max(0, lock.maxViolations - lock.violationCount)

  return (
    <>
      <PageTop title={exam.title} />

      {offline ? (
        <div className="callout red" role="status">
          <Icon name="alert" />
          <div>
            <b>You are offline.</b> Answers will retry when your connection returns. Do not close
            this tab.
          </div>
        </div>
      ) : null}

      <div className="exambar" role="region" aria-label="Exam status">
        <div className="tl">
          <Icon name="clock" />
          <div>
            <div className="small" style={{ lineHeight: 1.2 }}>
              Time left
            </div>
            <div
              className={`timer num${low ? ' low' : ''}`}
              id="timer"
              role="timer"
              aria-live="off"
            >
              {timerText}
            </div>
          </div>
        </div>
        <div className="prog">
          <div className="small">
            <b style={{ color: 'var(--color-foreground)' }} id="ans-count">
              {answered} of {questions.length}
            </b>{' '}
            answered
            <span className="hide-sm">
              {' '}
              · lock {lock.violationCount}/{lock.maxViolations}
            </span>
          </div>
          <div className="bar" aria-hidden="true">
            <i
              id="ans-bar"
              style={{
                width: `${questions.length ? Math.round((answered / questions.length) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn ghost"
          disabled={submitting}
          onClick={askExit}
        >
          Exit exam
        </button>
        <button
          type="button"
          className="btn good"
          disabled={submitting}
          onClick={askSubmit}
        >
          Submit exam…
        </button>
      </div>

      <div className="exam">
        <section className="panel" aria-labelledby="q-title">
          <div className="panel-h">
            <h2
              id="q-title"
              ref={titleRef}
              tabIndex={-1}
              style={{ fontSize: 17 }}
            >
              Question {qi + 1} of {questions.length}
            </h2>
            <Pill
              label={`${
                isMcqQuestion(q) ? 'Multiple choice' : q.type || 'Written'
              } · ${q.marks} marks`}
              tone="p-grey"
            />
          </div>
          <div className="panel-b">
            <p
              id="q-text"
              style={{
                fontSize: 17,
                fontWeight: 500,
                margin: '0 0 18px',
                maxWidth: '68ch',
              }}
            >
              {q.text}
            </p>

            {isMcqQuestion(q) ? (
              <>
                <div role="radiogroup" aria-labelledby="q-text">
                  {(q.options || []).map((o, k) => {
                    const sel = a === k
                    const tab = a == null ? k === 0 : sel
                    return (
                      <div
                        key={k}
                        className={`choice${sel ? ' sel' : ''}`}
                        role="radio"
                        aria-checked={sel}
                        tabIndex={tab ? 0 : -1}
                        onClick={() => setAnswerLocal(q.qid, k)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setAnswerLocal(q.qid, k)
                          }
                          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                            e.preventDefault()
                            const next = Math.min((q.options || []).length - 1, k + 1)
                            setAnswerLocal(q.qid, next)
                          }
                          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                            e.preventDefault()
                            const prev = Math.max(0, k - 1)
                            setAnswerLocal(q.qid, prev)
                          }
                        }}
                      >
                        <span className="k" aria-hidden="true">
                          {LETTERS[k]}
                        </span>
                        <span>{o}</span>
                        {sel ? (
                          <span className="sel-lab" aria-hidden="true">
                            <Icon name="check" className="sm" />
                            Selected
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <p className="small" style={{ margin: '4px 0 0' }}>
                  Tip: use the arrow keys to move between options.
                </p>
              </>
            ) : (
              <>
                <label htmlFor="ans" className="sr-only">
                  Your answer to question {qi + 1}
                </label>
                <textarea
                  className="answerbox"
                  id="ans"
                  value={a == null ? '' : String(a)}
                  placeholder="Write your answer in your own words…"
                  onChange={(e) => setAnswerLocal(q.qid, e.target.value)}
                />
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="small" id="wc">
                    {wc} word{wc === 1 ? '' : 's'}
                  </span>
                  <span className="sp" />
                  <SaveStatus status={saveStatus} />
                </div>
              </>
            )}

            <div className="row mt">
              <button
                type="button"
                className="btn"
                disabled={qi === 0}
                onClick={() => goQ(qi - 1)}
              >
                <Icon name="left" className="sm" />
                Previous
              </button>
              <span className="sp" />
              {!last ? (
                <button type="button" className="btn primary" onClick={() => goQ(qi + 1)}>
                  Next <Icon name="right" className="sm" />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn good"
                  disabled={submitting}
                  onClick={askSubmit}
                >
                  Review and submit…
                </button>
              )}
            </div>
          </div>
        </section>

        <aside
          className="panel panel-b sticky"
          style={{ top: 'calc(var(--topbar-h) + 100px)' }}
          aria-label="Question navigator"
        >
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Questions</h3>
          <div className="qnav">
            {questions.map((qq, j) => {
              const done = isAnswered(answers[qq.qid])
              return (
                <button
                  key={qq.qid}
                  type="button"
                  className={`${done ? 'done' : ''} ${j === qi ? 'cur' : ''}`.trim()}
                  aria-label={`Question ${j + 1}, ${done ? 'answered' : 'not answered'}`}
                  aria-current={j === qi ? 'step' : undefined}
                  onClick={() => goQ(j)}
                >
                  {j + 1}
                </button>
              )
            })}
          </div>
          <div className="legend" aria-hidden="true">
            <span>
              <i className="d" />
              Answered
            </span>
            <span>
              <i className="c" />
              Current
            </span>
            <span>
              <i />
              Not answered
            </span>
          </div>
        </aside>
      </div>

      {lock.blocked ? (
        <div className="exam-lock-overlay" role="alertdialog" aria-modal="true" aria-labelledby="exam-lock-title">
          <div className="exam-lock-card">
            <h2 id="exam-lock-title">Return to the exam</h2>
            <p>
              Detected: {violationLabel(lock.lastViolationType)}. Violations:{' '}
              <b>
                {lock.violationCount} / {lock.maxViolations}
              </b>
              .
            </p>
            {strikesLeft <= 1 && lock.violationCount < lock.maxViolations ? (
              <p className="exam-lock-warn">
                Last chance — one more violation will submit your exam permanently.
              </p>
            ) : null}
            {lock.violationCount >= lock.maxViolations ? (
              <p className="exam-lock-warn">Submitting your exam…</p>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  const ok = await lock.reenterFullscreen()
                  if (!ok) {
                    toast('Could not enter fullscreen. Allow it in the browser and try again.', {
                      type: 'error',
                    })
                  }
                }}
              >
                Return to fullscreen
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
