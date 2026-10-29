import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import {
  attemptPercent,
  formatSubmittedAt,
  formatTeacherName,
} from '../../utils/student'
import { pctColor } from '../../utils/status'

/**
 * Student exams list (v7 `P['s-exams']`).
 * When `classId` is set, renders as a class-tab fragment (no pageTop).
 */
export default function Exams({ classId = null }) {
  const navigate = useNavigate()
  const [exams, setExams] = useState([])
  const [attempts, setAttempts] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [releasedMeta, setReleasedMeta] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [xs, ats, cls, dash] = await Promise.all([
        api.listExams(classId ? { class_id: classId } : {}),
        api.listMyAttempts(),
        api.listClasses().catch(() => []),
        api.getStudentDashboard().catch(() => null),
      ])
      setExams(xs || [])
      setAttempts(ats || [])
      setClasses(cls || [])
      const meta = {}
      ;(dash?.released_results || []).forEach((r) => {
        meta[r.attempt_id] = r
        meta[`exam:${r.exam_id}`] = r
      })
      setReleasedMeta(meta)
    } catch (err) {
      setError(err)
      setExams([])
      setAttempts([])
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    load()
  }, [load])

  const classById = useMemo(() => {
    const m = new Map()
    classes.forEach((c) => m.set(c.id, c))
    return m
  }, [classes])

  const attemptByExam = useMemo(() => {
    const m = new Map()
    attempts.forEach((a) => m.set(a.exam_id, a))
    return m
  }, [attempts])

  const openNow = useMemo(() => {
    return exams.filter((x) => {
      if (x.status !== 'published') return false
      const at = attemptByExam.get(x.id)
      return !(at && at.status === 'submitted')
    })
  }, [exams, attemptByExam])

  const upcoming = useMemo(
    () => exams.filter((x) => ['pending', 'approved'].includes(x.status)),
    [exams],
  )

  const done = useMemo(() => {
    return attempts
      .filter((a) => a.status === 'submitted')
      .map((a) => {
        const x = exams.find((e) => e.id === a.exam_id)
        if (x) {
          if (classId && x.class_id !== classId) return null
          return { attempt: a, exam: x }
        }
        // Closed exams drop out of listExams; still show from attempt + dash meta
        if (classId) return null
        const meta = releasedMeta[a.id] || releasedMeta[`exam:${a.exam_id}`]
        return {
          attempt: a,
          exam: {
            id: a.exam_id,
            title: meta?.exam_title || 'Submitted exam',
            released: !!meta || Object.keys(a.results || {}).length > 0,
            class_id: null,
          },
          percentFromDash: meta?.percent,
        }
      })
      .filter(Boolean)
  }, [attempts, exams, classId, releasedMeta])

  if (loading) return <ShellLoading label="Loading exams…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load exams.'} onRetry={load} />
    )
  }

  return (
    <>
      {classId ? null : <PageTop title="My exams" />}

      <div className="panel">
        <div className="panel-h">
          <h3>Open now ({openNow.length})</h3>
        </div>
        {openNow.length ? (
          openNow.map((x) => {
            const at = attemptByExam.get(x.id)
            const c = classById.get(x.class_id)
            const teacher = formatTeacherName()
            return (
              <div className="lrow" key={x.id}>
                <Pill label="Live" tone="p-blue" />
                <div className="grow">
                  <b>{x.title}</b>
                  <div className="small">
                    {c?.code || '—'} · {teacher} · {x.questions?.length ?? x.question_count ?? 0} Q ·{' '}
                    {x.duration_min} min
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => navigate(`/app/student/exams/${x.id}/take`)}
                  >
                    {at?.status === 'in_progress' ? 'Resume' : 'Start exam'}
                  </button>
                  {at?.status === 'in_progress' ? (
                    <span className="small" style={{ color: 'var(--color-muted-foreground)', textAlign: 'right' }}>
                      Continues in fullscreen lock
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })
        ) : (
          <EmptyState panel={false}>No open exams.</EmptyState>
        )}
      </div>

      {upcoming.length ? (
        <div className="panel mt">
          <div className="panel-h">
            <h3>Coming up</h3>
          </div>
          {upcoming.map((x) => {
            const c = classById.get(x.class_id)
            return (
              <div className="lrow" key={x.id}>
                <Pill label="Scheduled" tone="p-grey" />
                <div className="grow">
                  <b>{x.title}</b>
                  <div className="small">
                    {c?.code || '—'} · {x.kind} · being finalised by your department
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="panel mt">
        <div className="panel-h">
          <h3>Submitted ({done.length})</h3>
        </div>
        {done.length ? (
          done.map(({ attempt: a, exam: x, percentFromDash }) => {
            const c = x.class_id ? classById.get(x.class_id) : null
            const pct =
              a.results && Object.keys(a.results).length && x.questions
                ? attemptPercent(a, x)
                : percentFromDash ?? null
            return (
              <div className="lrow" key={a.id}>
                <Pill
                  label={x.released ? 'Results out' : 'Awaiting results'}
                  tone={x.released ? 'p-good' : 'p-warn'}
                />
                <div className="grow">
                  <b>{x.title}</b>
                  <div className="small">
                    {c?.code || '—'} · submitted {formatSubmittedAt(a.submitted_at)}
                  </div>
                </div>
                {x.released ? (
                  <>
                    {pct != null ? (
                      <b className="num" style={{ color: pctColor(pct) }}>
                        {pct}%
                      </b>
                    ) : null}
                    <Link className="btn small" to={`/app/student/attempts/${a.id}/feedback`}>
                      Feedback
                    </Link>
                  </>
                ) : null}
              </div>
            )
          })
        ) : (
          <EmptyState panel={false}>Nothing submitted yet.</EmptyState>
        )}
      </div>
    </>
  )
}
