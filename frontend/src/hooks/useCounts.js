import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'

/**
 * Fetches only the dashboard fields each role's nav badges need.
 * - HOD: pending approvals
 * - Teacher: returned exams + open requests + undecided flags (Review badge)
 * - Student: live exams
 * - Admin: none
 */
export default function useCounts(role) {
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(!!role && role !== 'admin')
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!role || role === 'admin') {
      setCounts({})
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (role === 'hod') {
        const data = await api.getHodDashboard()
        const n =
          data?.stats?.pending_approvals ??
          data?.pending_approvals?.length ??
          0
        setCounts({ approvals: n })
      } else if (role === 'teacher') {
        const data = await api.getTeacherDashboard()
        const returned = data?.returned_exams?.length ?? 0
        const openReq = data?.open_requests?.length ?? 0
        const flags = data?.undecided_flags ?? 0
        setCounts({
          returned,
          openRequests: openReq,
          flags,
          // v7 Review badge is flags; brief also counts returned + open requests
          review: returned + openReq + flags,
        })
      } else if (role === 'student') {
        const data = await api.getStudentDashboard()
        setCounts({ live: data?.live_exams?.length ?? 0 })
      } else {
        setCounts({})
      }
    } catch (err) {
      setError(err)
      setCounts({})
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { counts, loading, error, refresh }
}
