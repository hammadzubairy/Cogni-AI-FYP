import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

export default function Setup() {
  const { user, loading, configLoading, publicConfig, completeSetup, mustChangePassword } =
    useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [institution, setInstitution] = useState('')
  const [term, setTerm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Set up Cogni.ai'
  }, [])

  if (!loading && !configLoading && !publicConfig?.needs_setup && !user) {
    return <Navigate to="/login" replace />
  }

  if (user && !mustChangePassword && !publicConfig?.needs_setup) {
    return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
  }

  async function onSubmit() {
    setError('')
    setBusy(true)
    try {
      const u = await completeSetup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        institution_name: institution.trim(),
        current_term: term.trim(),
      })
      navigate(
        u.must_change_password || mustChangePassword
          ? '/change-password'
          : ROLE_HOME[u.role] || '/app/admin',
        { replace: true },
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed. Try again.')
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your institution"
      subtitle="You are the first admin. Set your sign-in details and how the portal should appear to staff and students."
      sideTitle="Welcome to Cogni.ai"
      sideBody="This one-time setup creates the admin account and saves your institution name and term for the sidebar."
    >
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="su-name">Your full name</label>
        <input
          id="su-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          autoComplete="name"
        />
      </div>
      <div className="field">
        <label htmlFor="su-email">Work email</label>
        <input
          id="su-email"
          type="email"
          placeholder="name@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          autoComplete="username"
        />
      </div>
      <div className="field">
        <label htmlFor="su-pw">Password</label>
        <div className="pw">
          <input
            id="su-pw"
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
      <div className="field">
        <label htmlFor="su-inst">Institution name</label>
        <input
          id="su-inst"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          disabled={busy}
          placeholder="Your university or school"
        />
      </div>
      <div className="field">
        <label htmlFor="su-term">Current term</label>
        <input
          id="su-term"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          disabled={busy}
          placeholder="e.g. Autumn term"
        />
      </div>
      <button
        type="button"
        className="btn primary"
        style={{ width: '100%', minHeight: 48 }}
        onClick={onSubmit}
        disabled={busy}
      >
        {busy ? 'Creating…' : 'Create admin account'}
      </button>
    </AuthShell>
  )
}
