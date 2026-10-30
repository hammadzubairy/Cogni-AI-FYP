import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

export default function ChangePassword() {
  const { user, loading, mustChangePassword, changePassword, logout } = useAuth()
  const navigate = useNavigate()

  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Change password · Cogni.ai'
  }, [])

  if (!loading && !user) {
    return <Navigate to="/login" replace />
  }

  async function onSubmit() {
    setError('')
    if (password !== confirm) {
      setError('New passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const u = await changePassword(current, password)
      navigate(ROLE_HOME[u.role] || '/login', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password.')
      setBusy(false)
    }
  }

  function onSignOut() {
    logout()
    // Hard redirect — same clean slate as a refresh (avoids credentials flash).
    window.location.assign('/login')
  }

  const titleAction = (
    <button
      type="button"
      className="btn ghost icon"
      aria-label={showPw ? 'Hide passwords' : 'Show passwords'}
      aria-pressed={showPw}
      onClick={() => setShowPw((v) => !v)}
    >
      <Icon name={showPw ? 'eyeoff' : 'eye'} />
    </button>
  )

  return (
    <AuthShell
      title="Change your password"
      titleAction={titleAction}
      subtitle={
        mustChangePassword
          ? 'Your account must use a new password before you can use the rest of Cogni.ai.'
          : 'Update your password.'
      }
    >
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="cp-cur">Current password</label>
        <input
          id="cp-cur"
          type={showPw ? 'text' : 'password'}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={busy}
          autoComplete="current-password"
        />
      </div>
      <div className="field">
        <label htmlFor="cp-new">New password</label>
        <input
          id="cp-new"
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
        />
        <p className="small">At least 10 characters; not your email or a common password.</p>
      </div>
      <div className="field">
        <label htmlFor="cp-new2">Confirm new password</label>
        <input
          id="cp-new2"
          type={showPw ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
        />
      </div>
      <button
        type="button"
        className="btn primary"
        style={{ width: '100%', minHeight: 48 }}
        onClick={onSubmit}
        disabled={busy}
      >
        {busy ? 'Saving…' : 'Save new password'}
      </button>
      <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
        <button type="button" className="btn ghost small" onClick={onSignOut}>
          Sign out
        </button>
      </p>
    </AuthShell>
  )
}
