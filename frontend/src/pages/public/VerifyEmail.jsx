import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import * as api from '../../api'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

export default function VerifyEmail() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.title = 'Verify email · Cogni.ai'
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setError('This verification link is invalid or expired.')
      return
    }
    api
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) {
          setDone(true)
          navigate('/login', { replace: true, state: { verifiedOk: true } })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'This verification link is invalid or expired.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, navigate])

  return (
    <AuthShell
      title="Verify email"
      subtitle={done ? 'Email verified. Redirecting to sign in…' : 'Confirming your account…'}
      sideBody="Once verified, sign in with the email and password you chose at signup."
    >
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="callout blue" role="status">
          <Icon name="info" />
          <div>{done ? 'Verified.' : 'Working…'}</div>
        </div>
      )}
      {error ? (
        <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
          <Link to="/register">Create account</Link> · <Link to="/login">Sign in</Link>
        </p>
      ) : null}
    </AuthShell>
  )
}
