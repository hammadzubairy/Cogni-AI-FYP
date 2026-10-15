import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { Icon } from '../../components/IconSprite'
import Pill from '../../components/Pill'
import { avgColor, formatDue, greetingLine, todayLong } from '../../utils/hod'

function buildItems(data, classById, teacherById) {
  const items = []
  ;(data.pending_approvals || []).forEach((x) => {
    const w = x.failed_checks || 0
    items.push({
      t: `Review ${x.title}`,
      s: `${x.class_code || '—'} · ${x.teacher_name || 'Teacher'} · ${
        w
          ? `${w} policy check${w > 1 ? 's' : ''} failed`
          : 'all policy checks passed'
      }`,
      tag: w ? ['Checks failed', 'p-warn'] : ['Ready', 'p-good'],
      btn: 'Review paper',
      to: `/app/hod/approvals/${x.id}`,
    })
  })
  ;(data.open_requests || []).forEach((r) => {
    const code = classById.get(r.class_id)?.code || 'class'
    const tName = teacherById.get(r.teacher_id) || 'teacher'
    items.push({
      t: `Waiting on ${tName}`,
      s: `${r.kind} for ${code} · due ${formatDue(r.due)}`,
      tag: ['Not started', 'p-grey'],
      btn: 'View requests',
      to: '/app/hod/requests',
    })
  })
  return items
}

/**
 * HOD home (v7 `P['h-dash']` / focusDash).
 */
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dash, cls, analytics] = await Promise.all([
        api.getHodDashboard(),
        api.listClasses().catch(() => []),
        api.getHodAnalytics().catch(() => null),
      ])
      setData(dash)
      setClasses(cls || [])
      setTeachers(analytics?.teacher_activity || [])
    } catch (err) {
      setError(err)
      setData(null)
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

  const items = useMemo(
    () => (data ? buildItems(data, classById, teacherById) : []),
    [data, classById, teacherById],
  )
  const [next, ...rest] = items

  if (loading) return <ShellLoading label="Loading dashboard…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load dashboard.'} onRetry={load} />
    )
  }

  const stats = data.stats || {}
  const avg = stats.department_average
  const done = {
    t: 'No papers waiting',
    s: 'Your teachers have nothing waiting for approval. Request the next paper when you need one.',
    btn: 'Request a paper',
    to: '/app/hod/requests',
  }

  return (
    <>
      <div className="fd-head">
        <span className="small">{todayLong().toUpperCase()}</span>
        <h1>{greetingLine(user?.name).toUpperCase()}</h1>
      </div>

      <section className={`focus${next ? '' : ' calm'}`} aria-labelledby="focus-h">
        <div className="focus-txt">
          <span className="eyebrow">{next ? 'Next up' : 'All clear'}</span>
          <h2 id="focus-h">{next ? next.t : done.t}</h2>
          <p>{next ? next.s : done.s}</p>
        </div>
        <button
          type="button"
          className="btn primary lg"
          onClick={() => navigate(next ? next.to : done.to)}
        >
          {next ? next.btn : done.btn} <Icon name="arrow" className="sm" />
        </button>
      </section>

      <div className="fd-cols">
        <section aria-labelledby="needs-h">
          <h3 className="fd-sec" id="needs-h">
            Needs you
            {rest.length ? <span className="fd-count">{Math.min(rest.length, 5)}</span> : null}
          </h3>
          {rest.length ? (
            <>
              {rest.slice(0, 5).map((it, i) => (
                <div className="need" key={i}>
                  <div className="grow">
                    <b>{it.t}</b>
                    <span className="small">{it.s}</span>
                  </div>
                  {it.tag ? <Pill label={it.tag[0]} tone={it.tag[1]} /> : null}
                  <button type="button" className="btn small" onClick={() => navigate(it.to)}>
                    {it.btn}
                  </button>
                </div>
              ))}
              {rest.length > 5 ? (
                <p className="small" style={{ marginTop: 12 }}>
                  {rest.length - 5} more in Paper approvals
                </p>
              ) : null}
            </>
          ) : (
            <p className="fd-none">Nothing else is waiting on you.</p>
          )}
        </section>
        <section aria-labelledby="nums-h">
          <h3 className="fd-sec" id="nums-h">
            At a glance
          </h3>
          <div className="fd-num">
            <span>Awaiting approval</span>
            <b className="num">{stats.pending_approvals ?? 0}</b>
          </div>
          <div className="fd-num">
            <span>Department average</span>
            <b
              className="num"
              style={avg == null ? undefined : { color: avgColor(avg) }}
            >
              {avg == null ? '—' : `${avg}%`}
            </b>
          </div>
          <div className="fd-num">
            <span>Open requests</span>
            <b className="num">{stats.open_requests ?? 0}</b>
          </div>
        </section>
      </div>
    </>
  )
}
