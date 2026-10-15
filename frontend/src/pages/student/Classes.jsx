import { useCallback, useEffect, useState } from 'react'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import PageTop from '../../components/PageTop'
import ClassCard from '../../components/student/ClassCard'
import JoinClass from '../../components/student/JoinClass'

export default function Classes() {
  const [classes, setClasses] = useState([])
  const [matCounts, setMatCounts] = useState({})
  const [notesByClass, setNotesByClass] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cls, dash] = await Promise.all([
        api.listClasses(),
        api.getStudentDashboard().catch(() => null),
      ])
      setClasses(cls || [])

      const counts = {}
      const notes = {}
      await Promise.all(
        (cls || []).map(async (c) => {
          try {
            const mats = await api.listMaterials(c.id)
            counts[c.id] = mats.length
          } catch {
            counts[c.id] = 0
          }
          const n = []
          ;(dash?.live_exams || [])
            .filter((x) => x.class_id === c.id)
            .forEach((x) => n.push([`${x.title} is live`, 'p-blue']))
          notes[c.id] = n
        }),
      )
      setMatCounts(counts)
      setNotesByClass(notes)
    } catch (err) {
      setError(err)
      setClasses([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <ShellLoading label="Loading classes…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load classes.'} onRetry={load} />
    )
  }

  return (
    <>
      <PageTop title="Classes" />
      {classes.length ? (
        <div className="cgrid">
          {classes.map((c, i) => (
            <ClassCard
              key={c.id}
              cls={c}
              index={i}
              notes={notesByClass[c.id] || []}
              materialCount={matCounts[c.id] ?? 0}
              teacherName={null}
            />
          ))}
        </div>
      ) : (
        <EmptyState>You are not in any class yet.</EmptyState>
      )}
      <JoinClass onJoined={() => load()} />
    </>
  )
}
