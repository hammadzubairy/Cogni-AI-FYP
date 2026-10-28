import { isMcqQuestion } from '../../utils/teacher'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import ScoreBar from '../../components/ScoreBar'
import {
  attemptTotal,
  effectiveScore,
  examMaxMarks,
  formatTeacherName,
  reviseRef,
} from '../../utils/student'
import { pctColor } from '../../utils/status'

const R = 2 * Math.PI * 50
const LETTERS = 'ABCD'

function ScoreRing({ percent, total, max }) {
  const v = Math.max(0, Math.min(100, Number(percent) || 0))
  return (
    <svg width="124" height="124" viewBox="0 0 120 120" role="img" aria-label={`Score ${v} percent`}>
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        style={{ stroke: 'var(--color-muted)' }}
        strokeWidth="12"
      />
      <circle
        className="ring"
        cx="60"
        cy="60"
        r="50"
        fill="none"
        style={{ stroke: pctColor(v) }}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(R * v) / 100} ${R}`}
        transform="rotate(-90 60 60)"
      />
      <text
        x="60"
        y="60"
        textAnchor="middle"
        fontFamily="Source Serif 4,serif"
        fontWeight="800"
        fontSize="27"
        style={{ fill: 'var(--color-foreground)' }}
      >
        {v}%
      </text>
      <text
        x="60"
        y="79"
        textAnchor="middle"
        fontFamily="Source Serif 4,serif"
        fontSize="12"
        style={{ fill: 'var(--color-muted-foreground)' }}
      >
        {total} / {max}
      </text>
    </svg>
  )
}

function answerDisplay(q, value) {
  if (value == null || value === '') return <i>Not answered</i>
  if (isMcqQuestion(q)) {
    const opts = q.options || []
    const idx = Number(value)
    if (Number.isInteger(idx) && opts[idx] != null) {
      return `${LETTERS[idx]}. ${opts[idx]}`
    }
    return String(value)
  }
  return String(value)
}

export default function Feedback() {
  const { id } = useParams()
  const [fb, setFb] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [teacherName, setTeacherName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const feedback = await api.getAttemptFeedback(id)
      setFb(feedback)
      const at = await api.getAttempt(id)
      setAttempt(at)
      let x = null
      try {
        x = await api.getExam(at.exam_id)
        setExam(x)
      } catch {
        setExam(null)
      }
      if (x) {
        try {
          const c = await api.getClass(x.class_id)
          setCls(c)
        } catch {
          setCls(null)
        }
        setTeacherName(formatTeacherName())
      }
    } catch (err) {
      setError(err)
      setFb(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const strong = fb?.strongest_topics || []
  const weak = fb?.weakest_topics || []
  const topics = fb?.topics || []
  const blooms = fb?.bloom_levels || []
  const plan = fb?.study_plan || []
  const tips = fb?.tips || []

  const discuss = useMemo(() => {
    if (!attempt || !exam) return []
    return (exam.questions || [])
      .map((q, i) => [q, i])
      .filter(([q]) => attempt.flags?.[q.qid] === 'discuss')
  }, [attempt, exam])

  const percent = fb?.overall_percent ?? 0
  const total = attempt && exam ? attemptTotal(attempt, exam) : '—'
  const max = exam ? examMaxMarks(exam) : '—'

  if (loading) return <ShellLoading label="Loading feedback…" />
  if (error) {
    return (
      <ShellError
        message={error.message || 'Result not found.'}
        onRetry={load}
      />
    )
  }
  if (!fb) return <EmptyState>Result not found.</EmptyState>

  const crumb = cls ? (
    <>
      <Link to="/app/student">Home</Link> <span aria-hidden="true">/</span>{' '}
      <Link to={`/app/student/classes/${cls.id}`}>{cls.code}</Link>{' '}
      <span aria-hidden="true">/</span>{' '}
      <Link to={`/app/student/classes/${cls.id}?tab=results`}>Results</Link>
    </>
  ) : (
    <Link to="/app/student/results">Results</Link>
  )

  const headline = `${
    strong.length ? `Strong on ${strong.join(' and ')}.` : 'Solid effort.'
  } ${
    weak.length
      ? `${weak.join(' and ')} need${weak.length > 1 ? '' : 's'} work.`
      : 'No weak topics this time.'
  }`

  return (
    <>
      <PageTop crumb={crumb} title={`Feedback · ${fb.exam_title}`} />

      {discuss.length ? (
        <div className="callout">
          <Icon name="info" />
          <div>
            <b>
              {teacherName || 'Your teacher'} would like to discuss{' '}
              {discuss.map(([, i]) => `Q${i + 1}`).join(', ')} with you.
            </b>{' '}
            This is a conversation about how the answer was written. Your grade has not been
            changed.
          </div>
        </div>
      ) : null}

      <div className="panel panel-b">
        <div className="fb-hero">
          <ScoreRing percent={percent} total={total} max={max} />
          <div>
            <h3 style={{ fontSize: 20 }}>{headline}</h3>
            <p
              style={{
                color: 'var(--color-muted-foreground)',
                maxWidth: '62ch',
                margin: '6px 0 0',
              }}
            >
              You scored {percent}%.{' '}
              {weak.length
                ? 'Most of your lost marks came from the topics below. The study plan points you to the exact pages to revise.'
                : 'Keep practising to stay ahead of the next paper.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid g2e mt">
        <div className="panel">
          <div className="panel-h">
            <h3>By topic</h3>
          </div>
          <div className="panel-b">
            {topics.length ? (
              topics.map((t) => (
                <div className="topicrow" key={t.topic}>
                  <span>{t.topic}</span>
                  <ScoreBar value={t.percent} />
                  <b className="num">{t.percent}%</b>
                </div>
              ))
            ) : (
              <EmptyState panel={false}>No topic data</EmptyState>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h3>By Bloom level</h3>
          </div>
          <div className="panel-b">
            {blooms.length ? (
              blooms.map((b) => (
                <div className="topicrow" key={b.bloom}>
                  <span>{b.bloom}</span>
                  <ScoreBar value={b.percent} />
                  <b className="num">{b.percent}%</b>
                </div>
              ))
            ) : (
              <EmptyState panel={false}>No Bloom data</EmptyState>
            )}
          </div>
        </div>
      </div>

      <div className="grid g2e mt">
        <div className="panel">
          <div className="panel-h">
            <h3>What to study next</h3>
          </div>
          <div className="panel-b">
            {plan
              .filter((p) => weak.includes(p.topic))
              .map((item, n) => {
                const missed = item.missed_key_points || []
                return (
                  <div className="rec" key={item.topic}>
                    <b>
                      {n + 1}. {item.topic}
                    </b>
                    <p>
                      Re-read {reviseRef(item)}.
                      {missed.length
                        ? ` In your answers, add: ${missed.slice(0, 3).join('; ')}.`
                        : ' Review the MCQs you missed on this topic.'}
                    </p>
                  </div>
                )
              })}
            {strong.map((t) => (
              <div
                className="rec"
                key={`s-${t}`}
                style={{ borderColor: 'var(--color-success)' }}
              >
                <b>Keep it up: {t}</b>
                <p>You answered these questions well.</p>
              </div>
            ))}
            {tips.length ? (
              <div style={{ marginTop: 12 }}>
                {tips.map((t, i) => (
                  <p className="small" key={i} style={{ margin: '6px 0' }}>
                    <b>{t.topic}:</b> {t.tip}
                  </p>
                ))}
              </div>
            ) : null}
            <Link className="btn" to="/app/student/study" style={{ marginTop: 12 }}>
              Ask the study assistant
            </Link>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h3>Strengths and weaknesses</h3>
          </div>
          <div className="panel-b">
            <p className="small" style={{ marginTop: 0 }}>
              <b>Strongest:</b>{' '}
              {strong.length ? strong.join(', ') : '—'}
            </p>
            <p className="small">
              <b>Needs work:</b>{' '}
              {weak.length ? weak.join(', ') : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="panel mt">
        <div className="panel-h">
          <h3>Question breakdown</h3>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Q</th>
                <th>Topic</th>
                <th>Type</th>
                <th>Your answer</th>
                <th>Marks</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              {(exam?.questions || []).map((q, i) => {
                const r = attempt?.results?.[q.qid]
                const score = effectiveScore(attempt, q)
                const hit = r?.key_points_hit || []
                const miss = r?.key_points_missed || []
                const note = r?.reason || ''
                const overridden = attempt?.overrides?.[q.qid] != null
                return (
                  <tr key={q.qid}>
                    <td className="mono">Q{i + 1}</td>
                    <td>{q.topic}</td>
                    <td>{q.type}</td>
                    <td className="small">{answerDisplay(q, attempt?.answers?.[q.qid])}</td>
                    <td className="num">
                      <b style={{ color: pctColor((score / (q.marks || 1)) * 100) }}>
                        {score}/{q.marks}
                      </b>
                    </td>
                    <td className="small">
                      {note}
                      {hit.length ? ` Covered: ${hit.join('; ')}.` : ''}
                      {miss.length ? ` Missed: ${miss.join('; ')}.` : ''}
                      {overridden ? ' · adjusted by your teacher' : ''}
                    </td>
                  </tr>
                )
              })}
              {!exam?.questions?.length ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Question details unavailable for this exam.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
