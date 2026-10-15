import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { useConfirm } from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import ScoreBar from '../../components/ScoreBar'
import Stat from '../../components/Stat'
import { useToast } from '../../components/Toast'
import { formatShortDate } from '../../utils/format'
import {
  aggregateTopics,
  countAtThreshold,
  flagPillLabel,
  flagPillTone,
  flagsForAttempt,
} from '../../utils/results'
import { pctColor } from '../../utils/status'

/**
 * Teacher exam results (v7 `P['t-results']`).
 */
export default function Results() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [results, setResults] = useState(null)
  const [details, setDetails] = useState([])
  const [directory, setDirectory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [threshold, setThreshold] = useState(70)
  const [savingThr, setSavingThr] = useState(false)
  const [busy, setBusy] = useState(false)
  const thrSaveTimer = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ex, res] = await Promise.all([api.getExam(id), api.getExamResults(id)])
      const c = await api.getClass(ex.class_id)
      const detailList = await Promise.all(
        (res.attempts || []).map((row) =>
          api.getAttemptDetail(row.attempt_id).catch(() => null),
        ),
      )
      const dir = {}
      ;(res.attempts || []).forEach((row) => {
        dir[row.student_id] = { name: row.student_name, email: dir[row.student_id]?.email }
      })
      setExam(ex)
      setCls(c)
      setResults(res)
      setDetails(detailList.filter(Boolean))
      setDirectory(dir)
      setThreshold(res.ai_threshold ?? ex.ai_threshold ?? 70)
    } catch (err) {
      setError(err)
      setExam(null)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => () => clearTimeout(thrSaveTimer.current), [])

  const detailByAttempt = useMemo(() => {
    const m = new Map()
    details.forEach((d) => m.set(d.attempt_id, d))
    return m
  }, [details])

  const topics = useMemo(() => aggregateTopics(details), [details])
  const weak = topics.length ? topics[0] : null
  const flagAtThr = useMemo(
    () => countAtThreshold(details, threshold),
    [details, threshold],
  )
  const pendingFlags = useMemo(() => {
    let n = 0
    details.forEach((d) => {
      flagsForAttempt(d, threshold).forEach((f) => {
        if (!f.dec) n += 1
      })
    })
    return n
  }, [details, threshold])

  const rows = useMemo(() => {
    const submitted = new Map((results?.attempts || []).map((a) => [a.student_id, a]))
    const ids = cls?.student_ids?.length
      ? cls.student_ids
      : (results?.attempts || []).map((a) => a.student_id)
    const seen = new Set()
    const list = []
    ids.forEach((sid) => {
      if (seen.has(sid)) return
      seen.add(sid)
      list.push({ studentId: sid, attempt: submitted.get(sid) || null })
    })
    ;(results?.attempts || []).forEach((a) => {
      if (seen.has(a.student_id)) return
      seen.add(a.student_id)
      list.push({ studentId: a.student_id, attempt: a })
    })
    return list
  }, [cls, results])

  function scheduleThresholdSave(value) {
    clearTimeout(thrSaveTimer.current)
    thrSaveTimer.current = setTimeout(async () => {
      setSavingThr(true)
      try {
        await api.putExamThreshold(id, value)
        setResults((r) => (r ? { ...r, ai_threshold: value } : r))
        setExam((e) => (e ? { ...e, ai_threshold: value } : e))
        toast(`Flag threshold set to ${value}%`)
        // refresh flag counts from server against new threshold
        const res = await api.getExamResults(id)
        setResults(res)
        const detailList = await Promise.all(
          (res.attempts || []).map((row) =>
            api.getAttemptDetail(row.attempt_id).catch(() => null),
          ),
        )
        setDetails(detailList.filter(Boolean))
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Could not save threshold.', {
          type: 'error',
        })
      } finally {
        setSavingThr(false)
      }
    }, 350)
  }

  function onThresholdInput(e) {
    const v = Number(e.target.value)
    setThreshold(v)
  }

  function onThresholdCommit(e) {
    const v = Number(e.target.value)
    setThreshold(v)
    scheduleThresholdSave(v)
  }

  async function onClose() {
    const ok = await confirm({
      title: `Close ${exam.title}?`,
      body: "Students can no longer start or continue it. In-progress attempts will be submitted as they are. This can't be reopened.",
      ok: 'Close exam',
      tone: 'bad',
    })
    if (!ok) return
    setBusy(true)
    try {
      const updated = await api.closeExam(id)
      setExam(updated)
      toast('Exam closed. In-progress attempts were submitted.')
      await load()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not close exam.', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function onRelease() {
    const ss = results?.attempts?.length || 0
    const enrolled = results?.aggregate?.enrolled_count ?? cls?.student_ids?.length ?? ss
    const pend = pendingFlags
    const ok = await confirm({
      title: 'Release results?',
      body: `${ss} of ${enrolled} students get their scores and feedback now.${
        pend
          ? ` ${pend} AI-writing flag${pend > 1 ? 's are' : ' is'} still unreviewed; flags never change grades on their own.`
          : ''
      } You can still adjust scores afterwards; students are notified of changes.`,
      ok: 'Release results',
    })
    if (!ok) return
    setBusy(true)
    try {
      const updated = await api.releaseExamResults(id)
      setExam(updated)
      setResults((r) => (r ? { ...r, released: true } : r))
      toast(`Results released to ${ss} students`)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not release results.', {
        type: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <ShellLoading label="Loading results…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load results.'} onRetry={load} />
    )
  }
  if (!exam || !results) {
    return <EmptyState>Exam not found.</EmptyState>
  }

  const agg = results.aggregate || {}
  const submitted = agg.submitted_count ?? results.attempts?.length ?? 0
  const enrolled = agg.enrolled_count ?? cls?.student_ids?.length ?? submitted
  const avg = submitted ? agg.average_percent : null
  const weakTopic = weak || (agg.weakest_topic
    ? [agg.weakest_topic.topic, agg.weakest_topic.percent]
    : null)
  const released = !!(results.released || exam.released)
  const live = exam.status === 'published'

  return (
    <>
      <PageTop
        crumb={
          <>
            <Link to="/app/teacher">Home</Link>
            <span aria-hidden="true"> / </span>
            <Link to={`/app/teacher/classes/${exam.class_id}?tab=exams`}>
              {cls?.code || 'Class'}
            </Link>
            <span aria-hidden="true"> / </span>
            <Link to={`/app/teacher/classes/${exam.class_id}?tab=exams`}>Exams</Link>
          </>
        }
        title={`Results · ${exam.title}`}
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => navigate(`/app/teacher/exams/${id}`)}
            >
              View paper
            </button>
            {live ? (
              <button type="button" className="btn" disabled={busy} onClick={onClose}>
                Close exam…
              </button>
            ) : null}
            <button
              type="button"
              className="btn primary"
              disabled={busy || released || !submitted}
              onClick={onRelease}
            >
              {released ? (
                <>
                  <Icon name="check" className="sm" />
                  Results released
                </>
              ) : (
                'Release results…'
              )}
            </button>
          </>
        }
      />

      {!submitted ? (
        <div className="callout blue">
          <Icon name="info" />
          <div>
            <b>No submissions yet.</b> Results can be released once students have submitted.
          </div>
        </div>
      ) : null}

      {pendingFlags && !released ? (
        <div className="callout">
          <Icon name="warn" />
          <div>
            <b>
              {pendingFlags} flagged answer{pendingFlags > 1 ? 's' : ''} still need review.
            </b>{' '}
            You can release anyway; flags never change a grade on their own.
          </div>
        </div>
      ) : null}

      <div className="grid g4">
        <Stat
          label="Submitted"
          value={`${submitted}/${enrolled}`}
          detail={live ? 'exam is live' : 'exam closed'}
        />
        <Stat
          label="Class average"
          value={submitted ? `${avg}%` : '—'}
          color={submitted ? pctColor(avg) : undefined}
        />
        <Stat
          label="AI-writing flags"
          value={flagAtThr}
          detail={`${pendingFlags} awaiting review`}
          color={pendingFlags ? 'var(--color-accent)' : undefined}
        />
        <Stat
          label="Weakest topic"
          value={weakTopic ? weakTopic[0] : '—'}
          detail={weakTopic ? `${weakTopic[1]}% average` : ''}
          color={weakTopic ? pctColor(weakTopic[1]) : undefined}
        />
      </div>

      <div className="grid g2 mt">
        <div className="panel">
          <div className="panel-h">
            <h3>Students</h3>
            <span className="small">Select a row to review a submission</span>
          </div>
          <div className="thr-row">
            <label className="lbl" htmlFor="thr">
              AI-writing flag threshold
            </label>
            <input
              type="range"
              id="thr"
              min={50}
              max={95}
              step={5}
              value={threshold}
              disabled={savingThr}
              onChange={onThresholdInput}
              onMouseUp={onThresholdCommit}
              onTouchEnd={onThresholdCommit}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                  onThresholdCommit(e)
                }
              }}
              aria-describedby="thr-help"
            />
            <b className="mono" id="thr-v">
              {threshold}%
            </b>
            <span
              className="small"
              id="thr-help"
              style={{ flexBasis: '100%', marginTop: -6 }}
            >
              Written answers at or above this likelihood are flagged for your review:{' '}
              <b id="thr-n">{flagAtThr}</b> at this setting. Grades never change
              automatically.
            </span>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Flags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map(({ studentId, attempt }) => {
                    const name =
                      directory[studentId]?.name ||
                      attempt?.student_name ||
                      'Student'
                    if (!attempt) {
                      return (
                        <tr key={studentId}>
                          <td>
                            <b>{name}</b>
                          </td>
                          <td>
                            <Pill label="Not started" tone="p-grey" />
                          </td>
                          <td>—</td>
                          <td>—</td>
                          <td />
                        </tr>
                      )
                    }
                    const detail = detailByAttempt.get(attempt.attempt_id)
                    const fl = detail
                      ? flagsForAttempt(detail, threshold)
                      : []
                    const v = attempt.percent
                    return (
                      <tr
                        key={attempt.attempt_id}
                        className="click"
                        onClick={() =>
                          navigate(`/app/teacher/attempts/${attempt.attempt_id}`)
                        }
                      >
                        <td>
                          <b>{name}</b>
                          <div className="small">
                            {formatShortDate(detail?.submitted_at || attempt.submitted_at)}
                          </div>
                        </td>
                        <td>
                          <Pill label="Submitted" tone="p-good" />
                        </td>
                        <td>
                          <b className="num" style={{ color: pctColor(v) }}>
                            {attempt.total}/{attempt.max}
                          </b>{' '}
                          <span className="small">{v}%</span>
                        </td>
                        <td>
                          {fl.length ? (
                            fl.map((f) => (
                              <span
                                key={f.qid}
                                className={`pill ${flagPillTone(f.dec)}`}
                                title={
                                  f.dec === 'clear'
                                    ? 'Cleared'
                                    : f.dec === 'discuss'
                                      ? 'Asked to discuss'
                                      : 'Awaiting review'
                                }
                                style={{ marginRight: 4 }}
                              >
                                {flagPillLabel(f)}
                              </span>
                            ))
                          ) : (
                            <span className="small">None</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn small"
                            aria-label={`Review ${name}'s submission`}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/app/teacher/attempts/${attempt.attempt_id}`)
                            }}
                          >
                            Review <Icon name="right" className="sm" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="empty">
                      No students enrolled yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h3>Class by topic</h3>
          </div>
          <div className="panel-b">
            {topics.length ? (
              topics.map(([t, v]) => (
                <div className="topicrow" key={t}>
                  <span>{t}</span>
                  <ScoreBar value={v} />
                  <b className="num">{v}%</b>
                </div>
              ))
            ) : (
              <div className="empty">No submissions yet</div>
            )}
            {weakTopic && weakTopic[1] < 70 ? (
              <div className="rec mt">
                <b>Suggested reteach: {weakTopic[0]}</b>
                <p>
                  The class averaged {weakTopic[1]}% on {weakTopic[0]}. A short recap using
                  the lecture notes would address most lost marks.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
