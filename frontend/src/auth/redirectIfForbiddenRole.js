import { ApiError } from '../api/client'
import { ROLE_HOME } from './AuthContext'

/**
 * On 403 (wrong role with a still-valid token), refresh /auth/me and
 * send the user to their real role home instead of a Retry loop.
 * @returns {Promise<boolean>} true if a redirect was triggered
 */
export async function redirectIfForbiddenRole(err, { refreshUser, navigate }) {
  if (!(err instanceof ApiError) || err.status !== 403) return false
  if (typeof refreshUser !== 'function' || typeof navigate !== 'function') return false
  const me = await refreshUser().catch(() => null)
  const home = ROLE_HOME[me?.role]
  if (!home) return false
  navigate(home, { replace: true })
  return true
}
