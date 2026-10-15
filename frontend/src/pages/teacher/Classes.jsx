import { useCallback, useEffect, useState } from 'react'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import PageTop from '../../components/PageTop'
import ClassCard from '../../components/teacher/ClassCard'
import { NewClassButton } from '../../components/teacher/NewClassModal'
import EmptyState from '../../components/EmptyState'

export default function Classes() {
  const [classes, setClasses] = useState([])
  const [matCounts, setMatCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listClasses()
      setClasses(list)
      const counts = {}
      await Promise.all(
        list.map(async (c) => {
          try {
            counts[c.id] = (await api.listMaterials(c.id)).length
          } catch {
            counts[c.id] = 0
          }
        }),
      )
      setMatCounts(counts)
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
    return <ShellError message={error.message || 'Could not load classes.'} onRetry={load} />
  }

  return (
    <>
      <PageTop title="Classes" actions={<NewClassButton />} />
      {classes.length ? (
        <div className="cgrid">
          {classes.map((c, i) => (
            <ClassCard key={c.id} cls={c} index={i} materialCount={matCounts[c.id] ?? 0} />
          ))}
        </div>
      ) : (
        <EmptyState>No classes yet. Create one to start.</EmptyState>
      )}
    </>
  )
}
