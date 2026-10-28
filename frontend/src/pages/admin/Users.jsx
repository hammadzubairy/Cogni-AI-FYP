import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { useConfirm } from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import { useModal } from '../../components/Modal'
import TemporaryPasswordDialog from '../../components/TemporaryPasswordDialog'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import Tabs from '../../components/Tabs'
import { useToast } from '../../components/Toast'
import { roleTabFilter } from '../../utils/admin'

/**
 * Admin users (v7 `P['a-users']`) with inline role/dept selects and Add user modal.
 */
export default function Users() {
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { openModal, closeModal } = useModal()

  const [users, setUsers] = useState([])
  const [depts, setDepts] = useState([])
  const [tab, setTab] = useState('teachers')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, d] = await Promise.all([api.listAdminUsers(), api.listAdminDepartments()])
      setUsers(u || [])
      setDepts(d || [])
    } catch (err) {
      setError(err)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(
    () => ({
      teachers: users.filter(roleTabFilter('teachers')).length,
      students: users.filter(roleTabFilter('students')).length,
      admins: users.filter(roleTabFilter('admins')).length,
    }),
    [users],
  )

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return users
      .filter(roleTabFilter(tab))
      .filter(
        (u) =>
          !qq ||
          `${u.name} ${u.email}`.toLowerCase().includes(qq),
      )
  }, [users, tab, q])

  async function patchUser(id, body, okMsg) {
    setBusyId(id)
    try {
      const updated = await api.patchAdminUser(id, body)
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)))
      if (okMsg) toast(okMsg)
      // Role/dept changes can affect department heads — refresh depts lightly
      if (body.role != null || body.dept_id !== undefined) {
        const d = await api.listAdminDepartments().catch(() => null)
        if (d) setDepts(d)
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update user.', {
        type: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function onToggle(u) {
    if (u.status === 'active') {
      const ok = await confirm({
        title: `Deactivate ${u.name}?`,
        body: 'They can no longer sign in. Their classes, exams and results are kept, and you can reactivate them at any time.',
        ok: 'Deactivate',
        tone: 'bad',
      })
      if (!ok) return
      await patchUser(
        u.id,
        { status: 'inactive' },
        `${u.name} can no longer sign in`,
      )
    } else {
      await patchUser(u.id, { status: 'active' }, `${u.name} can sign in again`)
    }
  }

  function showTempPassword(userLabel, temporaryPassword) {
    openModal(
      <TemporaryPasswordDialog
        userLabel={userLabel}
        temporaryPassword={temporaryPassword}
        onClose={closeModal}
      />,
      { onClose: () => {} },
    )
  }

  async function onReset(u) {
    const ok = await confirm({
      title: `Reset password for ${u.name}?`,
      body: 'They receive a new temporary password and must change it on next sign-in.',
      ok: 'Reset password',
    })
    if (!ok) return
    setBusyId(u.id)
    try {
      const res = await api.resetAdminUserPassword(u.id)
      toast(`Password reset for ${u.name}`)
      showTempPassword(`${u.name} · ${u.email}`, res.temporary_password)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reset password.', {
        type: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  function openAddUser() {
    openModal(
      <AddUserForm
        depts={depts}
        closeModal={closeModal}
        toast={toast}
        onCreated={(created, temporaryPassword) => {
          setUsers((prev) => [...prev, created])
          closeModal()
          if (created.role === 'admin') setTab('admins')
          else if (created.role === 'student') setTab('students')
          else setTab('teachers')
          toast(`${created.name} added`)
          showTempPassword(`${created.name} · ${created.email}`, temporaryPassword)
        }}
      />,
    )
  }

  if (loading) return <ShellLoading label="Loading users…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load users.'} onRetry={load} />
    )
  }

  return (
    <>
      <PageTop
        title="Users"
        actions={
          <>
            <button type="button" className="btn primary" onClick={openAddUser}>
              <Icon name="plus" className="sm" />
              Add user
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => navigate('/app/admin/users/new')}
            >
              Add staff
            </button>
          </>
        }
      />

      <Tabs
        aria-label="User type"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'teachers', label: 'Teachers and heads', count: counts.teachers },
          { id: 'students', label: 'Students', count: counts.students },
          { id: 'admins', label: 'Admins', count: counts.admins },
        ]}
      />

      <div className="filters">
        <label className="sr-only" htmlFor="uq">
          Search {tab}
        </label>
        <input
          id="uq"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tab === 'students' ? (
          <span className="small">
            Students create their own accounts from the sign-in page.
          </span>
        ) : null}
      </div>

      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {tab !== 'admins' ? <th>Department</th> : null}
                {tab === 'teachers' ? <th>Role</th> : null}
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length ? (
                list.map((u) => {
                  const busy = busyId === u.id
                  const isMe = u.id === me?.id
                  return (
                    <tr key={u.id}>
                      <td>
                        <b>{u.name}</b>
                        <div className="small">{u.email}</div>
                      </td>
                      {tab !== 'admins' ? (
                        <td>
                          <label className="sr-only" htmlFor={`dept-${u.id}`}>
                            Department for {u.name}
                          </label>
                          <select
                            id={`dept-${u.id}`}
                            value={u.dept_id || ''}
                            disabled={busy || u.role === 'admin'}
                            aria-label={`Department for ${u.name}`}
                            onChange={(e) =>
                              patchUser(
                                u.id,
                                { dept_id: e.target.value || null },
                                'Department updated',
                              )
                            }
                          >
                            <option value="">—</option>
                            {depts.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                      {tab === 'teachers' ? (
                        <td>
                          <label className="sr-only" htmlFor={`role-${u.id}`}>
                            Role for {u.name}
                          </label>
                          <select
                            id={`role-${u.id}`}
                            value={u.role}
                            disabled={busy || isMe}
                            aria-label={`Role for ${u.name}`}
                            onChange={(e) =>
                              patchUser(
                                u.id,
                                { role: e.target.value },
                                `${u.name} is now ${e.target.value}`,
                              )
                            }
                          >
                            <option value="teacher">Teacher</option>
                            <option value="hod">Head of dept.</option>
                          </select>
                        </td>
                      ) : null}
                      <td>
                        <Pill
                          label={u.status === 'active' ? 'Active' : 'Inactive'}
                          tone={u.status === 'active' ? 'p-good' : 'p-bad'}
                        />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <button
                            type="button"
                            className="btn small ghost"
                            disabled={busy}
                            aria-label={`Reset password for ${u.name}`}
                            onClick={() => onReset(u)}
                          >
                            Reset password…
                          </button>
                          {isMe ? (
                            <span className="small">This is you</span>
                          ) : (
                            <button
                              type="button"
                              className="btn small"
                              disabled={busy}
                              aria-label={`${
                                u.status === 'active' ? 'Deactivate' : 'Activate'
                              } ${u.name}`}
                              onClick={() => onToggle(u)}
                            >
                              {u.status === 'active' ? 'Deactivate…' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="empty">
                    No {tab} match
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {!users.length ? <EmptyState>No users yet.</EmptyState> : null}
    </>
  )
}

function AddUserForm({ depts, closeModal, toast, onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('teacher')
  const [deptId, setDeptId] = useState(depts[0]?.id || '')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  async function submit() {
    const next = {}
    const n = name.trim()
    const em = email.trim().toLowerCase()
    if (!n) next.name = "Enter the person's full name"
    if (!/.+@.+\..+/.test(em)) next.email = 'Enter a valid email, e.g. name@school.edu'
    if (role !== 'admin' && !deptId) next.dept = 'Choose a department'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const res = await api.createAdminUser({
        name: n,
        email: em,
        role,
        dept_id: role === 'admin' ? null : deptId,
      })
      onCreated(res.user, res.temporary_password)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not add user.'
      if (err instanceof ApiError && err.status === 409) setErrors({ email: msg })
      else {
        toast(msg, { type: 'error' })
        setBusy(false)
      }
      setBusy(false)
    }
  }

  return (
    <>
      <h3>Add user</h3>
      <Field id="n-name" label="Full name" error={errors.name}>
        <input
          id="n-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field id="n-email" label="Email" error={errors.email}>
        <input
          id="n-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </Field>
      <div className="grid g2e">
        <Field id="n-role" label="Role">
          <select
            id="n-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={busy}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="hod">HOD</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field id="n-dept" label="Department" error={errors.dept}>
          <select
            id="n-dept"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            disabled={busy || role === 'admin'}
          >
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="small">A temporary password is generated and shown once after you add the user.</p>
      <div className="acts">
        <button type="button" className="btn" onClick={closeModal} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn primary${busy ? ' busy' : ''}`}
          onClick={submit}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Adding…' : 'Add user'}
        </button>
      </div>
    </>
  )
}
