import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import Tabs from '../../components/Tabs'
import { formatShortDate } from '../../utils/format'

const STATUS_FILTERS = [
  ['all', 'All'],
  ['draft', 'Drafts'],
  ['pending', 'Pending HOD'],
  ['returned', 'Returned'],
  ['approved', 'Approved'],
  ['published', 'Live'],
  ['closed', 'Closed'],
]

function maxMarks(exam) {
  const qs = exam.questions || []
  return qs.reduce((s, q) => s + (Number(q.marks) || 0), 0)
}

/**
 * My exams table (v7 t-exams).
 * When `embedded` + `classId`, scoped to that class with create button + request callouts.
 */
export default function Exams({ embedded = false, classId = null, classCode } = {}) {
  const navigate = useNavigate()
  const [exams, setExams] = useState([])
  const [classes, setClasses] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [classFilter, setClassFilter] = useState(classId || 'all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [xs, cls, reqs] = await Promise.all([
        api.listExams(classId ? { class_id: classId } : {}),
        classId ? Promise.resolve([]) : api.listClasses(),
        api.listRequests().catch(() => []),
      ])
      setExams(xs)
      setClasses(cls)
      setRequests(reqs || [])
    } catch (err) {
      setError(err)
      setExams([])
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (classId) setClassFilter(classId)
  }, [classId])

  const classById = useMemo(() => {
    const m = new Map()
    classes.forEach((c) => m.set(c.id, c))
    exams.forEach((x) => {
      if (x.class_code) m.set(x.class_id, { id: x.class_id, code: x.class_code })
    })
    return m
  }, [classes, exams])

  const scoped = useMemo(() => {
    let list = exams
    if (!classId && classFilter !== 'all') {
      list = list.filter((x) => x.class_id === classFilter)
    }
    return list
  }, [exams, classId, classFilter])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return scoped
    return scoped.filter((x) => x.status === statusFilter)
  }, [scoped, statusFilter])

  const openReqs = useMemo(() => {
    if (!classId) return []
    return requests.filter((r) => r.class_id === classId && r.status === 'open')
  }, [requests, classId])

  if (loading) return <ShellLoading label="Loading exams…" />
  if (error) {
    return <ShellError message={error.message || 'Could not load exams.'} onRetry={load} />
  }

  const createTo = classId
    ? `/app/teacher/exams/new?cls=${encodeURIComponent(classId)}`
    : '/app/teacher/exams/new'

  const createBtn = (
    <Link className="btn primary" to={createTo}>
      <Icon name="plus" className="sm" />
      Create exam
    </Link>
  )

  // Embedded class tab: cards layout like v7 when only=cls
  if (embedded && classId) {
    return (
      <>
        <div className="sec-head">
          <h2>Exams</h2>
          {createBtn}
        </div>
        {openReqs.map((r) => (
          <div className="callout" key={r.id}>
            <Icon name="info" />
            <div>
              <b>A {r.kind} was requested</b>, due {r.due}. {r.note}
              <div style={{ marginTop: 8 }}>
                <Link
                  className="btn small primary"
                  to={`/app/teacher/exams/new?req=${encodeURIComponent(r.id)}`}
                >
                  Create the requested {r.kind.toLowerCase()}
                </Link>
              </div>
            </div>
          </div>
        ))}
        {exams.length ? (
          <div className="egrid">
            {exams.map((x) => {
              const live = ['published', 'closed'].includes(x.status)
              const qn = x.questions?.length ?? x.question_count ?? 0
              return (
                <article className="ecard" key={x.id}>
                  <div className="row" style={{ gap: 8 }}>
                    <Pill status={x.status} />
                    {x.released ? <Pill label="Released" tone="p-good" /> : null}
                  </div>
                  <h3>{x.title}</h3>
                  <p className="small">
                    {x.kind} · {qn} questions · {x.duration_min} min · {maxMarks(x)} marks
                  </p>
                  <div className="row" style={{ marginTop: 'auto' }}>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => navigate(`/app/teacher/exams/${x.id}`)}
                    >
                      Open paper
                    </button>
                    {live ? (
                      <button
                        type="button"
                        className="btn small primary"
                        onClick={() => navigate(`/app/teacher/exams/${x.id}/results`)}
                      >
                        Results
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState>No exams yet. Create the first one from your material.</EmptyState>
        )}
      </>
    )
  }

  return (
    <>
      {!embedded ? <PageTop title="My exams" actions={createBtn} /> : null}

      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Tabs
          aria-label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          items={STATUS_FILTERS.map(([k, l]) => ({
            id: k,
            label: l,
            count: k === 'all' ? scoped.length : scoped.filter((x) => x.status === k).length,
          }))}
        />
      </div>

      {!classId && classes.length > 1 ? (
        <div className="field" style={{ maxWidth: 280, marginBottom: 14 }}>
          <label htmlFor="xf-cls">Class</label>
          <select
            id="xf-cls"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Exam</th>
                <th>Class</th>
                <th>Type</th>
                <th>Questions</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((x) => {
                  const qn = x.questions?.length ?? x.question_count ?? 0
                  const code =
                    classById.get(x.class_id)?.code || x.class_code || classCode || '—'
                  const live = ['published', 'closed'].includes(x.status)
                  return (
                    <tr
                      key={x.id}
                      className="click"
                      onClick={() => navigate(`/app/teacher/exams/${x.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <b>{x.title}</b>
                        <div className="small">Created {formatShortDate(x.created_at)}</div>
                      </td>
                      <td>{code}</td>
                      <td>{x.kind}</td>
                      <td className="num">
                        {qn} · {maxMarks(x)} marks
                      </td>
                      <td>
                        <Pill status={x.status} />
                        {x.released ? (
                          <>
                            {' '}
                            <Pill label="Released" tone="p-good" />
                          </>
                        ) : null}
                      </td>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn small"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/app/teacher/exams/${x.id}`)
                            }}
                          >
                            Paper
                          </button>
                          {live ? (
                            <button
                              type="button"
                              className="btn small"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/app/teacher/exams/${x.id}/results`)
                              }}
                            >
                              Results
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="empty">
                    Nothing here
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
