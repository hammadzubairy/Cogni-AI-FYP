import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

export default function Reset() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Reset password · Cogni.ai'
  }, [])

  async function onSubmit() {
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api.resetPassword({ token, new_password: password })
      navigate('/login', { replace: true, state: { resetOk: true } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password.')
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="This link works once. Pick a strong password you have not used here before.">
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="np-pw">New password</label>
        <div className="pw">
          <input
            id="np-pw"
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
      </div>
      <div className="field">
        <label htmlFor="np-pw2">Confirm password</label>
        <input
          id="np-pw2"
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
        {busy ? 'Saving…' : 'Update password'}
      </button>
      <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  )
}
