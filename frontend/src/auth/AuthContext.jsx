import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as api from '../api'
import { ApiError, clearToken, getToken, setToken } from '../api/client'

const AuthContext = createContext(null)

const USER_SNAPSHOT_KEY = 'cogni-user'

export const ROLE_HOME = {
  admin: '/app/admin',
  hod: '/app/hod',
  teacher: '/app/teacher',
  student: '/app/student',
}

function loadUserSnapshot() {
  try {
    const raw = localStorage.getItem(USER_SNAPSHOT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveUserSnapshot(user) {
  try {
    if (user) localStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_SNAPSHOT_KEY)
  } catch {
    /* ignore */
  }
}

function applyAuthResult(res, setUser, setScope) {
  setToken(res.access_token)
  setUser(res.user)
  saveUserSnapshot(res.user)
  setScope(res.scope === 'change_password' ? 'change_password' : null)
  return res.user
}

function rolePrefix(role) {
  return ROLE_HOME[role] || null
}

/** If the path is under an old role's app area, send them to the new role home. */
function maybeRedirectForRoleChange(oldRole, newRole) {
  if (!oldRole || !newRole || oldRole === newRole) return
  if (typeof window === 'undefined') return
  const oldHome = rolePrefix(oldRole)
  const newHome = rolePrefix(newRole)
  if (!oldHome || !newHome) return
  const path = window.location.pathname
  if (path === oldHome || path.startsWith(`${oldHome}/`)) {
    window.location.assign(newHome)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [scope, setScope] = useState(null)
  const [loading, setLoading] = useState(true)
  const [publicConfig, setPublicConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)
  const userRef = useRef(null)
  userRef.current = user

  const refreshPublicConfig = useCallback(async () => {
    const cfg = await api.publicConfig()
    setPublicConfig(cfg)
    return cfg
  }, [])

  const refreshUser = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setUser(null)
      setScope(null)
      saveUserSnapshot(null)
      return null
    }
    const prev = userRef.current
    try {
      const me = await api.getMe()
      setUser(me)
      saveUserSnapshot(me)
      setScope(me.must_change_password ? 'change_password' : null)
      if (prev?.role && me?.role && prev.role !== me.role) {
        maybeRedirectForRoleChange(prev.role, me.role)
      }
      return me
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        const snap = loadUserSnapshot()
        if (snap) {
          setUser(snap)
          setScope('change_password')
          return snap
        }
      }
      if (err instanceof ApiError && err.status === 401) {
        // client.js already clears token + redirects
        setUser(null)
        setScope(null)
        saveUserSnapshot(null)
        return null
      }
      throw err
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .publicConfig()
      .then((cfg) => {
        if (!cancelled) setPublicConfig(cfg)
      })
      .catch(() => {
        if (!cancelled) setPublicConfig(null)
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function restore() {
      const token = getToken()
      if (!token) {
        if (!cancelled) {
          setUser(null)
          setScope(null)
          setLoading(false)
        }
        return
      }
      try {
        const me = await api.getMe()
        if (!cancelled) {
          setUser(me)
          saveUserSnapshot(me)
          setScope(me.must_change_password ? 'change_password' : null)
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          const snap = loadUserSnapshot()
          if (!cancelled && snap) {
            setUser(snap)
            setScope('change_password')
          } else if (!cancelled) {
            clearToken()
            saveUserSnapshot(null)
            setUser(null)
            setScope(null)
          }
        } else {
          clearToken()
          saveUserSnapshot(null)
          if (!cancelled) {
            setUser(null)
            setScope(null)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    restore()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onFocusOrVisible() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (!getToken()) return
      refreshUser().catch(() => {
        /* ignore background refresh failures */
      })
    }
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    return () => {
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
    }
  }, [refreshUser])

  const login = useCallback(async (email, password, role) => {
    const res = await api.login(email, password, role)
    return applyAuthResult(res, setUser, setScope)
  }, [])

  const switchRole = useCallback(async (role) => {
    const res = await api.switchRole(role)
    // Caller (AppShell) navigates to ROLE_HOME; avoid a hard window.location race.
    return applyAuthResult(res, setUser, setScope)
  }, [])

  const completeSetup = useCallback(async (body) => {
    const res = await api.setupAdmin(body)
    const u = applyAuthResult(res, setUser, setScope)
    await refreshPublicConfig()
    return u
  }, [refreshPublicConfig])

  const register = useCallback(async (body) => {
    // Public register returns pending_verification (no JWT).
    return api.register(body)
  }, [])

  /** @deprecated use register */
  const registerStudent = register

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const res = await api.changePassword({
      current_password: currentPassword,
      new_password: newPassword,
    })
    return applyAuthResult(res, setUser, setScope)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    saveUserSnapshot(null)
    setUser(null)
    setScope(null)
  }, [])

  const mustChangePassword =
    scope === 'change_password' || !!user?.must_change_password

  const value = useMemo(
    () => ({
      user,
      scope,
      mustChangePassword,
      login,
      switchRole,
      logout,
      loading,
      isAuthenticated: !!user,
      publicConfig,
      configLoading,
      refreshPublicConfig,
      refreshUser,
      completeSetup,
      register,
      registerStudent,
      changePassword,
    }),
    [
      user,
      scope,
      mustChangePassword,
      login,
      switchRole,
      logout,
      loading,
      publicConfig,
      configLoading,
      refreshPublicConfig,
      refreshUser,
      completeSetup,
      register,
      registerStudent,
      changePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
