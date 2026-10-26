import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import * as api from '../../api'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

const PORTALS = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'hod', label: 'Head of Department' },
  { value: 'admin', label: 'Admin' },
]

export default function Login() {
  const { user, login, loading: authLoading, publicConfig, mustChangePassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [portal, setPortal] = useState('student')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    document.title = 'Sign in · Cogni.ai'
  }, [])

  useEffect(() => {
    if (location.state?.resetOk) {
      setNotice('Password updated. Sign in with your new password.')
      navigate(location.pathname, { replace: true, state: {} })
    } else if (location.state?.verifiedOk) {
      setNotice('Email verified. Sign in with your password.')
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  if (!authLoading && user) {
    if (mustChangePassword) return <Navigate to="/change-password" replace />
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  const signupEnabled = publicConfig?.student_signup_enabled !== false

  const doLogin = async (em, pw, role) => {
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const u = await login(em.trim(), pw, role)
      if (u.must_change_password) {
        navigate('/change-password', { replace: true })
      } else {
        navigate(ROLE_HOME[u.role] || '/', { replace: true })
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Sign in failed. Please try again.'
      setError(msg)
      if (
        err instanceof ApiError &&
        typeof err.message === 'string' &&
        err.message.toLowerCase().includes('verify your email')
      ) {
        setNotice('Need a new link? Use Resend below after entering your email.')
      }
      setSubmitting(false)
    }
  }

  const onResendVerification = async () => {
    if (!email.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await api.resendVerification(email.trim().toLowerCase())
      setNotice('If that account needs verification, we sent another email.')
    } catch {
      setNotice('Could not resend right now. Try again shortly.')
    } finally {
      setSubmitting(false)
    }
  }

  const onSignIn = () => {
    if (submitting) return
    doLogin(email, password, portal)
  }

  const onEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSignIn()
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the email and password from your institution."
      sideBody="Students can create an account when signup is enabled, then verify their email. Staff are added by an admin. Join a class with a code from your teacher after signing up."
    >
      {notice ? (
        <div className="callout blue" role="status">
          <Icon name="info" />
          <div>{notice}</div>
        </div>
      ) : null}
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="l-email">Email</label>
        <input
          id="l-email"
          type="email"
          autoComplete="username"
          placeholder="name@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onEnter}
          disabled={submitting}
        />
      </div>
      <div className="field">
        <label htmlFor="l-pw">Password</label>
        <div className="pw">
          <input
            id="l-pw"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onEnter}
            disabled={submitting}
            aria-invalid={error ? 'true' : undefined}
          />
          <button
            type="button"
            className="btn ghost"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            aria-pressed={showPw}
            onClick={() => setShowPw((v) => !v)}
          >
            <Icon name={showPw ? 'eyeoff' : 'eye'} />
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="l-portal">Portal</label>
        <select
          id="l-portal"
          value={portal}
          onChange={(e) => setPortal(e.target.value)}
          disabled={submitting}
        >
          {PORTALS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn primary"
        style={{ width: '100%', minHeight: 48 }}
        onClick={onSignIn}
        disabled={submitting}
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
        <Link to="/forgot">Forgot password?</Link>
        {signupEnabled ? (
          <>
            {' '}
            · <Link to="/register">Create student account</Link>
          </>
        ) : null}
      </p>
      {notice && error && error.toLowerCase().includes('verify your email') ? (
        <button
          type="button"
          className="btn ghost"
          style={{ width: '100%', marginTop: 12 }}
          onClick={onResendVerification}
          disabled={submitting || !email.trim()}
        >
          Resend verification email
        </button>
      ) : null}
    </AuthShell>
  )
}
