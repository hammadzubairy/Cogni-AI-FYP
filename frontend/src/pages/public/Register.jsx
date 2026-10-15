import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import * as api from '../../api'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'hod', label: 'HOD' },
  { value: 'admin', label: 'Admin' },
]

export default function Register() {
  const { user, loading, configLoading, publicConfig, register, mustChangePassword } =
    useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [deptId, setDeptId] = useState('')
  const [departments, setDepartments] = useState([])
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const needsDept = role === 'teacher' || role === 'hod'

  useEffect(() => {
    document.title = 'Create account · Cogni.ai'
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .publicDepartments()
      .then((list) => {
        if (!cancelled) {
          setDepartments(Array.isArray(list) ? list : [])
        }
      })
      .catch(() => {
        if (!cancelled) setDepartments([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loading && !configLoading && publicConfig && !publicConfig.student_signup_enabled) {
    return <Navigate to="/login" replace />
  }

  if (user && !mustChangePassword) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  async function onSubmit() {
    setError('')
    if (needsDept && !deptId) {
      setError('Choose a department.')
      return
    }
    setBusy(true)
    try {
      const body = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      }
      if (needsDept) body.dept_id = deptId
      const u = await register(body)
      navigate(
        u.must_change_password ? '/change-password' : ROLE_HOME[u.role] || '/app/student',
        { replace: true },
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create account.')
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Pick your role, then sign up with your school email. Teachers and heads need a department."
      sideBody="Students, teachers, heads and admins can create an account when signup is enabled. Join a class with a code from your teacher after signing up as a student."
    >
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="r-role">I am a…</label>
        <select
          id="r-role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value)
            setDeptId('')
          }}
          disabled={busy}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {needsDept ? (
        <div className="field">
          <label htmlFor="r-dept">Department</label>
          <select
            id="r-dept"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            disabled={busy || departments.length === 0}
          >
            <option value="">
              {departments.length ? 'Select department…' : 'No departments yet — ask an admin'}
            </option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="r-name">Full name</label>
        <input
          id="r-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          autoComplete="name"
        />
      </div>
      <div className="field">
        <label htmlFor="r-email">School email</label>
        <input
          id="r-email"
          type="email"
          placeholder="name@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          autoComplete="username"
        />
      </div>
      <div className="field">
        <label htmlFor="r-pw">Password</label>
        <div className="pw">
          <input
            id="r-pw"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="btn ghost"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            onClick={() => setShowPw((v) => !v)}
          >
            <Icon name={showPw ? 'eyeoff' : 'eye'} />
          </button>
        </div>
        <p className="small">At least 10 characters; not your email or a common password.</p>
      </div>
      <button
        type="button"
        className="btn primary"
        style={{ width: '100%', minHeight: 48 }}
        onClick={onSubmit}
        disabled={busy}
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  )
}
