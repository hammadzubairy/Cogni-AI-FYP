import { useEffect, useRef, useState } from 'react'
import BloomTag from './BloomTag'
import Field from './Field'
import Pill from './Pill'
import Spinner from './Spinner'
import { Icon } from './IconSprite'

const BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']

function AiChip({ children = 'AI draft' }) {
  return (
    <span className="chip-ai">
      <Icon name="spark" />
      {children}
    </span>
  )
}

function HumanChip({ children = 'Edited by teacher' }) {
  return (
    <span className="chip-human">
      <Icon name="check" />
      {children}
    </span>
  )
}

function sourceLabel(q) {
  const page = q.source_page ?? q.sourcePage
  const heading = q.source_heading ?? q.sourceHeading
  if (page == null && !heading) return null
  if (page != null && heading) return `p. ${page} · ${heading}`
  if (page != null) return `p. ${page}`
  return heading
}

function keywordLabels(q) {
  const kws = q.keywords || []
  return kws
    .map((k) => (typeof k === 'string' ? k : k?.label))
    .filter(Boolean)
}

/**
 * Question card matching v7 `qCard` — view + edit mode.
 */
export default function QuestionCard({
  question,
  index = 0,
  editable = false,
  editing = false,
  regenerating = false,
  humanEdited = false,
  repeats = false,
  onEdit,
  onCancel,
  onSave,
  onRegen,
  onDelete,
}) {
  const q = question || {}
  const type = q.type || 'MCQ'
  const marks = q.marks ?? 0
  const text = q.text || ''
  const opts = q.options || q.opts || []
  const ans = q.answer_index ?? q.ans
  const model = q.model_answer ?? q.model ?? ''
  const bloom = q.bloom
  const topic = q.topic || ''
  const clo = q.clo || ''
  const qid = q.qid || q.id || String(index)
  const human = humanEdited
  const srcLine = sourceLabel(q)
  const kws = keywordLabels(q)

  const [draftText, setDraftText] = useState(text)
  const [draftOpts, setDraftOpts] = useState(() =>
    type === 'MCQ' ? [...(opts.length === 4 ? opts : ['', '', '', ''])] : [],
  )
  const [draftAns, setDraftAns] = useState(typeof ans === 'number' ? ans : 0)
  const [draftModel, setDraftModel] = useState(model)
  const [draftBloom, setDraftBloom] = useState(bloom || 'Remember')
  const [draftMarks, setDraftMarks] = useState(marks)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const textRef = useRef(null)

  useEffect(() => {
    if (!editing) return
    setDraftText(text)
    setDraftOpts(type === 'MCQ' ? [...(opts.length === 4 ? opts : ['', '', '', ''])] : [])
    setDraftAns(typeof ans === 'number' ? ans : 0)
    setDraftModel(model)
    setDraftBloom(bloom || 'Remember')
    setDraftMarks(marks)
    setFieldErrors({})
    setSaving(false)
    requestAnimationFrame(() => textRef.current?.focus())
  }, [editing, qid]) // eslint-disable-line react-hooks/exhaustive-deps

  const tags = (
    <div className="qtags">
      <span className="mono" style={{ color: 'var(--color-muted-foreground)' }}>
        Q{index + 1}
      </span>
      {human ? <HumanChip /> : <AiChip />}
      <Pill tone="p-grey">
        {type} · {marks} marks
      </Pill>
      <BloomTag level={bloom} />
      <span className="small">
        {topic}
        {clo ? ` · ${clo}` : ''}
      </span>
    </div>
  )

  async function handleSave() {
    const next = {}
    const errs = {}
    const t = String(draftText || '').trim()
    if (!t) errs.text = "The question can't be empty"
    const m = Number(draftMarks)
    if (!(m >= 0.5 && m <= 100)) errs.marks = 'Marks must be between 0.5 and 100'
    if (Object.keys(errs).length) {
      setFieldErrors(errs)
      return
    }
    next.text = t
    next.bloom = draftBloom
    next.marks = m
    if (type === 'MCQ') {
      next.options = draftOpts.map((o, i) => String(o || '').trim() || opts[i] || `Option ${'ABCD'[i]}`)
      next.answer_index = Number(draftAns)
    } else {
      next.model_answer = String(draftModel || '').trim()
    }
    setSaving(true)
    setFieldErrors({})
    try {
      await onSave?.(qid, next)
    } finally {
      setSaving(false)
    }
  }

  if (editable && editing) {
    return (
      <div
        className="qcard editing"
        id={`qc-${qid}`}
        role="group"
        aria-label={`Editing question ${index + 1}`}
      >
        <div className="qtop">
          {tags}
          <span className="small" style={{ color: 'var(--color-ring)', fontWeight: 600 }}>
            Editing
          </span>
        </div>
        <Field id={`e-text-${qid}`} label="Question" error={fieldErrors.text}>
          <textarea
            id={`e-text-${qid}`}
            ref={textRef}
            rows={3}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            disabled={saving}
          />
        </Field>
        {type === 'MCQ' ? (
          <>
            <div className="grid g2e">
              {draftOpts.map((o, k) => (
                <Field key={k} id={`e-o${k}-${qid}`} label={`Option ${'ABCD'[k]}`}>
                  <input
                    id={`e-o${k}-${qid}`}
                    value={o}
                    onChange={(e) => {
                      const next = [...draftOpts]
                      next[k] = e.target.value
                      setDraftOpts(next)
                    }}
                    disabled={saving}
                  />
                </Field>
              ))}
            </div>
            <Field id={`e-ans-${qid}`} label="Correct option">
              <select
                id={`e-ans-${qid}`}
                value={draftAns}
                onChange={(e) => setDraftAns(Number(e.target.value))}
                disabled={saving}
              >
                {draftOpts.map((_, k) => (
                  <option key={k} value={k}>
                    {'ABCD'[k]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Field
            id={`e-model-${qid}`}
            label="Model answer"
            hint="Used to grade students' written answers."
          >
            <textarea
              id={`e-model-${qid}`}
              rows={3}
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              disabled={saving}
            />
          </Field>
        )}
        <div className="grid g2e">
          <Field id={`e-bloom-${qid}`} label="Bloom level">
            <select
              id={`e-bloom-${qid}`}
              value={draftBloom}
              onChange={(e) => setDraftBloom(e.target.value)}
              disabled={saving}
            >
              {BLOOM_LEVELS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`e-marks-${qid}`} label="Marks" error={fieldErrors.marks}>
            <input
              id={`e-marks-${qid}`}
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={draftMarks}
              onChange={(e) => setDraftMarks(e.target.value)}
              disabled={saving}
            />
          </Field>
        </div>
        <div className="row">
          <button
            type="button"
            className={`btn primary small${saving ? ' busy' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            Save question
          </button>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => onCancel?.(qid)}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`qcard ${human ? 'human-card' : 'ai-card'}${regenerating ? ' busy' : ''}`}
      id={`qc-${qid}`}
      aria-busy={regenerating || undefined}
    >
      <div className="qtop">
        {tags}
        {editable && !regenerating ? (
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onEdit?.(qid)}
              aria-label={`Edit question ${index + 1}`}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onRegen?.(qid)}
              aria-label={`Regenerate question ${index + 1}`}
            >
              Regenerate
            </button>
            <span className="vsep" aria-hidden="true" />
            <button
              type="button"
              className="btn small ghost icon"
              style={{ color: 'var(--color-destructive)' }}
              onClick={() => onDelete?.(qid, index)}
              aria-label={`Remove question ${index + 1}`}
              title="Remove question"
            >
              <Icon name="trash" className="sm" />
            </button>
          </div>
        ) : null}
        {regenerating ? <Spinner inline label="Regenerating…" /> : null}
      </div>
      <div className="qtext">{text}</div>
      {type === 'MCQ' ? (
        <ul className="opts">
          {opts.map((o, k) => (
            <li key={k} className={k === ans ? 'ans' : ''}>
              <span>
                <span className="mono">{'ABCD'[k]}.</span> {o}
              </span>
              {k === ans ? (
                <span className="ok">
                  <Icon name="check" className="sm" />
                  Correct
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="model">
          <b style={{ color: 'var(--color-muted-foreground)' }}>Model answer:</b> {model}
        </div>
      )}
      {kws.length || srcLine ? (
        <div className="small" style={{ display: 'grid', gap: 4 }}>
          {kws.length ? (
            <span>
              <b style={{ color: 'var(--color-muted-foreground)' }}>Keywords:</b> {kws.join('; ')}
            </span>
          ) : null}
          {srcLine ? (
            <span className="src" style={{ display: 'inline' }}>
              Source: {srcLine}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="checks" aria-label="Automatic checks">
        <span className="ck">Answerable from source</span>
        {type === 'MCQ' ? (
          <span className="ck">Distractors verified wrong</span>
        ) : (
          <span className="ck">Model answer set</span>
        )}
        <span className="ck">Bloom level confirmed</span>
        {repeats ? (
          <span className="ck w">Used in an earlier paper for this class</span>
        ) : (
          <span className="ck">Not repeated</span>
        )}
      </div>
    </div>
  )
}
