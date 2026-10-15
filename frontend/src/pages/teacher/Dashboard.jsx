import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { ShellError, ShellLoading } from '../../components/AppShell'
import ClassCard from '../../components/teacher/ClassCard'
import { NewClassButton } from '../../components/teacher/NewClassModal'
import Pill from '../../components/Pill'
import { Icon } from '../../components/IconSprite'
import EmptyState from '../../components/EmptyState'
import { formatShortDate } from '../../utils/format'
import { greetingLine, todayLong } from '../../utils/teacher'

function buildItems(data, classById) {
  const items = []
  ;(data.returned_exams || []).forEach((x) => {
    items.push({
      t: `Revise ${x.title}`,
      s: `Returned by your HOD: ${x.hod_comment || 'See the comment on the paper.'}`,
      tag: ['Returned', 'p-bad'],
      btn: 'Revise paper',
      to: `/app/teacher/exams/${x.id}`,
    })
  })
  const flags = data.undecided_flags || 0
  if (flags) {
    items.push({
      t: `${flags} answer${flags > 1 ? 's' : ''} flagged as possibly AI-written`,
      s: `Review ${flags > 1 ? 'them' : 'it'} before you release results. Grades never change automatically.`,
      tag: ['AI flags', 'p-warn'],
      btn: 'Review flags',
      to: '/app/teacher/flags',
    })
  }
  ;(data.approved_exams || []).forEach((x) => {
    items.push({
      t: `Publish ${x.title}`,
      s: 'Approved by your HOD and ready for students',
      tag: ['Approved', 'p-good'],
      btn: 'Open paper',
      to: `/app/teacher/exams/${x.id}`,
    })
  })
  ;(data.open_requests || []).forEach((r) => {
    const c = classById.get(r.class_id)
    const code = c?.code || 'your class'
    items.push({
      t: `${r.kind} requested for ${code}`,
      s: `Due ${r.due}${r.note ? ` · ${r.note}` : ''}`,
      tag: ['Request', 'p-grey'],
      btn: 'Start paper',
      to: `/app/teacher/exams/new?req=${encodeURIComponent(r.id)}`,
    })
  })
  ;(data.draft_exams || []).forEach((x) => {
    items.push({
      t: `Finish draft: ${x.title}`,
      s: `${x.question_count} questions · not sent yet`,
      tag: ['AI draft', 'p-ai'],
      btn: 'Open draft',
      to: `/app/teacher/exams/${x.id}`,
    })
  })
  ;(data.recent_submissions || []).forEach((s) => {
    items.push({
      t: `${s.student_name} submitted ${s.exam_title}`,
      s: formatShortDate(s.submitted_at) || 'Recently',
      tag: ['Results', 'p-blue'],
      btn: 'View',
      to: `/app/teacher/attempts/${s.attempt_id}`,
    })
  })
  return items
}

function classNotes(cls, data) {
  const notes = []
  const cid = cls.id
  const flags = data.undecided_flags || 0
  // Flags are global; surface lightly on every card only when there are any — prefer exam-scoped notes
  ;(data.returned_exams || [])
    .filter((x) => x.class_id === cid)
    .forEach((x) => notes.push([`${x.title} returned`, 'p-bad']))
  ;(data.approved_exams || [])
    .filter((x) => x.class_id === cid)
    .forEach((x) => notes.push([`${x.title} approved`, 'p-good']))
  ;(data.draft_exams || [])
    .filter((x) => x.class_id === cid)
    .forEach((x) => notes.push([`${x.title} draft`, 'p-ai']))
  ;(data.open_requests || [])
    .filter((r) => r.class_id === cid)
    .forEach((r) => notes.push([`${r.kind} requested`, 'p-grey']))
  const subs = (data.recent_submissions || []).filter((s) => {
    const exam =
      [...(data.live_exams || []), ...(data.draft_exams || []), ...(data.returned_exams || []), ...(data.approved_exams || [])].find(
        (x) => x.id === s.exam_id,
      )
    return exam?.class_id === cid
  })
  if (subs.length) notes.push([`${subs.length} new submission${subs.length > 1 ? 's' : ''}`, 'p-blue'])
  if (flags && notes.length === 0) {
    /* keep card quiet unless class-specific */
  }
  return notes
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [matCounts, setMatCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dash = await api.getTeacherDashboard()
      setData(dash)
      const classes = dash.classes || []
      const counts = {}
      await Promise.all(
        classes.map(async (c) => {
          try {
            const mats = await api.listMaterials(c.id)
            counts[c.id] = mats.length
          } catch {
            counts[c.id] = 0
          }
        }),
      )
      setMatCounts(counts)
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

  const classById = useMemo(() => {
    const m = new Map()
    ;(data?.classes || []).forEach((c) => m.set(c.id, c))
    return m
  }, [data])

  const items = useMemo(() => (data ? buildItems(data, classById) : []), [data, classById])
  const [next, ...rest] = items

  if (loading) return <ShellLoading label="Loading dashboard…" />
  if (error) {
    return (
      <ShellError
        message={error.message || 'Could not load dashboard.'}
        onRetry={load}
      />
    )
  }

  const classes = data.classes || []
  const stats = data.stats || {}
  const drafts = data.draft_exams?.length ?? 0
  const live = stats.live_exams ?? data.live_exams?.length ?? 0

  return (
    <>
      <div className="fd-head">
        <span className="small">{todayLong().toUpperCase()}</span>
        <h1>{greetingLine(user?.name).toUpperCase()}</h1>
      </div>

      {next ? (
        <section className="nextbar" aria-labelledby="next-h">
          <div className="grow">
            <span className="eyebrow">
              Next up
              {rest.length ? ` · ${rest.length} more waiting` : ''}
            </span>
            <h2 id="next-h">{next.t}</h2>
            <p>{next.s}</p>
          </div>
          <button type="button" className="btn primary" onClick={() => navigate(next.to)}>
            {next.btn} <Icon name="arrow" className="sm" />
          </button>
        </section>
      ) : null}

      <div className="fd-cols" style={{ marginBottom: 'var(--space-2xl)' }}>
        <section aria-labelledby="needs-h">
          <h3 className="fd-sec" id="needs-h">
            Needs you
            {rest.length ? <span className="fd-count">{Math.min(rest.length, 5)}</span> : null}
          </h3>
          {rest.length ? (
            rest.slice(0, 5).map((it, i) => (
              <div className="need" key={i}>
                <div className="grow">
                  <b>{it.t}</b>
                  <span className="small">{it.s}</span>
                </div>
                {it.tag ? <Pill label={it.tag[0]} tone={it.tag[1]} /> : null}
                <button type="button" className="btn small" onClick={() => navigate(it.to)}>
                  {it.btn}
                </button>
              </div>
            ))
          ) : (
            <p className="fd-none">Nothing else is waiting on you.</p>
          )}
        </section>
        <section aria-labelledby="nums-h">
          <h3 className="fd-sec" id="nums-h">
            At a glance
          </h3>
          <div className="fd-num">
            <span>Live exams</span>
            <b className="num">{live}</b>
          </div>
          <div className="fd-num">
            <span>Drafts</span>
            <b className="num">{drafts}</b>
          </div>
          <div className="fd-num">
            <span>Waiting on HOD</span>
            <b className="num">{stats.waiting_on_hod ?? 0}</b>
          </div>
          <div className="fd-num">
            <span>Undecided flags</span>
            <b className="num">{data.undecided_flags ?? 0}</b>
          </div>
          <div className="fd-num">
            <span>Students</span>
            <b className="num">{stats.students ?? 0}</b>
          </div>
        </section>
      </div>

      <div className="sec-head">
        <h2>Your classes</h2>
        <NewClassButton className="btn" />
      </div>

      {classes.length ? (
        <div className="cgrid">
          {classes.map((c, i) => (
            <ClassCard
              key={c.id}
              cls={c}
              index={i}
              notes={classNotes(c, data)}
              materialCount={matCounts[c.id] ?? 0}
            />
          ))}
        </div>
      ) : (
        <EmptyState>No classes yet. Create one to start.</EmptyState>
      )}
    </>
  )
}
