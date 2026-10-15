import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import Tabs from '../../components/Tabs'
import { examMaxMarks } from '../../utils/teacher'

const STATUS_FILTERS = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['returned', 'Returned'],
  ['approved', 'Approved'],
  ['published', 'Live'],
  ['closed', 'Closed'],
]

/**
 * Paper approvals list (v7 `P['h-approvals']`). Pending first; filter by status.
 */
export default function Approvals() {
  const navigate = useNavigate()
  const [exams, setExams] = useState([])
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [checkMap, setCheckMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [xs, cls, analytics] = await Promise.all([
        api.listHodApprovals(),
        api.listClasses().catch(() => []),
        api.getHodAnalytics().catch(() => null),
      ])
      setExams(xs || [])
      setClasses(cls || [])
      setTeachers(analytics?.teacher_activity || [])

      const checks = {}
      await Promise.all(
        (xs || []).map(async (x) => {
          try {
            const ck = await api.getExamChecks(x.id)
            checks[x.id] = (ck || []).filter((k) => !k.ok).length
          } catch {
            checks[x.id] = 0
          }
        }),
      )
      setCheckMap(checks)
    } catch (err) {
      setError(err)
      setExams([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  const sorted = useMemo(() => {
    const list = [...exams]
    list.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))
    return list
  }, [exams])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return sorted
    return sorted.filter((x) => x.status === statusFilter)
  }, [sorted, statusFilter])

  if (loading) return <ShellLoading label="Loading approvals…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load approvals.'} onRetry={load} />
    )
  }

  return (
    <>
      <PageTop title="Paper approvals" />
      <Tabs
        aria-label="Filter by status"
        value={statusFilter}
        onChange={setStatusFilter}
        items={STATUS_FILTERS.map(([id, label]) => ({
          id,
          label,
          count:
            id === 'all'
              ? exams.length
              : exams.filter((x) => x.status === id).length,
        }))}
      />

      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Paper</th>
                <th>Teacher</th>
                <th>Type</th>
                <th>Checks</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((x) => {
                  const w = checkMap[x.id] ?? 0
                  const code = classById.get(x.class_id)?.code || '—'
                  const qn = (x.questions || []).length
                  const marks = examMaxMarks(x)
                  const pending = x.status === 'pending'
                  return (
                    <tr
                      key={x.id}
                      className="click"
                      onClick={() => navigate(`/app/hod/approvals/${x.id}`)}
                    >
                      <td>
                        <b>{x.title}</b>
                        <div className="small">
                          {code} · {qn} Q · {marks} marks
                        </div>
                      </td>
                      <td>{teacherById.get(x.teacher_id) || '—'}</td>
                      <td>{x.kind}</td>
                      <td>
                        <Pill
                          label={w ? `${w} failed` : 'Passed'}
                          tone={w ? 'p-warn' : 'p-good'}
                        />
                      </td>
                      <td>
                        <Pill status={x.status} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`btn small${pending ? ' primary' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/app/hod/approvals/${x.id}`)
                          }}
                        >
                          {pending ? 'Review' : 'View'}{' '}
                          <Icon name="right" className="sm" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="empty">
                    {exams.length
                      ? 'No papers match this filter.'
                      : 'No papers submitted yet'}
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
