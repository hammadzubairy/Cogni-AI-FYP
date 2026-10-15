import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

export default function Forgot() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Forgot password · Cogni.ai'
  }, [])

  async function onSubmit() {
    setError('')
    setBusy(true)
    try {
      await api.forgotPassword(email.trim().toLowerCase())
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send reset email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we will send a reset link if an account exists."
    >
      {sent ? (
        <div className="callout blue">
          <Icon name="info" />
          <div>
            If an account exists for that email, a reset link is on its way. Check your inbox and
            spam folder.
          </div>
        </div>
      ) : (
        <>
          {error ? (
            <div className="err" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="f-email">Email</label>
            <input
              id="f-email"
              type="email"
              placeholder="name@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoComplete="username"
            />
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ width: '100%', minHeight: 48 }}
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </>
      )}
      <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  )
}
