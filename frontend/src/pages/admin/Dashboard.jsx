import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { greetingLine, todayLong, usersByRoleTotal } from '../../utils/admin'

/**
 * Admin home (v7 `P['a-dash']` / focusDash).
 */
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [onboarding, setOnboarding] = useState(null)
  const [depts, setDepts] = useState([])
  const [users, setUsers] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sum, ob, d, u, c] = await Promise.all([
        api.getAdminSummary(),
        api.getAdminOnboarding(),
        api.listAdminDepartments(),
        api.listAdminUsers(),
        api.listAdminClasses(),
      ])
      setSummary(sum)
      setOnboarding(ob)
      setDepts(d || [])
      setUsers(u || [])
      setClasses(c || [])
    } catch (err) {
      setError(err)
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const userById = useMemo(() => {
    const m = new Map()
    users.forEach((u) => m.set(u.id, u))
    return m
  }, [users])

  const items = useMemo(() => {
    const it = []
    depts
      .filter((d) => !d.hod_id)
      .forEach((d) =>
        it.push({
          t: `Assign a head to ${d.name}`,
          s: 'Papers in this department cannot be approved until it has an HOD.',
          tag: ['Setup', 'p-warn'],
          btn: 'Assign HOD',
          to: '/app/admin/departments',
        }),
      )
    users
      .filter((u) => u.status !== 'active')
      .forEach((u) =>
        it.push({
          t: `${u.name} is deactivated`,
          s: `${u.email} can't sign in`,
          tag: ['Inactive', 'p-grey'],
          btn: 'Review users',
          to: '/app/admin/users',
        }),
      )
    classes
      .filter((c) => !(c.student_count || c.student_ids?.length))
      .forEach((c) => {
        const teacher = userById.get(c.teacher_id)
        it.push({
          t: `${c.code} has no students`,
          s: `${c.name} · ${teacher?.name || 'Teacher'}`,
          tag: ['Empty class', 'p-grey'],
          btn: 'Open classes',
          to: '/app/admin/departments?tab=classes',
        })
      })
    return it
  }, [depts, users, classes, userById])

  if (loading) return <ShellLoading label="Loading dashboard…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load dashboard.'} onRetry={load} />
    )
  }

  const [next, ...rest] = items
  const done = {
    t: 'Everything is set up',
    s: 'Every department has a head and every account is active. Add people as your institution grows.',
    btn: 'Add staff',
    to: '/app/admin/users/new',
  }
  const userCount = usersByRoleTotal(summary?.users_by_role) || users.length
  const classCount = summary?.classes ?? classes.length
  const papers = summary?.papers_by_status || {}
  const paperCount = Object.values(papers).reduce((n, v) => n + (Number(v) || 0), 0)

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
          className="btn primary"
          onClick={() => navigate(next ? next.to : done.to)}
        >
          {next ? next.btn : done.btn}
        </button>
      </section>

      {onboarding?.items?.length ? (
        <div className="panel mt">
          <div className="panel-h">
            <h3>Getting started</h3>
            {onboarding.complete ? (
              <span className="status-mark good">Complete</span>
            ) : (
              <span className="status-mark warn">In progress</span>
            )}
          </div>
          <div className="panel-b">
            {onboarding.items.map((item) => (
              <div className="lrow" key={item.key}>
                <span className={`status-mark ${item.done ? 'good' : 'todo'}`}>
                  {item.done ? '✓ Done' : 'To do'}
                </span>
                <div className="grow">
                  <b>{item.label}</b>
                </div>
                {!item.done && item.href ? (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => navigate(item.href)}
                  >
                    Open
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid g2e mt">
        <div className="panel">
          <div className="panel-h">
            <h3>Needs you</h3>
          </div>
          <div className="panel-b">
            {rest.length ? (
              rest.map((item, i) => (
                <div className="lrow" key={i}>
                  <span className={`pill ${item.tag[1]}`}>{item.tag[0]}</span>
                  <div className="grow">
                    <b>{item.t}</b>
                    <div className="small">{item.s}</div>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => navigate(item.to)}
                  >
                    {item.btn}
                  </button>
                </div>
              ))
            ) : (
              <div className="empty">Nothing else is waiting on you.</div>
            )}
            {items.length ? (
              <button
                type="button"
                className="btn small ghost mt"
                onClick={() => navigate('/app/admin/users')}
              >
                Users and Departments
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h3>At a glance</h3>
          </div>
          <div className="tbl-wrap">
            <table>
              <tbody>
                <tr>
                  <td>Users</td>
                  <td className="num">
                    <b>{userCount}</b>
                  </td>
                </tr>
                <tr>
                  <td>Classes</td>
                  <td className="num">
                    <b>{classCount}</b>
                  </td>
                </tr>
                <tr>
                  <td>Papers</td>
                  <td className="num">
                    <b>{paperCount}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
