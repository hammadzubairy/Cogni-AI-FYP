import { Link } from 'react-router-dom'
import { useAuth, ROLE_HOME } from '../auth/AuthContext'

export default function NotFound() {
  const { user } = useAuth()
  const home = user ? ROLE_HOME[user.role] || '/' : '/'

  return (
    <div className="main" style={{ maxWidth: 560, margin: '80px auto', padding: 24 }}>
      <div className="panel empty">
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Page not found</h1>
        <p className="small" style={{ marginBottom: 20 }}>
          That URL does not match a Cogni.ai page.
        </p>
        <Link className="btn primary" to={home}>
          {user ? 'Back to home' : 'Go to landing'}
        </Link>
      </div>
    </div>
  )
}
