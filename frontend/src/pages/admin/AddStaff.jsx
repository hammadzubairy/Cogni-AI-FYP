import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import TemporaryPasswordDialog from '../../components/TemporaryPasswordDialog'
import { useModal } from '../../components/Modal'
import { useToast } from '../../components/Toast'

/**
 * Admin add staff form (v7 `P['a-add']`).
 */
export default function AddStaff() {
  const navigate = useNavigate()
  const toast = useToast()
  const { openModal, closeModal } = useModal()

  const [depts, setDepts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('teacher')
  const [deptId, setDeptId] = useState('')
  const [makeHod, setMakeHod] = useState(false)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.listAdminDepartments()
      setDepts(d || [])
      setDeptId((prev) => prev || d?.[0]?.id || '')
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function submit() {
    const next = {}
    const n = name.trim()
    const em = email.trim().toLowerCase()
    if (!n) next.name = 'Enter a full name'
    if (!/.+@.+\..+/.test(em)) next.email = 'Enter an email like name@school.edu'
    if (role === 'teacher' && !deptId) next.dept = 'Choose a department'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const createdRole = role === 'teacher' && makeHod ? 'hod' : role
      const res = await api.createAdminUser({
        name: n,
        email: em,
        role: createdRole,
        dept_id: role === 'admin' ? null : deptId,
      })
      const created = res.user
      if (role === 'teacher' && makeHod && created.role !== 'hod') {
        await api.patchAdminDepartment(deptId, { hod_id: created.id })
      }
      toast(`${created.name} added`)
      openModal(
        <TemporaryPasswordDialog
          userLabel={`${created.name} · ${created.email}`}
          temporaryPassword={res.temporary_password}
          onClose={() => {
            closeModal()
            navigate('/app/admin/users')
          }}
        />,
        { onClose: () => navigate('/app/admin/users') },
      )
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not add staff.'
      if (err instanceof ApiError && err.status === 409) setErrors({ email: msg })
      else toast(msg, { type: 'error' })
      setBusy(false)
    }
  }

  if (loading) return <ShellLoading label="Loading…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load form.'} onRetry={load} />
    )
  }

  return (
    <>
      <PageTop
        crumb={
          <Link to="/app/admin/users">
            <Icon name="left" className="sm" />
            Users
          </Link>
        }
        title="Add staff"
      />

      <div className="panel panel-b" style={{ maxWidth: 640 }}>
        <Field id="af-name" label="Full name" error={errors.name}>
          <input
            id="af-name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field id="af-email" label="Email" error={errors.email}>
          <input
            id="af-email"
            type="email"
            autoComplete="off"
            placeholder="name@school.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </Field>

        <fieldset className="apf">
          <legend className="lbl">Role</legend>
          <label className={`apopt${role === 'teacher' ? ' on' : ''}`}>
            <input
              type="radio"
              name="af-role"
              value="teacher"
              checked={role === 'teacher'}
              onChange={() => setRole('teacher')}
              disabled={busy}
            />
            <span>
              <b>Teacher</b>
              <small>
                Runs classes and creates exams. Can also be made head of a department.
              </small>
            </span>
          </label>
          <label className={`apopt${role === 'admin' ? ' on' : ''}`}>
            <input
              type="radio"
              name="af-role"
              value="admin"
              checked={role === 'admin'}
              onChange={() => setRole('admin')}
              disabled={busy}
            />
            <span>
              <b>Admin</b>
              <small>Manages users, departments and settings.</small>
            </span>
          </label>
        </fieldset>

        {role === 'teacher' ? (
          <>
            <Field id="af-dept" label="Department" error={errors.dept}>
              <select
                id="af-dept"
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                disabled={busy}
              >
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="apopt" style={{ marginBottom: 20 }}>
              <input
                type="checkbox"
                id="af-hod"
                checked={makeHod}
                onChange={(e) => setMakeHod(e.target.checked)}
                disabled={busy}
              />
              <span>
                <b>Make them head of this department</b>
                <small>
                  Replaces the current head, who goes back to being a teacher.
                </small>
              </span>
            </label>
          </>
        ) : null}

        <p className="small">
          A temporary password is shown once after you add them. Students aren&apos;t added here
          when self-signup is enabled.
        </p>
        <div className="row">
          <button
            type="button"
            className={`btn primary${busy ? ' busy' : ''}`}
            onClick={submit}
            disabled={busy}
            aria-busy={busy}
          >
            Add {role === 'admin' ? 'admin' : 'teacher'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => navigate('/app/admin/users')}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
