import { useCallback, useEffect, useState } from 'react'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import ClassCard from '../../components/student/ClassCard'
import JoinClass from '../../components/student/JoinClass'
import { greetingLine, todayLong } from '../../utils/student'

/** Notes from live exams + released results (matched by exam_id per class). */
function notesForClass(cls, data, examIdsByClass) {
  const notes = []
  const cid = cls.id
  ;(data.live_exams || [])
    .filter((x) => x.class_id === cid)
    .forEach((x) => notes.push([`${x.title} is live`, 'p-blue']))
  const ids = new Set(examIdsByClass[cid] || [])
  ;(data.released_results || []).forEach((r) => {
    if (ids.has(r.exam_id)) {
      notes.push([`Results out: ${r.exam_title}`, 'p-good'])
    }
  })
  return notes
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [matCounts, setMatCounts] = useState({})
  const [examIdsByClass, setExamIdsByClass] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dash = await api.getStudentDashboard()
      setData(dash)

      const classes = dash.classes || []
      const counts = {}
      const byClass = {}
      await Promise.all(
        classes.map(async (c) => {
          try {
            const [mats, xs] = await Promise.all([
              api.listMaterials(c.id),
              api.listExams({ class_id: c.id }).catch(() => []),
            ])
            counts[c.id] = mats.length
            byClass[c.id] = (xs || []).map((x) => x.id)
          } catch {
            counts[c.id] = 0
            byClass[c.id] = []
          }
        }),
      )
      setMatCounts(counts)
      setExamIdsByClass(byClass)
    } catch (err) {
      setError(err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const classes = data?.classes || []

  if (loading) return <ShellLoading label="Loading dashboard…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load dashboard.'} onRetry={load} />
    )
  }

  return (
    <>
      <div className="fd-head">
        <span className="small">{todayLong().toUpperCase()}</span>
        <h1>{greetingLine(user?.name).toUpperCase()}</h1>
      </div>

      <div className="sec-head">
        <h2>Your classes</h2>
      </div>

      {classes.length ? (
        <div className="cgrid">
          {classes.map((c, i) => (
            <ClassCard
              key={c.id}
              cls={c}
              index={i}
              notes={notesForClass(c, data, examIdsByClass)}
              materialCount={matCounts[c.id] ?? 0}
              teacherName={null}
            />
          ))}
        </div>
      ) : (
        <EmptyState>You are not in any class yet. Join one below.</EmptyState>
      )}

      <JoinClass onJoined={() => load()} />
    </>
  )
}
