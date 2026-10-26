import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { redirectIfForbiddenRole } from '../../auth/redirectIfForbiddenRole'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import Pill from '../../components/Pill'
import ScoreBar from '../../components/ScoreBar'
import Stat from '../../components/Stat'
import DeptTabs from './DeptTabs'

/**
 * Department analytics (v7 `P['h-analytics']`). Plain CSS bars via ScoreBar.
 */
export default function Analytics() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [deptName, setDeptName] = useState('Department')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const analytics = await api.getHodAnalytics()
      setData(analytics)
      if (user?.dept_name) setDeptName(user.dept_name)
    } catch (err) {
      if (await redirectIfForbiddenRole(err, { refreshUser, navigate })) return
      setError(err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user?.id, user?.email, user?.dept_name, refreshUser, navigate])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <ShellLoading label="Loading analytics…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load analytics.'} onRetry={load} />
    )
  }
  if (!data) {
    return <EmptyState>No analytics yet.</EmptyState>
  }

  const byClass = data.by_class || []
  const topics = data.weakest_topics || []
  // API returns weakest topics (up to 5); fall back to CLO averages if none yet.
  const topicRows =
    topics.length > 0
      ? [...topics].sort((a, b) => a.percent - b.percent)
      : (data.by_clo || []).map((c) => ({
          topic: c.clo,
          percent: c.average_percent ?? 0,
        }))

  const submissionCount = byClass.reduce((s, r) => s + (r.submission_count || 0), 0)
  const flagsPending = (data.teacher_activity || []).reduce(
    (s, t) => s + (t.flags_pending || 0),
    0,
  )
  const flagsTotal = (data.teacher_activity || []).reduce(
    (s, t) => s + (t.flags_total || 0),
    0,
  )
  const flagsReviewed = Math.max(0, flagsTotal - flagsPending)
  const papersApproved = (data.teacher_activity || []).reduce((s, t) => {
    const p = t.papers_by_status || {}
    return s + (p.approved || 0) + (p.published || 0) + (p.closed || 0)
  }, 0)

  return (
    <>
      <PageTop crumb={deptName || 'Department'} title="Department" />
      <DeptTabs current="analytics" />

      <div className="grid g4">
        <Stat label="Classes" value={byClass.length} />
        <Stat label="Submissions graded" value={submissionCount} />
        <Stat
          label="Flags raised / reviewed"
          value={`${flagsTotal} / ${flagsReviewed}`}
        />
        <Stat label="Papers approved" value={papersApproved} />
      </div>

      <Panel title="By class" className="mt" body={false}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Class</th>
                <th>Teacher</th>
                <th>Exams</th>
                <th>Submissions</th>
                <th>Average</th>
                <th>Weakest topic</th>
              </tr>
            </thead>
            <tbody>
              {byClass.length ? (
                byClass.map((r) => {
                  const weak = r.weakest_topic
                  const avg = r.average_percent
                  return (
                    <tr key={r.class_id}>
                      <td>
                        <b>{r.class_code}</b> {r.class_name}
                      </td>
                      <td>{r.teacher_name}</td>
                      <td className="num">{r.exam_count}</td>
                      <td className="num">{r.submission_count}</td>
                      <td style={{ width: 180 }}>
                        {avg == null ? (
                          <span className="small">No data</span>
                        ) : (
                          <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <div style={{ flex: 1 }}>
                              <ScoreBar value={avg} />
                            </div>
                            <b className="num">{avg}%</b>
                          </div>
                        )}
                      </td>
                      <td>
                        {weak ? (
                          <Pill
                            label={`${weak.topic} ${weak.percent}%`}
                            tone={
                              weak.percent < 60
                                ? 'p-bad'
                                : weak.percent < 75
                                  ? 'p-warn'
                                  : 'p-good'
                            }
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="empty">
                    No classes in this department
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid g2e mt">
        <Panel title="Topics across the department">
          {topicRows.length ? (
            topicRows.map((t) => (
              <div className="topicrow" key={t.topic}>
                <span>{t.topic}</span>
                <ScoreBar value={t.percent} />
                <b className="num">{t.percent}%</b>
              </div>
            ))
          ) : (
            <div className="empty">No results yet</div>
          )}
        </Panel>

        <Panel title="Teacher activity" body={false}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Papers</th>
                  <th>Flags reviewed</th>
                </tr>
              </thead>
              <tbody>
                {(data.teacher_activity || []).length ? (
                  data.teacher_activity.map((t) => {
                    const papers = Object.values(t.papers_by_status || {}).reduce(
                      (s, n) => s + n,
                      0,
                    )
                    const reviewed = Math.max(
                      0,
                      (t.flags_total || 0) - (t.flags_pending || 0),
                    )
                    return (
                      <tr key={t.teacher_id}>
                        <td>{t.teacher_name}</td>
                        <td className="num">{papers}</td>
                        <td className="num">
                          {reviewed}/{t.flags_total || 0}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="empty">
                      No teachers yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}
