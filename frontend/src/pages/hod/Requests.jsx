import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import Pill from '../../components/Pill'
import { useToast } from '../../components/Toast'
import {
  DEFAULT_REQUEST_NOTE,
  defaultDueDate,
  formatDue,
  requestStatusLabel,
  requestStatusTone,
} from '../../utils/hod'

/**
 * Paper requests (v7 `P['h-assign']` + ACT req-create).
 */
export default function Requests() {
  const navigate = useNavigate()
  const toast = useToast()

  const [requests, setRequests] = useState([])
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [teacherId, setTeacherId] = useState('')
  const [classId, setClassId] = useState('')
  const [kind, setKind] = useState('Midterm')
  const [due, setDue] = useState(defaultDueDate)
  const [note, setNote] = useState(DEFAULT_REQUEST_NOTE)
  const [fieldErrs, setFieldErrs] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reqs, cls, analytics] = await Promise.all([
        api.listRequests(),
        api.listClasses(),
        api.getHodAnalytics().catch(() => null),
      ])
      setRequests(reqs || [])
      setClasses(cls || [])

      let ts = analytics?.teacher_activity || []
      if (!ts.length) {
        const seen = new Map()
        ;(cls || []).forEach((c) => {
          if (c.teacher_id && !seen.has(c.teacher_id)) {
            seen.set(c.teacher_id, {
              teacher_id: c.teacher_id,
              teacher_name: 'Teacher',
            })
          }
        })
        ts = [...seen.values()]
      }
      setTeachers(ts)

      setTeacherId((prev) => {
        if (prev && ts.some((t) => t.teacher_id === prev)) return prev
        return ts[0]?.teacher_id || ''
      })
    } catch (err) {
      setError(err)
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const teacherClasses = useMemo(
    () => classes.filter((c) => c.teacher_id === teacherId),
    [classes, teacherId],
  )

  useEffect(() => {
    if (!teacherClasses.length) {
      setClassId('')
      return
    }
    setClassId((prev) =>
      teacherClasses.some((c) => c.id === prev) ? prev : teacherClasses[0].id,
    )
  }, [teacherClasses])

  const classById = useMemo(() => {
    const m = new Map()
    classes.forEach((c) => m.set(c.id, c))
    return m
  }, [classes])

  const teacherById = useMemo(() => {
    const m = new Map()
    teachers.forEach((t) => m.set(t.teacher_id, t.teacher_name))
    return m
  }, [teachers])

  const onTeacherChange = (id) => {
    setTeacherId(id)
    setFieldErrs((e) => ({ ...e, teacher: '', class: '' }))
  }

  const onSubmit = async () => {
    const errs = {}
    if (!teacherId) errs.teacher = 'Choose a teacher'
    if (!classId) errs.class = 'This teacher has no classes. Choose another teacher.'
    if (!due) errs.due = 'Choose a due date'
    setFieldErrs(errs)
    if (Object.keys(errs).length) {
      const first = errs.teacher ? 'rq-t' : errs.class ? 'rq-c' : 'rq-d'
      document.getElementById(first)?.focus()
      return
    }

    setSubmitting(true)
    try {
      await api.createRequest({
        teacher_id: teacherId,
        class_id: classId,
        kind,
        due: `${due}T00:00:00`,
        note: note.trim(),
      })
      const name = teacherById.get(teacherId) || 'teacher'
      toast(`Request sent to ${name}`)
      setNote(DEFAULT_REQUEST_NOTE)
      setDue(defaultDueDate())
      await load()
    } catch (err) {
      toast(err.message || 'Could not send request.', { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <ShellLoading label="Loading requests…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load requests.'} onRetry={load} />
    )
  }

  return (
    <>
      <PageTop title="Paper requests" />
      <div className="grid g2">
        <Panel title="All requests" body={false}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Teacher</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.length ? (
                  requests.map((r) => {
                    const code = classById.get(r.class_id)?.code || '—'
                    return (
                      <tr key={r.id}>
                        <td>
                          <b>
                            {r.kind} · {code}
                          </b>
                          {r.note ? <div className="small">{r.note}</div> : null}
                        </td>
                        <td>{teacherById.get(r.teacher_id) || '—'}</td>
                        <td>{formatDue(r.due)}</td>
                        <td>
                          <Pill
                            label={requestStatusLabel(r.status)}
                            tone={requestStatusTone(r.status)}
                          />
                        </td>
                        <td>
                          {r.exam_id ? (
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => navigate(`/app/hod/approvals/${r.exam_id}`)}
                            >
                              Open paper
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="empty">
                      No requests yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Request a new paper">
          {teachers.length ? (
            <>
              <Field id="rq-t" label="Teacher" error={fieldErrs.teacher}>
                <select
                  id="rq-t"
                  value={teacherId}
                  onChange={(e) => onTeacherChange(e.target.value)}
                  aria-invalid={fieldErrs.teacher ? 'true' : undefined}
                >
                  {teachers.map((t) => (
                    <option key={t.teacher_id} value={t.teacher_id}>
                      {t.teacher_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="rq-c" label="Class" error={fieldErrs.class}>
                <select
                  id="rq-c"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value)
                    setFieldErrs((er) => ({ ...er, class: '' }))
                  }}
                  aria-invalid={fieldErrs.class ? 'true' : undefined}
                >
                  {teacherClasses.length ? (
                    teacherClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))
                  ) : (
                    <option value="">This teacher has no classes</option>
                  )}
                </select>
              </Field>
              <div className="grid g2e">
                <Field id="rq-k" label="Paper type">
                  <select id="rq-k" value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option>Midterm</option>
                    <option>Final</option>
                    <option>Quiz</option>
                  </select>
                </Field>
                <Field id="rq-d" label="Due date" error={fieldErrs.due}>
                  <input
                    id="rq-d"
                    type="date"
                    value={due}
                    onChange={(e) => {
                      setDue(e.target.value)
                      setFieldErrs((er) => ({ ...er, due: '' }))
                    }}
                    aria-invalid={fieldErrs.due ? 'true' : undefined}
                  />
                </Field>
              </div>
              <Field id="rq-n" label="Instructions">
                <textarea
                  id="rq-n"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <button
                type="button"
                className="btn primary"
                onClick={onSubmit}
                disabled={submitting || !teacherClasses.length}
              >
                Send request
              </button>
            </>
          ) : (
            <EmptyState panel={false}>No teachers in your department.</EmptyState>
          )}
        </Panel>
      </div>
    </>
  )
}
