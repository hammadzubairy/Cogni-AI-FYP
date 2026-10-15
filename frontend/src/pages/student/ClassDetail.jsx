import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import {
  attemptPercent,
  classHue,
  formatTeacherName,
  formatSubmittedAt,
  materialKindLabel,
} from '../../utils/student'
import Exams from './Exams'
import Results from './Results'

const TABS = [
  ['overview', 'Overview'],
  ['exams', 'Exams'],
  ['results', 'Results'],
  ['material', 'Material'],
]

export default function ClassDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'

  const [cls, setCls] = useState(null)
  const [exams, setExams] = useState([])
  const [materials, setMaterials] = useState([])
  const [attempts, setAttempts] = useState([])
  const [classIndex, setClassIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, xs, mats, ats, allClasses] = await Promise.all([
        api.getClass(id),
        api.listExams({ class_id: id }),
        api.listMaterials(id),
        api.listMyAttempts(),
        api.listClasses().catch(() => []),
      ])
      setCls(c)
      setExams(xs || [])
      setMaterials(mats || [])
      setAttempts(ats || [])
      const idx = (allClasses || []).findIndex((x) => x.id === id)
      setClassIndex(idx >= 0 ? idx : 0)
    } catch (err) {
      setError(err)
      setCls(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const setTab = (k) => {
    const next = new URLSearchParams(searchParams)
    if (k === 'overview') next.delete('tab')
    else next.set('tab', k)
    setSearchParams(next, { replace: true })
  }

  const attemptByExam = useMemo(() => {
    const m = new Map()
    attempts.forEach((a) => m.set(a.exam_id, a))
    return m
  }, [attempts])

  const available = useMemo(() => {
    return exams.filter((x) => {
      if (x.status !== 'published') return false
      const at = attemptByExam.get(x.id)
      return !(at && at.status === 'submitted')
    })
  }, [exams, attemptByExam])

  const released = useMemo(() => {
    return attempts.filter((a) => {
      if (a.status !== 'submitted') return false
      const x = exams.find((e) => e.id === a.exam_id)
      return x && x.released
    })
  }, [attempts, exams])

  const avg = useMemo(() => {
    if (!released.length) return null
    const sum = released.reduce((s, a) => {
      const x = exams.find((e) => e.id === a.exam_id)
      return s + (x ? attemptPercent(a, x) : 0)
    }, 0)
    return Math.round(sum / released.length)
  }, [released, exams])

  if (loading) return <ShellLoading label="Loading class…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Class not found.'} onRetry={load} />
    )
  }
  if (!cls) return <EmptyState>Class not found.</EmptyState>

  const teacher = formatTeacherName()
  const hue = classHue(classIndex)

  let body = null
  if (tab === 'overview') {
    body = (
      <>
        <div className="sgrid">
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('exams')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('exams')
              }
            }}
          >
            <h3>Exams</h3>
            <b className="scard-n">{available.length}</b>
            <p className="small">
              {available.length
                ? `Open now: ${available[0].title}`
                : 'Nothing open right now'}
            </p>
            {available.length ? (
              <button
                type="button"
                className="btn primary small"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/app/student/exams/${available[0].id}/take`)
                }}
              >
                Start exam
              </button>
            ) : null}
          </article>
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('results')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('results')
              }
            }}
          >
            <h3>Results</h3>
            <b className="scard-n">{avg == null ? '—' : `${avg}%`}</b>
            <p className="small">
              {released.length
                ? `${released.length} released · see your study plan`
                : 'Released after your teacher reviews answers'}
            </p>
          </article>
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('material')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('material')
              }
            }}
          >
            <h3>Material</h3>
            <b className="scard-n">{materials.length}</b>
            <p className="small">Ask the study assistant about any file</p>
          </article>
        </div>
        <section className="dzone" aria-labelledby="dz-h">
          <div>
            <h3 id="dz-h">Leave this class</h3>
            <p className="small">
              You&apos;ll lose access to its exams and material. Your submitted results are kept.
              You can rejoin with the join code.
            </p>
          </div>
          <button
            type="button"
            className="btn bad"
            onClick={() =>
              toast('Ask your teacher to remove you from this class.', { type: 'error' })
            }
          >
            Leave class…
          </button>
        </section>
      </>
    )
  } else if (tab === 'exams') {
    body = <Exams classId={id} />
  } else if (tab === 'results') {
    body = <Results classId={id} />
  } else if (tab === 'material') {
    body = (
      <div className="panel">
        {materials.length ? (
          materials.map((m) => (
            <div className="lrow" key={m.id}>
              <div className="grow">
                <b>{m.name}</b>
                <div className="small">
                  {materialKindLabel(m.kind)}
                  {m.created_at
                    ? ` · added ${formatSubmittedAt(m.created_at).split(',')[0] || ''}`
                    : ''}
                </div>
              </div>
              <Link className="btn small" to={`/app/student/study?doc=${encodeURIComponent(m.id)}`}>
                Ask the assistant
              </Link>
            </div>
          ))
        ) : (
          <EmptyState panel={false}>No material yet</EmptyState>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="crumb">
        <Link to="/app/student">Home</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/app/student/classes/${cls.id}`}>{cls.code}</Link>
      </div>
      <header className="cbanner" style={{ '--hue': hue }}>
        <div>
          <span className="small">
            {cls.code} · {cls.section || '—'} · {teacher}
          </span>
          <h1>{cls.name}</h1>
        </div>
      </header>
      <nav className="ctabs tabs" aria-label="Class sections">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={tab === k ? 'on' : ''}
            aria-current={tab === k ? 'page' : undefined}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </nav>
      {body}
    </>
  )
}
