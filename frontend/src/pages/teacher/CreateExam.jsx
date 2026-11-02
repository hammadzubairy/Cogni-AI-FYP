import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import PipelineSteps from '../../components/PipelineSteps'
import { useToast } from '../../components/Toast'
import {
  defaultDuration,
  defaultExamTitle,
  defaultQuestionTypes,
  GENERATE_PIPE_STEPS,
  newWrittenQuestionType,
  QUESTION_CAP,
} from '../../utils/teacher'

function Stepper({ step = 1 }) {
  return (
    <ol className="stepper" aria-label="Create exam progress">
      <li className={step === 1 ? 'cur' : step > 1 ? 'done' : ''} aria-current={step === 1 ? 'step' : undefined}>
        <span className="n">{step > 1 ? <Icon name="check" className="sm" /> : 1}</span>
        Generate draft
        <span className="sr-only">{step > 1 ? ' (done)' : ' (current step)'}</span>
      </li>
      <li aria-hidden="true">
        <span className={`ln ${step > 1 ? 'done' : ''}`} />
      </li>
      <li className={step === 2 ? 'cur' : ''}>
        <span className="n">2</span>
        Review and send
      </li>
    </ol>
  )
}

function pagesFromChunks(chunks) {
  const map = new Map()
  for (const c of chunks || []) {
    const p = c.page
    let lo = null
    let hi = null
    if (typeof p === 'number' && p >= 1) {
      lo = hi = p
    } else if (typeof p === 'string' && p.trim()) {
      const s = p.trim()
      if (s.includes('-')) {
        const [a, b] = s.split('-')
        const n1 = Number(a)
        const n2 = Number(b)
        if (n1 >= 1 && n2 >= 1) {
          lo = Math.min(n1, n2)
          hi = Math.max(n1, n2)
        }
      } else {
        const n = Number(s)
        if (n >= 1) lo = hi = n
      }
    }
    if (lo == null) continue
    for (let n = lo; n <= hi; n++) {
      if (!map.has(n)) map.set(n, { page: n, heading: c.heading || '' })
      else if (c.heading && !map.get(n).heading) map.get(n).heading = c.heading
    }
  }
  return [...map.values()].sort((a, b) => a.page - b.page)
}

function newWeightRow(materialId, pageFrom = 1, pageTo = 1, weightPct = 50) {
  return {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    material_id: materialId,
    page_from: pageFrom,
    page_to: pageTo,
    weight_pct: weightPct,
  }
}

function newPinRow(materialId, typeLabel = 'Long', count = 1, page = 1) {
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    material_id: materialId,
    type_label: typeLabel,
    count,
    page_from: page,
    page_to: page,
  }
}

export default function CreateExam() {
  const [searchParams] = useSearchParams()
  const reqId = searchParams.get('req') || ''
  const prefillClass = searchParams.get('cls') || searchParams.get('class') || ''
  const navigate = useNavigate()
  const toast = useToast()

  const [classes, setClasses] = useState([])
  const [materials, setMaterials] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [classId, setClassId] = useState('')
  const [materialIds, setMaterialIds] = useState([])
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('Quiz')
  const [duration, setDuration] = useState(20)
  const [qTypes, setQTypes] = useState(() => defaultQuestionTypes('Quiz'))
  const [marksMode, setMarksMode] = useState('suggested')
  const [totalMarks, setTotalMarks] = useState(50)
  const [linkedReq, setLinkedReq] = useState(reqId || '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [warnings, setWarnings] = useState([])
  const [llmFailed, setLlmFailed] = useState(null)
  const [llmNote, setLlmNote] = useState('')
  const [pipePromise, setPipePromise] = useState(null)
  const [busy, setBusy] = useState(false)
  const [titleTouched, setTitleTouched] = useState(false)
  const [blueprintOn, setBlueprintOn] = useState(false)
  const [outlines, setOutlines] = useState({}) // materialId -> [{page, heading}]
  const [weightRows, setWeightRows] = useState([])
  const [pinRows, setPinRows] = useState([])
  const [outlineBusy, setOutlineBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cls, reqs, llm] = await Promise.all([
        api.listClasses(),
        api.listRequests().catch(() => []),
        api.getMyLlmSettings().catch(() => null),
      ])
      setClasses(cls)
      setRequests(reqs || [])
      if (llm?.using_platform) {
        setLlmNote('Using the platform LLM (VyceAI Claude). You can add your own key in Settings.')
      } else if (llm?.provider) {
        setLlmNote(
          `Using your ${llm.provider} key${llm.model ? ` · ${llm.model}` : ''}. Change this in Settings.`,
        )
      } else {
        setLlmNote('')
      }

      let initialClass = prefillClass
      let initialKind = 'Quiz'
      let initialReq = reqId

      if (reqId) {
        const r = (reqs || []).find((q) => q.id === reqId)
        if (r) {
          initialClass = r.class_id
          initialKind = r.kind
          initialReq = r.id
        }
      }
      if (!initialClass && cls[0]) initialClass = cls[0].id

      setClassId(initialClass || '')
      setKind(initialKind)
      setDuration(defaultDuration(initialKind))
      setQTypes(defaultQuestionTypes(initialKind))
      setLinkedReq(initialReq || '')

      if (initialClass) {
        const mats = await api.listMaterials(initialClass)
        setMaterials(mats)
        setMaterialIds(mats.length ? [mats[0].id] : [])
        const c = cls.find((x) => x.id === initialClass)
        const quizN = 1
        setTitle(defaultExamTitle(initialKind, c?.name || 'Exam', quizN))
      }
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [prefillClass, reqId])

  useEffect(() => {
    load()
  }, [load])

  const activeClass = useMemo(
    () => classes.find((c) => c.id === classId) || null,
    [classes, classId],
  )

  const linkedRequest = useMemo(
    () => requests.find((r) => r.id === linkedReq) || null,
    [requests, linkedReq],
  )

  const openReqsForClass = useMemo(
    () =>
      requests.filter(
        (r) => r.class_id === classId && r.status === 'open' && (!r.exam_id || r.exam_id === null),
      ),
    [requests, classId],
  )

  const totalQ = qTypes.reduce((s, t) => s + (Number(t.count) || 0), 0)
  const suggestedTotal = qTypes.reduce(
    (s, t) => s + (Number(t.count) || 0) * (Number(t.marks) || 0),
    0,
  )

  useEffect(() => {
    let cancelled = false
    async function loadOutlines() {
      if (!materialIds.length) {
        setOutlines({})
        return
      }
      setOutlineBusy(true)
      try {
        const entries = await Promise.all(
          materialIds.map(async (id) => {
            try {
              const detail = await api.getMaterial(id)
              return [id, pagesFromChunks(detail.chunks || [])]
            } catch {
              return [id, []]
            }
          }),
        )
        if (!cancelled) setOutlines(Object.fromEntries(entries))
      } finally {
        if (!cancelled) setOutlineBusy(false)
      }
    }
    loadOutlines()
    return () => {
      cancelled = true
    }
  }, [materialIds])

  const weightSum = weightRows.reduce((s, r) => s + (Number(r.weight_pct) || 0), 0)

  function updateQType(id, patch) {
    setQTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function addQType() {
    setQTypes((prev) => [...prev, newWrittenQuestionType(prev.length + 1)])
  }

  function removeQType(id) {
    setQTypes((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.id !== id)))
  }

  async function onClassChange(id) {
    setClassId(id)
    setWarnings([])
    setLlmFailed(null)
    try {
      const mats = await api.listMaterials(id)
      setMaterials(mats)
      setMaterialIds(mats.length ? [mats[0].id] : [])
      const c = classes.find((x) => x.id === id)
      if (!titleTouched) {
        setTitle(defaultExamTitle(kind, c?.name || 'Exam', 1))
      }
    } catch {
      setMaterials([])
      setMaterialIds([])
    }
  }

  function onKindChange(k) {
    setKind(k)
    setDuration(defaultDuration(k))
    setQTypes(defaultQuestionTypes(k))
    if (!titleTouched && activeClass) {
      setTitle(defaultExamTitle(k, activeClass.name, 1))
    }
  }

  function toggleMaterial(id) {
    setMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function enableBlueprintDefaults() {
    const mid = materialIds[0]
    if (!mid) return
    const pages = outlines[mid] || []
    const maxP = pages.length ? pages[pages.length - 1].page : 10
    const midCut = Math.max(1, Math.floor(maxP * 0.4))
    setWeightRows([
      newWeightRow(mid, 1, midCut, 30),
      newWeightRow(mid, Math.min(midCut + 1, maxP), maxP, 70),
    ])
    const longLabel =
      qTypes.find((t) => /long|essay/i.test(t.label))?.label || qTypes[qTypes.length - 1]?.label || 'Long'
    setPinRows([newPinRow(mid, longLabel, 1, Math.min(maxP, midCut + 1))])
  }

  function validate() {
    const errs = {}
    if (!classId) errs.class = 'Choose a class'
    if (!materialIds.length) errs.materials = 'Select at least one material'
    if (!(Number(duration) >= 5)) errs.duration = 'Set a time limit of at least 5 minutes'
    if (totalQ < 1) errs.types = 'Choose at least one question of any type'
    if (totalQ > QUESTION_CAP) errs.types = `Total questions cannot exceed ${QUESTION_CAP}`
    const labels = qTypes.map((t) => String(t.label || '').trim().toLowerCase()).filter(Boolean)
    if (labels.length !== qTypes.length) errs.types = 'Every question type needs a name'
    if (new Set(labels).size !== labels.length) errs.types = 'Question type names must be unique'
    if (!title.trim()) errs.title = 'Enter a title'
    if (marksMode === 'total') {
      const t = Number(totalMarks)
      if (!(t > 0)) errs.marks = 'Enter the total marks for the paper'
      else if (t > 1000) errs.marks = 'Total marks cannot exceed 1000'
      else if (t < totalQ * 0.5) errs.marks = `Total marks must be at least ${totalQ * 0.5} for ${totalQ} questions`
    } else {
      for (const t of qTypes) {
        const n = Number(t.marks)
        if (!(n >= 0.5 && n <= 100)) errs.marks = 'Marks per question must be between 0.5 and 100'
      }
    }
    if (blueprintOn) {
      if (!weightRows.length && !pinRows.length) {
        errs.blueprint = 'Add weightage ranges and/or pin rules, or turn blueprint off'
      }
      if (weightRows.length) {
        const sum = weightRows.reduce((s, r) => s + (Number(r.weight_pct) || 0), 0)
        if (Math.abs(sum - 100) > 0.5) errs.blueprint = 'Weightage percentages must add up to 100'
        for (const r of weightRows) {
          if (!materialIds.includes(r.material_id)) errs.blueprint = 'Weightage must use a selected material'
          if (!(Number(r.page_from) >= 1) || Number(r.page_from) > Number(r.page_to)) {
            errs.blueprint = 'Each weightage range needs page from ≤ page to'
          }
        }
      }
      const pinned = {}
      for (const p of pinRows) {
        if (!materialIds.includes(p.material_id)) errs.blueprint = 'Pin must use a selected material'
        if (!(Number(p.count) >= 1)) errs.blueprint = 'Each pin needs a count of at least 1'
        if (!(Number(p.page_from) >= 1) || Number(p.page_from) > Number(p.page_to)) {
          errs.blueprint = 'Each pin needs page from ≤ page to'
        }
        const lab = String(p.type_label || '').trim()
        if (!qTypes.some((t) => t.label === lab)) errs.blueprint = 'Pin type must match a question type name'
        pinned[lab] = (pinned[lab] || 0) + (Number(p.count) || 0)
      }
      for (const t of qTypes) {
        if ((pinned[t.label] || 0) > (Number(t.count) || 0)) {
          errs.blueprint = `Pinned ${t.label} questions exceed the total count`
        }
      }
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function startGenerate() {
    if (busy) return
    if (!validate()) return
    setWarnings([])
    setLlmFailed(null)
    const body = {
      class_id: classId,
      title: title.trim(),
      kind,
      duration_min: Number(duration),
      material_ids: materialIds,
      types: qTypes.map((t) => ({
        label: String(t.label || '').trim().slice(0, 40),
        count: Number(t.count) || 0,
        format: t.format === 'mcq' ? 'mcq' : 'written',
        marks: Number(t.marks) || 5,
      })),
      marks_mode: marksMode,
    }
    if (marksMode === 'total') {
      body.total_marks = Number(totalMarks)
    }
    if (linkedReq) body.request_id = linkedReq
    if (blueprintOn) {
      if (weightRows.length) {
        body.weightage = weightRows.map((r) => ({
          material_id: r.material_id,
          page_from: Number(r.page_from),
          page_to: Number(r.page_to),
          weight_pct: Number(r.weight_pct),
        }))
      }
      if (pinRows.length) {
        body.pins = pinRows.map((p) => ({
          material_id: p.material_id,
          page_from: Number(p.page_from),
          page_to: Number(p.page_to),
          type_label: String(p.type_label || '').trim(),
          count: Number(p.count) || 1,
        }))
      }
    }
    setBusy(true)
    setPipePromise(api.generateExam(body))
  }

  function onPipeDone(result) {
    setBusy(false)
    setPipePromise(null)
    const exam = result?.exam
    const warns = result?.warnings || []
    if (warns.length) setWarnings(warns)
    toast('Draft ready. Review each question before sending.')
    if (exam?.id) {
      navigate(`/app/teacher/exams/${exam.id}`, { state: { warnings: warns } })
    }
  }

  function onPipeError(err) {
    setBusy(false)
    setPipePromise(null)
    const raw = err instanceof ApiError ? err.message : 'Generation failed.'
    const code = err instanceof ApiError ? err.code : ''
    const status = err instanceof ApiError ? err.status : 0
    // Friendly copy for known LLM / size failures — hide provider jargon.
    let msg = raw
    const lower = String(raw).toLowerCase()
    const isSizeOrBusy =
      status === 413 ||
      code === 'RATE_LIMIT' ||
      /rate.?limit/i.test(code || '') ||
      lower.includes('too large') ||
      lower.includes('413') ||
      lower.includes('itpm') ||
      lower.includes('rate_limit')
    const isProviderNoise =
      lower.includes("{'error'") || lower.includes('{"error"')
    const isModelFail =
      code === 'LLM_FAILED' ||
      lower.includes('invalid json') ||
      lower.includes('empty response') ||
      lower.includes('could not generate') ||
      lower.includes('could not finish')
    if (isSizeOrBusy || isProviderNoise) {
      msg =
        'The AI could not finish this draft — the material may be too large for one pass, or the service was busy. Try fewer source files or a shorter document, then press Retry.'
    } else if (isModelFail) {
      msg = "This model could not generate the paper. Please retry with another model, or try again."
    } else if (msg.length > 220) {
      msg = `${msg.slice(0, 200).trim()}…`
    }
    setLlmFailed(msg)
    setFieldErrors({ materials: msg })
  }

  if (loading) return <ShellLoading label="Loading…" />
  if (error) {
    return <ShellError message={error.message || 'Could not load create form.'} onRetry={load} />
  }
  if (!classes.length) {
    return (
      <>
        <PageTop title="Create exam" />
        <EmptyState>Create a class first.</EmptyState>
      </>
    )
  }

  return (
    <>
      <PageTop
        crumb={
          activeClass ? (
            <>
              <Link to="/app/teacher">Home</Link> <span aria-hidden="true">/</span>{' '}
              <Link to={`/app/teacher/classes/${activeClass.id}`}>{activeClass.code}</Link>{' '}
              <span aria-hidden="true">/</span>{' '}
              <Link to={`/app/teacher/classes/${activeClass.id}?tab=exams`}>Exams</Link>
            </>
          ) : null
        }
        title="Generate a draft paper"
      />
      <Stepper step={1} />

      {llmNote ? (
        <p className="small" style={{ margin: '0 0 12px', color: 'var(--color-muted-foreground)' }}>
          {llmNote}{' '}
          <Link to="/app/teacher/settings">Open Settings</Link>
        </p>
      ) : null}

      {!materials.length ? (
        <div className="callout red">
          <Icon name="alert" />
          <div>
            <b>{activeClass?.code || 'This class'} has no course material yet.</b> Questions are
            generated from material, so upload some first.
            <div style={{ marginTop: 8 }}>
              <Link
                className="btn small"
                to={
                  activeClass
                    ? `/app/teacher/classes/${activeClass.id}?tab=material`
                    : '/app/teacher/materials'
                }
              >
                <Icon name="upload" className="sm" />
                Upload material
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {linkedRequest ? (
        <div className="callout">
          <Icon name="info" />
          <div>
            <b>Requested {linkedRequest.kind}</b> for {activeClass?.code || 'class'}, due{' '}
            {linkedRequest.due}. {linkedRequest.note}
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="callout">
          <Icon name="warn" />
          <div>
            {warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      ) : null}

      {llmFailed ? (
        <div className="callout red">
          <Icon name="alert" />
          <div>
            <b>Could not generate this draft.</b>
            <div style={{ marginTop: 6 }}>{llmFailed}</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn small primary" onClick={startGenerate}>
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid g2">
        <div className="panel">
          <div className="panel-b">
            <div className="grid g2e">
              <Field id="cf-cls" label="Class" error={fieldErrors.class}>
                <select
                  id="cf-cls"
                  value={classId}
                  disabled={busy || !!reqId}
                  onChange={(e) => onClassChange(e.target.value)}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="cf-mat"
                label="Source material"
                hint="Select one or more"
                error={fieldErrors.materials}
              >
                <div
                  className="panel mat-pick"
                  style={{ padding: 10, maxHeight: 160, overflow: 'auto', margin: 0 }}
                >
                  {materials.length ? (
                    materials.map((m) => (
                      <label
                        key={m.id}
                        className={`mat-pick-row${materialIds.includes(m.id) ? ' on' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={materialIds.includes(m.id)}
                          disabled={busy}
                          onChange={() => toggleMaterial(m.id)}
                        />
                        <span className="mat-pick-box" aria-hidden="true" />
                        <span className="mat-pick-name">{m.name}</span>
                      </label>
                    ))
                  ) : (
                    <span className="small">No material. Upload first.</span>
                  )}
                </div>
              </Field>
            </div>

            <div className="grid g2e">
              <Field id="cf-title" label="Title" error={fieldErrors.title}>
                <input
                  id="cf-title"
                  value={title}
                  disabled={busy}
                  onChange={(e) => {
                    setTitleTouched(true)
                    setTitle(e.target.value)
                  }}
                />
              </Field>
              <div className="grid g2e">
                <Field id="cf-kind" label="Type">
                  <select
                    id="cf-kind"
                    value={kind}
                    disabled={busy || !!reqId}
                    onChange={(e) => onKindChange(e.target.value)}
                  >
                    {['Quiz', 'Midterm', 'Final'].map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="cf-dur" label="Minutes" error={fieldErrors.duration}>
                  <input
                    id="cf-dur"
                    type="number"
                    min={5}
                    value={duration}
                    disabled={busy}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <h3 style={{ fontSize: 15.5, margin: '4px 0' }}>Question mix</h3>
            <p className="small" style={{ margin: '0 0 10px' }}>
              Rename any type, set how many to generate, and add more written kinds. Total cannot exceed{' '}
              {QUESTION_CAP}.
            </p>
            <div className="qtype-list" role="group" aria-label="Question types">
              {qTypes.map((t, idx) => (
                <div key={t.id} className="qtype-row">
                  <div className="qtype-label">
                    <Field
                      id={`cf-label-${idx}`}
                      label="Type name"
                      error={idx === 0 ? fieldErrors.types : undefined}
                    >
                      <input
                        id={`cf-label-${idx}`}
                        value={t.label}
                        disabled={busy}
                        maxLength={40}
                        onChange={(e) => updateQType(t.id, { label: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="qtype-count">
                    <Field id={`cf-count-${idx}`} label="Count">
                      <input
                        id={idx === 0 ? 'cf-mcq' : idx === 1 ? 'cf-short' : idx === 2 ? 'cf-essay' : `cf-count-${idx}`}
                        type="number"
                        min={0}
                        max={QUESTION_CAP}
                        value={t.count}
                        disabled={busy}
                        onChange={(e) => updateQType(t.id, { count: e.target.value })}
                      />
                    </Field>
                  </div>
                  {marksMode === 'suggested' ? (
                    <div className="qtype-marks">
                      <Field
                        id={`cf-marks-${idx}`}
                        label="Marks each"
                        error={idx === 0 ? fieldErrors.marks : undefined}
                      >
                        <input
                          id={
                            idx === 0
                              ? 'cf-m-mcq'
                              : idx === 1
                                ? 'cf-m-short'
                                : idx === 2
                                  ? 'cf-m-essay'
                                  : `cf-marks-${idx}`
                          }
                          type="number"
                          min={0.5}
                          max={100}
                          step={0.5}
                          value={t.marks}
                          disabled={busy}
                          onChange={(e) => updateQType(t.id, { marks: e.target.value })}
                        />
                      </Field>
                    </div>
                  ) : (
                    <span className="qtype-marks" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className="btn small ghost qtype-remove"
                    aria-label={`Remove ${t.label || 'type'}`}
                    disabled={busy || qTypes.length <= 1 || t.format === 'mcq'}
                    title={t.format === 'mcq' ? 'Keep at least the MCQ type' : 'Remove type'}
                    onClick={() => removeQType(t.id)}
                  >
                    <Icon name="x" className="sm" />
                  </button>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn small" disabled={busy} onClick={addQType}>
                <Icon name="plus" className="sm" /> Add type
              </button>
              <span className="small">Total: {totalQ} / {QUESTION_CAP}</span>
              {marksMode === 'suggested' ? (
                <span className="small">Paper total: {suggestedTotal} marks</span>
              ) : null}
            </div>

            <h3 style={{ fontSize: 15.5, margin: '12px 0 4px' }}>Paper blueprint</h3>
            <p className="small" style={{ margin: '0 0 10px' }}>
              Optional. Split the paper by page/slide weightage (e.g. midterm slides 30% / final 70%)
              and pin counts of a type to specific pages.
            </p>
            <label className="row" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={blueprintOn}
                disabled={busy || !materialIds.length}
                onChange={(e) => {
                  const on = e.target.checked
                  setBlueprintOn(on)
                  if (on && !weightRows.length && !pinRows.length) enableBlueprintDefaults()
                }}
              />
              <span>Use page/slide weightage and pin rules</span>
            </label>
            {fieldErrors.blueprint ? (
              <p className="ferr" style={{ marginBottom: 8 }}>
                <Icon name="alert" className="sm" /> {fieldErrors.blueprint}
              </p>
            ) : null}
            {blueprintOn ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
                {outlineBusy ? (
                  <p className="small">Loading page/slide outline…</p>
                ) : (
                  <p className="small" style={{ margin: 0 }}>
                    {materialIds
                      .map((id) => {
                        const m = materials.find((x) => x.id === id)
                        const pages = outlines[id] || []
                        const maxP = pages.length ? pages[pages.length - 1].page : '?'
                        return `${m?.name || id}: ${pages.length} page/slide unit(s), up to ${maxP}`
                      })
                      .join(' · ')}
                  </p>
                )}

                <div>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <b style={{ fontSize: 14 }}>Weightage ranges</b>
                    <button
                      type="button"
                      className="btn small"
                      disabled={busy}
                      onClick={() =>
                        setWeightRows((prev) => [
                          ...prev,
                          newWeightRow(materialIds[0], 1, 1, Math.max(1, 100 - weightSum)),
                        ])
                      }
                    >
                      <Icon name="plus" className="sm" /> Add range
                    </button>
                  </div>
                  <p className="small" style={{ margin: '0 0 8px' }}>
                    Sum of weights: {weightSum}% {Math.abs(weightSum - 100) <= 0.5 ? '(ok)' : '(must be 100)'}
                  </p>
                  {weightRows.map((r) => (
                    <div key={r.id} className="qtype-row" style={{ marginBottom: 6 }}>
                      {materialIds.length > 1 ? (
                        <select
                          value={r.material_id}
                          disabled={busy}
                          onChange={(e) =>
                            setWeightRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, material_id: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {materialIds.map((id) => (
                            <option key={id} value={id}>
                              {materials.find((m) => m.id === id)?.name || id}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <label className="small">
                        From
                        <input
                          type="number"
                          min={1}
                          value={r.page_from}
                          disabled={busy}
                          onChange={(e) =>
                            setWeightRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, page_from: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="small">
                        To
                        <input
                          type="number"
                          min={1}
                          value={r.page_to}
                          disabled={busy}
                          onChange={(e) =>
                            setWeightRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, page_to: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="small">
                        Weight %
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={r.weight_pct}
                          disabled={busy}
                          onChange={(e) =>
                            setWeightRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, weight_pct: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        aria-label="Remove weightage range"
                        onClick={() => setWeightRows((prev) => prev.filter((x) => x.id !== r.id))}
                      >
                        <Icon name="x" className="sm" />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <b style={{ fontSize: 14 }}>Pin rules</b>
                    <button
                      type="button"
                      className="btn small"
                      disabled={busy}
                      onClick={() =>
                        setPinRows((prev) => [
                          ...prev,
                          newPinRow(
                            materialIds[0],
                            qTypes.find((t) => /long|essay/i.test(t.label))?.label ||
                              qTypes[qTypes.length - 1]?.label ||
                              'Long',
                            1,
                            1,
                          ),
                        ])
                      }
                    >
                      <Icon name="plus" className="sm" /> Add pin
                    </button>
                  </div>
                  <p className="small" style={{ margin: '0 0 8px' }}>
                    Example: 2 Long from slide 7, 6 Short from slide 7. Pins are taken first; the rest
                    follow weightage.
                  </p>
                  {pinRows.map((p) => (
                    <div key={p.id} className="qtype-row" style={{ marginBottom: 6 }}>
                      <select
                        value={p.type_label}
                        disabled={busy}
                        onChange={(e) =>
                          setPinRows((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, type_label: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        {qTypes.map((t) => (
                          <option key={t.id} value={t.label}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <label className="small">
                        Count
                        <input
                          type="number"
                          min={1}
                          max={QUESTION_CAP}
                          value={p.count}
                          disabled={busy}
                          onChange={(e) =>
                            setPinRows((prev) =>
                              prev.map((x) =>
                                x.id === p.id ? { ...x, count: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      {materialIds.length > 1 ? (
                        <select
                          value={p.material_id}
                          disabled={busy}
                          onChange={(e) =>
                            setPinRows((prev) =>
                              prev.map((x) =>
                                x.id === p.id ? { ...x, material_id: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {materialIds.map((id) => (
                            <option key={id} value={id}>
                              {materials.find((m) => m.id === id)?.name || id}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <label className="small">
                        Page/slide
                        <input
                          type="number"
                          min={1}
                          value={p.page_from}
                          disabled={busy}
                          onChange={(e) => {
                            const v = e.target.value
                            setPinRows((prev) =>
                              prev.map((x) =>
                                x.id === p.id ? { ...x, page_from: v, page_to: v } : x,
                              ),
                            )
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        aria-label="Remove pin"
                        onClick={() => setPinRows((prev) => prev.filter((x) => x.id !== p.id))}
                      >
                        <Icon name="x" className="sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <h3 style={{ fontSize: 15.5, margin: '4px 0' }}>Marks</h3>
            <p className="small" style={{ margin: '0 0 10px' }}>
              Start from the suggested marks per type above, or give the total for the paper and we will
              spread it across the questions. You can still change marks on any question in the editor.
            </p>
            <div className="row" style={{ marginBottom: 10 }}>
              <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="cf-marks-mode"
                  checked={marksMode === 'suggested'}
                  disabled={busy}
                  onChange={() => setMarksMode('suggested')}
                />
                AI suggests (editable)
              </label>
              <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="cf-marks-mode"
                  checked={marksMode === 'total'}
                  disabled={busy}
                  onChange={() => setMarksMode('total')}
                />
                I set the total marks
              </label>
            </div>
            {marksMode === 'total' ? (
              <>
                <Field id="cf-total-marks" label="Total marks for the paper" error={fieldErrors.marks}>
                  <input id="cf-total-marks" type="number" min={1} max={1000} step={0.5} value={totalMarks} disabled={busy} onChange={(e) => setTotalMarks(e.target.value)} />
                </Field>
                <p className="small" style={{ margin: '0 0 12px' }}>
                  Longer question types get more of the {Number(totalMarks) || 0} marks. The paper adds up to exactly this total.
                </p>
              </>
            ) : null}

            {openReqsForClass.length ? (
              <Field id="cf-req" label="Link to HOD request (optional)">
                <select
                  id="cf-req"
                  value={linkedReq}
                  disabled={busy}
                  onChange={(e) => setLinkedReq(e.target.value)}
                >
                  <option value="">None</option>
                  {openReqsForClass.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.kind} · due {r.due}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <button
              type="button"
              className={`btn primary${busy ? ' busy' : ''}`}
              onClick={startGenerate}
              disabled={busy || !materials.length}
              aria-busy={busy}
              aria-describedby={!materials.length ? 'gen-why' : undefined}
              style={{ width: '100%', minHeight: 48 }}
            >
              Generate draft paper
            </button>
            {materials.length ? (
              <p className="small" style={{ margin: '8px 0 0' }}>
                Next you review every question before anything is sent or published.
              </p>
            ) : (
              <p className="small" id="gen-why" style={{ margin: '8px 0 0' }}>
                Unavailable: upload course material for this class first.
              </p>
            )}
          </div>
        </div>

        <Panel
          title={<h3 style={{ margin: 0 }}>Generation steps</h3>}
          headerRight={
            <span className="small" role="status">
              {busy ? 'Working…' : 'Ready'}
            </span>
          }
        >
          <PipelineSteps
            steps={GENERATE_PIPE_STEPS}
            promise={pipePromise}
            minDisplayMs={2000}
            onDone={onPipeDone}
            onError={onPipeError}
          />
          <p className="small" style={{ marginTop: 12 }}>
            Each step shows a spinner, then a check, while the paper is generated.
          </p>
        </Panel>
      </div>
    </>
  )
}
