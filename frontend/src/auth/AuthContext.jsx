import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [scope, setScope] = useState(null)
  const [loading, setLoading] = useState(true)
  const [publicConfig, setPublicConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)

  const refreshPublicConfig = useCallback(async () => {
    const cfg = await api.publicConfig()
    setPublicConfig(cfg)
    return cfg
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

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password)
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
      logout,
      loading,
      isAuthenticated: !!user,
      publicConfig,
      configLoading,
      refreshPublicConfig,
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
      logout,
      loading,
      publicConfig,
      configLoading,
      refreshPublicConfig,
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
