import { Link } from 'react-router-dom'
import { Icon } from '../IconSprite'
import Pill from '../Pill'
import { useAuth } from '../../auth/AuthContext'
import { initials } from '../../utils/format'
import { classHue } from '../../utils/teacher'

/**
 * Google-Classroom style class card matching v7 `classCard`.
 * notes: array of [text, pillTone] e.g. [['1 AI flag', 'p-warn']]
 */
export default function ClassCard({ cls, index = 0, notes = [], examCount, materialCount, teacherName }) {
  const { user } = useAuth()
  const name = teacherName || (user?.id === cls.teacher_id ? user.name : 'Teacher')
  const students = cls.student_count ?? cls.student_ids?.length ?? 0
  const exams = examCount ?? cls.exam_count ?? 0
  const mats = materialCount ?? 0
  const shown = notes.slice(0, 3)
  const extra = notes.length - shown.length

  return (
    <article className="ccard">
      <Link
        to={`/app/teacher/classes/${cls.id}`}
        className="ccard-top"
        style={{ '--hue': classHue(index) }}
        aria-label={`Open ${cls.name}`}
      >
        <b>{cls.name}</b>
        <span>
          {cls.code} · {cls.section || '—'}
        </span>
        <span>{name}</span>
        <i className="av" aria-hidden="true">
          {initials(name)}
        </i>
      </Link>
      <div className="ccard-notes">
        {shown.length ? (
          shown.map(([t, k], i) => (
            <Pill key={i} label={t} tone={k} />
          ))
        ) : (
          <span className="small">Nothing new</span>
        )}
        {extra > 0 ? <span className="small">+{extra} more</span> : null}
      </div>
      <div className="ccard-foot">
        <Link to={`/app/teacher/classes/${cls.id}?tab=exams`} title="Exams">
          <Icon name="clock" className="sm" />
          {exams} exam{exams === 1 ? '' : 's'}
        </Link>
        <Link to={`/app/teacher/classes/${cls.id}?tab=material`} title="Material">
          <Icon name="upload" className="sm" />
          {mats} file{mats === 1 ? '' : 's'}
        </Link>
        <Link to={`/app/teacher/classes/${cls.id}?tab=students`} title="Students">
          <Icon name="swap" className="sm" />
          {students} student{students === 1 ? '' : 's'}
        </Link>
      </div>
    </article>
  )
}
