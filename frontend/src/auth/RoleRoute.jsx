import { Navigate, useLocation } from 'react-router-dom'
import { ROLE_HOME, useAuth } from './AuthContext'

/**
 * Guards /app/* routes by auth and optional role allow-list.
 * Cross-role URLs redirect to that user's role home.
 */
export default function RoleRoute({ roles, children }) {
  const { user, loading, mustChangePassword } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="main" style={{ padding: 40 }}>
        <div className="panel empty">Loading session…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (mustChangePassword) {
    return <Navigate to="/change-password" replace state={{ from: location.pathname }} />
  }

  if (roles && roles.length && !roles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
  }

  return children
}
