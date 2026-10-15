import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import * as api from '../../api'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

export default function Register() {
  const { user, loading, configLoading, publicConfig, mustChangePassword } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [resendBusy, setResendBusy] = useState(false)
  const [resendNotice, setResendNotice] = useState('')

  useEffect(() => {
    document.title = 'Create account · Cogni.ai'
  }, [])

  if (!loading && !configLoading && publicConfig && !publicConfig.student_signup_enabled) {
    return <Navigate to="/login" replace />
  }

  if (user && !mustChangePassword) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  async function onSubmit() {
    setError('')
    setBusy(true)
    try {
      const res = await api.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      setPendingEmail(res.email || email.trim().toLowerCase())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create account.')
      setBusy(false)
    }
  }

  async function onResend() {
    if (!pendingEmail || resendBusy) return
    setResendBusy(true)
    setResendNotice('')
    try {
      await api.resendVerification(pendingEmail)
      setResendNotice('If that account needs verification, we sent another email.')
    } catch {
      setResendNotice('Could not resend right now. Try again shortly.')
    } finally {
      setResendBusy(false)
    }
  }

  if (pendingEmail) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We sent a verification link. Open it to activate your student account, then sign in."
        sideBody="Staff accounts (teacher, HOD, admin) are created by an institution admin — not through this form."
      >
        <div className="callout blue" role="status">
          <Icon name="info" />
          <div>
            Verification email sent to <b>{pendingEmail}</b>. The link expires in about an hour.
          </div>
        </div>
        {resendNotice ? (
          <p className="small" style={{ marginTop: 14 }}>
            {resendNotice}
          </p>
        ) : null}
        <button
          type="button"
          className="btn"
          style={{ width: '100%', minHeight: 48, marginTop: 16 }}
          onClick={onResend}
          disabled={resendBusy}
        >
          {resendBusy ? 'Sending…' : 'Resend verification email'}
        </button>
        <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
          Ready? <Link to="/login">Sign in</Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create student account"
      subtitle="Sign up with your school email. After you verify the message we send, you can sign in and join a class with a code from your teacher."
      sideBody="Public signup is for students only. Teachers, heads and admins are added by an institution admin."
    >
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
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
