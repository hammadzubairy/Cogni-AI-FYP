/** Thin fetch wrapper for /api. Token lives in localStorage under TOKEN_KEY only. */

export const TOKEN_KEY = 'cogni-token'

/** Optional absolute API origin for production (e.g. https://cogni-api.vercel.app). */
const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.message = message
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  setToken(null)
}

function redirectToLogin() {
  clearToken()
  if (typeof window === 'undefined') return
  const path = window.location.pathname
  if (path === '/login' || path === '/' || path === '/change-password') return
  window.location.assign('/login')
}

function parseDetail(body) {
  if (!body || typeof body !== 'object') {
    return { detail: 'Request failed.', code: 'ERROR' }
  }
  const detail = body.detail
  let message = 'Request failed.'
  if (typeof detail === 'string') message = detail
  else if (Array.isArray(detail)) {
    message = detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d)))
      .join('; ')
  } else if (detail && typeof detail === 'object' && detail.msg) {
    message = detail.msg
  }
  return { detail: message, code: body.code || 'ERROR' }
}

/**
 * @param {string} path - path under /api, e.g. '/auth/login' or 'auth/login'
 * @param {RequestInit & { json?: unknown, formData?: FormData, skipAuth?: boolean }} [options]
 */
export async function request(path, options = {}) {
  const { json, formData, skipAuth, headers: extraHeaders, ...rest } = options
  const apiPath = path.startsWith('/api')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`
  const url = API_BASE ? `${API_BASE}${apiPath}` : apiPath

  const headers = new Headers(extraHeaders || {})
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  let sentAuth = false
  if (!skipAuth) {
    const token = getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
      sentAuth = true
    }
  }

  const init = { ...rest, headers }
  if (json !== undefined) init.body = JSON.stringify(json)
  else if (formData !== undefined) init.body = formData

  let res
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error. Check your connection and try again.')
  }

  if (res.status === 204) return null

  const text = await res.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!res.ok) {
    // Only bounce on 401 when a Bearer token was sent (not public login failures).
    if (res.status === 401 && sentAuth) redirectToLogin()
    const { detail, code } = parseDetail(body)
    throw new ApiError(res.status, code, detail || res.statusText || 'Request failed.')
  }

  if (!text) return null
  return body
}

export function get(path, options) {
  return request(path, { ...options, method: 'GET' })
}

export function post(path, json, options) {
  return request(path, { ...options, method: 'POST', json })
}

export function put(path, json, options) {
  return request(path, { ...options, method: 'PUT', json })
}

export function patch(path, json, options) {
  return request(path, { ...options, method: 'PATCH', json })
}

export function del(path, options) {
  return request(path, { ...options, method: 'DELETE' })
}

/** Multipart upload (do not set Content-Type; browser sets boundary). */
export function upload(path, formData, options) {
  return request(path, { ...options, method: 'POST', formData })
}
