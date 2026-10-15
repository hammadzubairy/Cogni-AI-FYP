import { Link } from 'react-router-dom'
import { Icon } from '../IconSprite'
import Pill from '../Pill'
import { initials } from '../../utils/format'
import { classHue, formatTeacherName } from '../../utils/student'

/**
 * Student class card matching v7 `classCard` (no students foot link).
 * notes: array of [text, pillTone]
 */
export default function ClassCard({
  cls,
  index = 0,
  notes = [],
  examCount,
  materialCount,
  teacherName,
}) {
  const name = formatTeacherName(teacherName)
  const exams = examCount ?? cls.exam_count ?? 0
  const mats = materialCount ?? 0
  const shown = notes.slice(0, 3)
  const extra = notes.length - shown.length
  const base = `/app/student/classes/${cls.id}`

  return (
    <article className="ccard">
      <Link
        to={base}
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
          shown.map(([t, k], i) => <Pill key={i} label={t} tone={k} />)
        ) : (
          <span className="small">Nothing new</span>
        )}
        {extra > 0 ? <span className="small">+{extra} more</span> : null}
      </div>
      <div className="ccard-foot">
        <Link to={`${base}?tab=exams`} title="Exams">
          <Icon name="clock" className="sm" />
          {exams} exam{exams === 1 ? '' : 's'}
        </Link>
        <Link to={`${base}?tab=material`} title="Material">
          <Icon name="upload" className="sm" />
          {mats} file{mats === 1 ? '' : 's'}
        </Link>
      </div>
    </article>
  )
}
