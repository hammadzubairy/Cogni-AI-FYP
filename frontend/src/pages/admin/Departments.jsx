import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import { useModal } from '../../components/Modal'
import PageTop from '../../components/PageTop'
import { useToast } from '../../components/Toast'
import DeptTabs from './DeptTabs'

/**
 * Admin departments + classes tabs (v7 `P['a-depts']` / `P['a-classes']`).
 */
export default function Departments() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'classes' ? 'classes' : 'depts'
  const toast = useToast()
  const { openModal, closeModal } = useModal()

  const [depts, setDepts] = useState([])
  const [users, setUsers] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [d, u, c] = await Promise.all([
        api.listAdminDepartments(),
        api.listAdminUsers(),
        api.listAdminClasses(),
      ])
      setDepts(d || [])
      setUsers(u || [])
      setClasses(c || [])
    } catch (err) {
      // Dead JWT: client already redirects to /login — avoid flashing credentials error.
      if (err instanceof ApiError && err.status === 401) {
        setError(null)
        return
      }
      setError(err)
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

  const deptById = useMemo(() => {
    const m = new Map()
    depts.forEach((d) => m.set(d.id, d))
    return m
  }, [depts])

  function teachersInDept(deptId) {
    return users.filter(
      (u) =>
        u.dept_id === deptId &&
        (u.role === 'teacher' || u.role === 'hod') &&
        u.status === 'active',
    )
  }

  function openAddDept() {
    openModal(
      <AddDeptForm
        closeModal={closeModal}
        toast={toast}
        onCreated={(created) => {
          setDepts((prev) => [...prev, created])
          closeModal()
          toast(`${created.name} created. Assign an HOD next.`)
        }}
      />,
    )
  }

  async function onAssignHod(deptId, hodId) {
    setBusy(`hod-${deptId}`)
    try {
      const updated = await api.patchAdminDepartment(deptId, {
        hod_id: hodId || null,
      })
      setDepts((prev) => prev.map((d) => (d.id === deptId ? updated : d)))
      const refreshed = await api.listAdminUsers().catch(() => null)
      if (refreshed) setUsers(refreshed)
      toast('HOD updated')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not assign HOD.', {
        type: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  async function onReassignTeacher(classId, teacherId) {
    setBusy(`cls-${classId}`)
    try {
      const updated = await api.patchAdminClass(classId, { teacher_id: teacherId })
      setClasses((prev) => prev.map((c) => (c.id === classId ? updated : c)))
      toast('Class reassigned')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reassign class.', {
        type: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <ShellLoading label="Loading departments…" />
  if (error) {
    return (
      <ShellError
        message={error.message || 'Could not load departments.'}
        onRetry={load}
      />
    )
  }

  return (
    <>
      <PageTop
        title="Departments"
        actions={
          tab === 'depts' ? (
            <button type="button" className="btn primary" onClick={openAddDept}>
              <Icon name="plus" className="sm" />
              Add department
            </button>
          ) : null
        }
      />
      <DeptTabs current={tab === 'classes' ? 'classes' : 'depts'} />

      {tab === 'classes' ? (
        <div className="panel">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Department</th>
                  <th>Teacher</th>
                  <th>Students</th>
                  <th>Exams</th>
                  <th>Join code</th>
                </tr>
              </thead>
              <tbody>
                {classes.length ? (
                  classes.map((c) => {
                    const candidates = teachersInDept(c.dept_id).filter(
                      (u) => u.role === 'teacher' || u.id === c.teacher_id,
                    )
                    const teachers =
                      candidates.length > 0
                        ? candidates
                        : teachersInDept(c.dept_id)
                    return (
                      <tr key={c.id}>
                        <td>
                          <b>{c.code}</b>
                          <div className="small">{c.name}</div>
                        </td>
                        <td>{deptById.get(c.dept_id)?.name || '—'}</td>
                        <td>
                          <select
                            aria-label={`Teacher for ${c.code}`}
                            value={c.teacher_id}
                            disabled={busy === `cls-${c.id}`}
                            onChange={(e) =>
                              onReassignTeacher(c.id, e.target.value)
                            }
                          >
                            {teachers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num">
                          {c.student_count ?? c.student_ids?.length ?? 0}
                        </td>
                        <td className="num">{c.exam_count ?? 0}</td>
                        <td>
                          <span className="chip">{c.join_code}</span>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="empty">
                      No classes yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid g3">
          {depts.length ? (
            depts.map((d) => {
              const h = d.hod_id ? userById.get(d.hod_id) : null
              const teachers = users.filter(
                (u) => u.dept_id === d.id && u.role === 'teacher',
              ).length
              const students = users.filter(
                (u) => u.dept_id === d.id && u.role === 'student',
              ).length
              const nc = classes.filter((c) => c.dept_id === d.id).length
              const cand = teachersInDept(d.id)
              return (
                <div className="panel" key={d.id}>
                  <div className="panel-h">
                    <h3>{d.name}</h3>
                    <span className="chip">{String(d.code || d.id).toUpperCase()}</span>
                  </div>
                  <div className="panel-b">
                    <span className="small">Head of department</span>
                    <p style={{ margin: '4px 0 14px', fontSize: 17, fontWeight: 600 }}>
                      {h ? h.name : 'No head yet'}
                    </p>
                    <label className="sr-only" htmlFor={`d-hod-${d.id}`}>
                      Assign HOD for {d.name}
                    </label>
                    <select
                      id={`d-hod-${d.id}`}
                      value={d.hod_id || ''}
                      disabled={busy === `hod-${d.id}`}
                      aria-label={`Assign HOD for ${d.name}`}
                      onChange={(e) => onAssignHod(d.id, e.target.value)}
                      style={{ width: '100%', marginBottom: 12 }}
                    >
                      <option value="">No head</option>
                      {cand.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.id === d.hod_id ? ' · current' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="meta">
                      <span>{teachers} teachers</span>
                      <span>{students} students</span>
                      <span>{nc} classes</span>
                    </div>
                    <div className="row" style={{ marginTop: 18 }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() =>
                          navigate(`/app/admin/departments/${d.id}/head`)
                        }
                      >
                        {h ? 'Change head…' : 'Assign a head…'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <EmptyState>No departments yet. Add one to get started.</EmptyState>
          )}
        </div>
      )}
    </>
  )
}

function AddDeptForm({ closeModal, toast, onCreated }) {
  const [name, setName] = useState('Artificial Intelligence')
  const [code, setCode] = useState('AI')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  async function submit() {
    const next = {}
    const n = name.trim()
    const c = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!n) next.name = 'Enter a department name'
    if (!c) next.code = 'Enter a short code using letters or numbers'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const created = await api.createAdminDepartment({ code: c, name: n })
      onCreated(created)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not create department.'
      if (err instanceof ApiError && err.status === 409) setErrors({ code: msg })
      else {
        toast(msg, { type: 'error' })
        setBusy(false)
      }
      setBusy(false)
    }
  }

  return (
    <>
      <h3>Add department</h3>
      <Field id="nd-name" label="Department name" error={errors.name}>
        <input
          id="nd-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field id="nd-code" label="Short code" error={errors.code}>
        <input
          id="nd-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
        />
      </Field>
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
          Add department
        </button>
      </div>
    </>
  )
}
