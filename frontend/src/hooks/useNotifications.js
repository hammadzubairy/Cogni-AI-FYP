import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as api from '../api'

const POLL_MS = 30_000

/** Loads GET /api/notifications; polls every 30s and on route change. */
export default function useNotifications(enabled = true) {
  const location = useLocation()
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const data = await api.listNotifications()
      setItems(Array.isArray(data?.items) ? data.items : [])
      setUnreadCount(data?.unread_count ?? 0)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      setUnreadCount(0)
      setLoading(false)
      return undefined
    }
    setLoading(true)
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [enabled, refresh, location.pathname])

  const markRead = useCallback(async (id) => {
    await api.markNotificationRead(id)
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead()
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [])

  return {
    items,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
  }
}
