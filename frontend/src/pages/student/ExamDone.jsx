import { isMcqQuestion } from '../../utils/teacher'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import { formatTeacherName } from '../../utils/student'

/** Post-submit confirmation (v7 `P['s-done']`). */
export default function ExamDone() {
  const { id } = useParams()
  const [attempt, setAttempt] = useState(null)
  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [teacherName, setTeacherName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const at = await api.getAttempt(id)
      setAttempt(at)
      let x = null
      try {
        x = await api.getExam(at.exam_id)
        setExam(x)
      } catch {
        setExam(null)
      }
      if (x) {
        try {
          const c = await api.getClass(x.class_id)
          setCls(c)
        } catch {
          setCls(null)
        }
        setTeacherName(formatTeacherName())
      }
    } catch (err) {
      setError(err)
      setAttempt(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <ShellLoading label="Loading…" />
  if (error || !attempt) {
    return (
      <ShellError message={error?.message || 'Submission not found.'} onRetry={load} />
    )
  }

  const questions = exam?.questions || []
  const mcq = questions.filter((q) => isMcqQuestion(q))
  const hasWritten = questions.some((q) => q.type !== 'MCQ')

  const crumb = cls ? (
    <>
      <Link to="/app/student">Home</Link> <span aria-hidden="true">/</span>{' '}
      <Link to={`/app/student/classes/${cls.id}`}>{cls.code}</Link>{' '}
      <span aria-hidden="true">/</span>{' '}
      <Link to={`/app/student/classes/${cls.id}?tab=exams`}>Exams</Link>
    </>
  ) : null

  return (
    <>
      <PageTop crumb={crumb} title="Exam submitted" />
      <div className="panel panel-b" style={{ maxWidth: 640 }}>
        <div
          className="row"
          style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 14 }}
        >
          <span
            className="ic ok"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              animation: 'pop .4s var(--ease-out)',
            }}
            aria-hidden="true"
          >
            <Icon name="check" />
          </span>
          <div>
            <h2 style={{ fontSize: 21 }}>Your answers are in.</h2>
            <p style={{ color: 'var(--color-muted-foreground)' }}>
              Multiple-choice questions are marked straight away.{' '}
              {teacherName || 'Your teacher'} reviews the written answers before results are
              released. You&apos;ll get a notification with your topic breakdown and study plan.
            </p>
          </div>
        </div>
        <div className="row mt">
          {mcq.length ? <Pill label="MCQ: marked automatically" tone="p-good" /> : null}
          {hasWritten ? (
            <Pill label="Written answers: awaiting teacher review" tone="p-warn" />
          ) : null}
        </div>
        <div className="row mt">
          <Link className="btn primary" to="/app/student/exams">
            My exams
          </Link>
          <Link className="btn" to="/app/student">
            Dashboard
          </Link>
        </div>
      </div>
    </>
  )
}
