import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { useConfirm } from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import { useToast } from '../../components/Toast'

/**
 * Admin change department head (v7 `P['a-hod']`).
 */
export default function ChangeHead() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [dept, setDept] = useState(null)
  const [users, setUsers] = useState([])
  const [pick, setPick] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [depts, u] = await Promise.all([
        api.listAdminDepartments(),
        api.listAdminUsers(),
      ])
      const d = (depts || []).find((x) => x.id === id)
      if (!d) {
        setDept(null)
        setUsers([])
        return
      }
      setDept(d)
      setUsers(u || [])
      setPick(d.hod_id || '')
    } catch (err) {
      setError(err)
      setDept(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const cand = useMemo(
    () =>
      users.filter(
        (u) =>
          u.dept_id === id &&
          (u.role === 'teacher' || u.role === 'hod') &&
          u.status === 'active',
      ),
    [users, id],
  )

  const current = dept?.hod_id
    ? users.find((u) => u.id === dept.hod_id)
    : null

  async function save() {
    if (!pick) {
      toast('Choose a new head', { type: 'error' })
      return
    }
    const chosen = cand.find((u) => u.id === pick)
    const ok = await confirm({
      title: `Make ${chosen?.name || 'this person'} head of ${dept.name}?`,
      body: current
        ? `${current.name} goes back to being a teacher.`
        : 'They will approve papers for this department.',
      ok: 'Make head of department',
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.patchAdminDepartment(id, { hod_id: pick })
      toast(`${chosen?.name || 'User'} is now head of ${dept.name}`)
      navigate('/app/admin/departments')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not change head.', {
        type: 'error',
      })
      setBusy(false)
    }
  }

  if (loading) return <ShellLoading label="Loading…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load department.'} onRetry={load} />
    )
  }
  if (!dept) {
    return <EmptyState>Department not found.</EmptyState>
  }

  return (
    <>
      <PageTop
        crumb={
          <Link to="/app/admin/departments">
            <Icon name="left" className="sm" />
            Departments
          </Link>
        }
        title={`Change head of ${dept.name}`}
      />

      <div className="panel panel-b" style={{ maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}>
          Current head: <b>{current ? current.name : 'none'}</b>
        </p>
        {cand.length ? (
          <>
            <fieldset className="apf">
              <legend className="lbl">New head</legend>
              {cand.map((u) => (
                <label className="apopt" key={u.id}>
                  <input
                    type="radio"
                    name="hod-pick"
                    value={u.id}
                    checked={pick === u.id}
                    onChange={() => setPick(u.id)}
                    disabled={busy}
                  />
                  <span>
                    <b>{u.name}</b>
                    <small>
                      {u.email}
                      {u.id === dept.hod_id ? ' · current head' : ''}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="row">
              <button
                type="button"
                className={`btn primary${busy ? ' busy' : ''}`}
                onClick={save}
                disabled={busy}
                aria-busy={busy}
              >
                Make head of department…
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => navigate('/app/admin/departments')}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <EmptyState panel={false}>
            No active teachers in this department yet.{' '}
            <button
              type="button"
              className="btn small"
              onClick={() => navigate('/app/admin/users/new')}
            >
              Add a teacher
            </button>
          </EmptyState>
        )}
      </div>
    </>
  )
}
