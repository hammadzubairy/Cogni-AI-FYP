import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import Pill from '../../components/Pill'
import { useConfirm } from '../../components/ConfirmModal'
import { useToast } from '../../components/Toast'
import { classHue, copyText } from '../../utils/teacher'
import Exams from './Exams'
import Materials from './Materials'

const TABS = [
  ['overview', 'Overview'],
  ['exams', 'Exams'],
  ['material', 'Material'],
  ['students', 'Students'],
  ['insights', 'Insights'],
]

export default function ClassDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()

  const [cls, setCls] = useState(null)
  const [exams, setExams] = useState([])
  const [materials, setMaterials] = useState([])
  const [directory, setDirectory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addEmail, setAddEmail] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [classIndex, setClassIndex] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, xs, mats, allClasses] = await Promise.all([
        api.getClass(id),
        api.listExams({ class_id: id }),
        api.listMaterials(id),
        api.listClasses().catch(() => []),
      ])
      setCls(c)
      setExams(xs)
      setMaterials(mats)
      const dir = {}
      ;(c.students || []).forEach((s) => {
        dir[s.id] = { name: s.name, email: s.email }
      })
      setDirectory(dir)
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

  const notes = useMemo(() => {
    if (!cls) return []
    const n = []
    exams
      .filter((x) => x.status === 'returned')
      .forEach((x) => n.push([`${x.title} returned`, 'p-bad']))
    exams
      .filter((x) => x.status === 'approved')
      .forEach((x) => n.push([`${x.title} approved`, 'p-good']))
    exams
      .filter((x) => x.status === 'pending')
      .forEach((x) => n.push([`${x.title} with HOD`, 'p-progress']))
    return n
  }, [cls, exams])

  async function onCopyJoin() {
    const ok = await copyText(cls.join_code)
    // Success: silent copy (no toast). Only surface failures.
    if (!ok) {
      toast('Could not copy. Select the code and copy manually.', { type: 'error' })
    }
  }

  async function onAddStudent() {
    const em = addEmail.trim().toLowerCase()
    if (!em) {
      setAddError("Enter the student's email address")
      return
    }
    setAdding(true)
    setAddError('')
    try {
      const before = new Set(cls.student_ids || [])
      const updated = await api.addClassStudent(id, em)
      const addedId = (updated.student_ids || []).find((s) => !before.has(s))
      if (addedId) {
        setDirectory((d) => ({
          ...d,
          [addedId]: { name: em.split('@')[0], email: em },
        }))
      }
      setCls(updated)
      setAddEmail('')
      toast('Student added to ' + updated.code)
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not add student.')
    } finally {
      setAdding(false)
    }
  }

  async function onRemoveStudent(studentId) {
    const info = directory[studentId]
    const label = info?.name || 'this student'
    const ok = await confirm({
      title: `Remove ${label} from ${cls.code}?`,
      body: "They lose access to this class's exams and material, and are notified. Their past submissions are kept.",
      ok: 'Remove student',
      tone: 'bad',
    })
    if (!ok) return
    try {
      await api.removeClassStudent(id, studentId)
      setCls((c) => ({
        ...c,
        student_ids: (c.student_ids || []).filter((s) => s !== studentId),
        student_count: Math.max(0, (c.student_count || 1) - 1),
      }))
      toast(`${label} removed from ${cls.code}`)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove student.', { type: 'error' })
    }
  }

  if (loading) return <ShellLoading label="Loading class…" />
  if (error) {
    return (
      <ShellError
        message={error.message || 'Class not found.'}
        onRetry={load}
      />
    )
  }
  if (!cls) return <EmptyState>Class not found.</EmptyState>

  const live = exams.filter((x) => x.status === 'published').length
  const draft = exams.filter((x) => x.status === 'draft').length
  const pending = exams.filter((x) => x.status === 'pending').length
  const students = cls.student_ids || []
  const hue = classHue(classIndex)

  let body = null
  if (tab === 'overview') {
    body = (
      <>
        {notes.length ? (
          <div className="cnotes">
            {notes.map(([t, k], i) => (
              <Pill key={i} label={t} tone={k} />
            ))}
          </div>
        ) : null}
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
            <b className="scard-n">{exams.length}</b>
            <p className="small">
              {live} live · {draft} draft · {pending} with HOD
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
            <p className="small">
              {materials.length
                ? `Latest: ${materials[0].name}`
                : 'Upload notes to generate exams'}
            </p>
            <button
              type="button"
              className="btn small"
              onClick={(e) => {
                e.stopPropagation()
                setTab('material')
              }}
            >
              <Icon name="upload" className="sm" />
              Upload
            </button>
          </article>
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('students')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('students')
              }
            }}
          >
            <h3>Students</h3>
            <b className="scard-n">{students.length}</b>
            <p className="small">Share the join code to enrol</p>
          </article>
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('insights')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('insights')
              }
            }}
          >
            <h3>Insights</h3>
            <b className="scard-n">—</b>
            <p className="small">Appears after the first results</p>
          </article>
        </div>
      </>
    )
  } else if (tab === 'exams') {
    body = <Exams embedded classId={id} classCode={cls.code} />
  } else if (tab === 'material') {
    body = <Materials embedded classId={id} />
  } else if (tab === 'students') {
    body = (
      <div className="panel">
        <div className="panel-h">
          <h3>Students ({students.length})</h3>
          <button type="button" className="btn small" onClick={onCopyJoin}>
            Copy join code
          </button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Exams taken</th>
                <th>Average</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.length ? (
                students.map((sid) => {
                  const info = directory[sid]
                  const name = info?.name || 'Student'
                  const email = info?.email || '—'
                  return (
                    <tr key={sid}>
                      <td>
                        <b>{name}</b>
                      </td>
                      <td className="small">{email}</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                      <td>
                        <button
                          type="button"
                          className="btn small bad"
                          onClick={() => onRemoveStudent(sid)}
                          aria-label={`Remove ${name} from ${cls.code}`}
                        >
                          Remove…
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="empty">
                    No students yet. Add one below or share the join code.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel-b" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field id="add-email" label="Add a student by email" error={addError}>
              <input
                id="add-email"
                type="email"
                placeholder="name@school.edu"
                value={addEmail}
                disabled={adding}
                onChange={(e) => setAddEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAddStudent()
                }}
              />
            </Field>
            <button
              type="button"
              className={`btn${adding ? ' busy' : ''}`}
              onClick={onAddStudent}
              disabled={adding}
            >
              <Icon name="plus" className="sm" />
              Add student
            </button>
          </div>
          <p className="small" style={{ margin: '8px 0 0' }}>
            Share join code <span className="chip">{cls.join_code}</span> with students so they can
            join this class.
          </p>
        </div>
      </div>
    )
  } else if (tab === 'insights') {
    body = (
      <div className="grid g2e">
        <div className="panel">
          <div className="panel-h">
            <h3>Course learning outcomes</h3>
          </div>
          <div className="panel-b topics">
            {(cls.clos || []).length ? (
              cls.clos.map((x) => (
                <span className="topic" key={x}>
                  {x}
                </span>
              ))
            ) : (
              <div className="empty">No CLOs set for this class.</div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h">
            <h3>Class by topic</h3>
          </div>
          <div className="panel-b">
            <div className="empty">No results yet</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="crumb">
        <Link to="/app/teacher">Home</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/app/teacher/classes/${cls.id}`}>{cls.code}</Link>
      </div>
      <header className="cbanner" style={{ '--hue': hue }}>
        <div>
          <span className="small">
            {cls.code} · {cls.section || '—'} · {user?.name}
          </span>
          <h1>{cls.name}</h1>
        </div>
        <div className="cjoin">
          <span className="small">Join code</span>
          <b className="mono">{cls.join_code}</b>
          <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={onCopyJoin}>
            Copy
          </button>
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
