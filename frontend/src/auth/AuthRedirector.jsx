import { Navigate, useLocation } from 'react-router-dom'
import { ROLE_HOME, useAuth } from './AuthContext'

const PUBLIC_AUTH_PATHS = new Set([
  '/',
  '/setup',
  '/login',
  '/register',
  '/forgot',
])

function isResetPath(path) {
  return path.startsWith('/reset/')
}

/**
 * Global guards: first-run setup, forced password change, and setup route lockout.
 */
export default function AuthRedirector({ children }) {
  const { user, loading, configLoading, publicConfig, mustChangePassword } = useAuth()
  const location = useLocation()
  const path = location.pathname

  if (loading || configLoading) {
    return (
      <div className="main" style={{ padding: 40 }}>
        <div className="panel empty">Loading…</div>
      </div>
    )
  }

  const needsSetup = publicConfig?.needs_setup

  if (needsSetup && path !== '/setup') {
    return <Navigate to="/setup" replace />
  }

  if (!needsSetup && path === '/setup') {
    return <Navigate to={user ? ROLE_HOME[user.role] || '/login' : '/login'} replace />
  }

  if (mustChangePassword && user && path !== '/change-password') {
    return <Navigate to="/change-password" replace state={{ from: path }} />
  }

  if (!mustChangePassword && path === '/change-password' && user) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  if (
    user &&
    !mustChangePassword &&
    (path === '/login' || path === '/register' || path === '/setup')
  ) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  if (path === '/register') {
    if (needsSetup) return <Navigate to="/setup" replace />
    if (publicConfig && !publicConfig.student_signup_enabled) {
      return <Navigate to="/login" replace />
    }
  }

  if (
    user &&
    !mustChangePassword &&
    !needsSetup &&
    PUBLIC_AUTH_PATHS.has(path) === false &&
    !isResetPath(path) &&
    path.startsWith('/app')
  ) {
    /* app routes handled by RoleRoute */
  }

  return children
}
