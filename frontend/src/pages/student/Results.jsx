import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import PageTop from '../../components/PageTop'
import {
  attemptPercent,
  attemptTotal,
  examMaxMarks,
  formatTeacherName,
} from '../../utils/student'
import { pctColor } from '../../utils/status'

/**
 * Student released-results list (v7 `P['s-results']`).
 * When `classId` is set, renders as a class-tab fragment.
 */
export default function Results({ classId = null }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dash, ats, xs, cls] = await Promise.all([
        api.getStudentDashboard(),
        api.listMyAttempts(),
        api.listExams(classId ? { class_id: classId } : {}).catch(() => []),
        api.listClasses().catch(() => []),
      ])
      const classById = new Map((cls || []).map((c) => [c.id, c]))
      const examById = new Map((xs || []).map((x) => [x.id, x]))
      const attemptById = new Map((ats || []).map((a) => [a.id, a]))

      const list = []
      const seen = new Set()

      const pushRow = (r) => {
        if (!r?.attemptId || seen.has(r.attemptId)) return
        seen.add(r.attemptId)
        list.push(r)
      }

      ;(dash.released_results || []).forEach((r) => {
        const exam = examById.get(r.exam_id)
        if (classId && (!exam || exam.class_id !== classId)) return
        const attempt = attemptById.get(r.attempt_id)
        const c = exam ? classById.get(exam.class_id) : null
        let total = null
        let max = null
        let pct = r.percent
        if (attempt && exam) {
          total = attemptTotal(attempt, exam)
          max = examMaxMarks(exam)
          pct = attemptPercent(attempt, exam)
        }
        pushRow({
          attemptId: r.attempt_id,
          examId: r.exam_id,
          title: r.exam_title || exam?.title || 'Exam',
          classCode: c?.code || '—',
          teacher: formatTeacherName(),
          total,
          max,
          percent: pct,
        })
      })

      ;(ats || []).forEach((a) => {
        if (a.status !== 'submitted') return
        const exam = examById.get(a.exam_id)
        if (!exam || !exam.released) return
        if (classId && exam.class_id !== classId) return
        const c = classById.get(exam.class_id)
        pushRow({
          attemptId: a.id,
          examId: exam.id,
          title: exam.title,
          classCode: c?.code || '—',
          teacher: formatTeacherName(),
          total: attemptTotal(a, exam),
          max: examMaxMarks(exam),
          percent: attemptPercent(a, exam),
        })
      })

      setRows(list.slice().reverse())
    } catch (err) {
      setError(err)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    load()
  }, [load])

  const display = useMemo(() => rows, [rows])

  if (loading) return <ShellLoading label="Loading results…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load results.'} onRetry={load} />
    )
  }

  return (
    <>
      {classId ? null : <PageTop title="Results" />}
      <div className="panel">
        {display.length ? (
          display.map((r) => (
            <div className="lrow" key={r.attemptId}>
              <div className="grow">
                <b>{r.title}</b>
                <div className="small">
                  {r.classCode} · {r.teacher}
                </div>
              </div>
              <b className="num" style={{ color: pctColor(r.percent) }}>
                {r.total != null && r.max != null
                  ? `${r.total}/${r.max} · ${r.percent}%`
                  : `${r.percent}%`}
              </b>
              <Link
                className="btn small primary"
                to={`/app/student/attempts/${r.attemptId}/feedback`}
              >
                View feedback
              </Link>
            </div>
          ))
        ) : (
          <EmptyState panel={false}>
            No released results yet. Your teacher releases results after reviewing written
            answers.
          </EmptyState>
        )}
      </div>
    </>
  )
}
