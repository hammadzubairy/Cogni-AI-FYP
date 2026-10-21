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
  defaultCounts,
  defaultDuration,
  defaultExamTitle,
  GENERATE_PIPE_STEPS,
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
  const [mcq, setMcq] = useState(4)
  const [short, setShort] = useState(2)
  const [essay, setEssay] = useState(1)
  const [linkedReq, setLinkedReq] = useState(reqId || '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [warnings, setWarnings] = useState([])
  const [llmFailed, setLlmFailed] = useState(null)
  const [pipePromise, setPipePromise] = useState(null)
  const [busy, setBusy] = useState(false)
  const [titleTouched, setTitleTouched] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cls, reqs] = await Promise.all([api.listClasses(), api.listRequests().catch(() => [])])
      setClasses(cls)
      setRequests(reqs || [])

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
      const counts = defaultCounts(initialKind)
      setMcq(counts.MCQ)
      setShort(counts.Short)
      setEssay(counts.Essay)
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

  const totalQ = (Number(mcq) || 0) + (Number(short) || 0) + (Number(essay) || 0)

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
    const counts = defaultCounts(k)
    setMcq(counts.MCQ)
    setShort(counts.Short)
    setEssay(counts.Essay)
    if (!titleTouched && activeClass) {
      setTitle(defaultExamTitle(k, activeClass.name, 1))
    }
  }

  function toggleMaterial(id) {
    setMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function validate() {
    const errs = {}
    if (!classId) errs.class = 'Choose a class'
    if (!materialIds.length) errs.materials = 'Select at least one material'
    if (!(Number(duration) >= 5)) errs.duration = 'Set a time limit of at least 5 minutes'
    if (totalQ < 1) errs.mcq = 'Choose at least one question of any type'
    if (totalQ > QUESTION_CAP) errs.mcq = `Total questions cannot exceed ${QUESTION_CAP}`
    if (!title.trim()) errs.title = 'Enter a title'
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
      counts: {
        MCQ: Number(mcq) || 0,
        Short: Number(short) || 0,
        Essay: Number(essay) || 0,
      },
    }
    if (linkedReq) body.request_id = linkedReq
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
    // Never dump raw provider JSON / token-limit noise at teachers.
    let msg = raw
    const lower = String(raw).toLowerCase()
    if (
      lower.includes('too large') ||
      lower.includes('413') ||
      lower.includes('itpm') ||
      lower.includes('rate_limit') ||
      lower.includes("{'error'") ||
      lower.includes('{"error"')
    ) {
      msg =
        'The AI could not finish this draft — the material may be too large for one pass, or the service was busy. Try fewer source files or a shorter document, then press Retry.'
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
              How many of each type to generate. Total cannot exceed {QUESTION_CAP}.
            </p>
            <div className="grid g3" style={{ alignItems: 'end' }}>
              <Field id="cf-mcq" label="MCQ" error={fieldErrors.mcq}>
                <input
                  id="cf-mcq"
                  type="number"
                  min={0}
                  max={QUESTION_CAP}
                  value={mcq}
                  disabled={busy}
                  onChange={(e) => setMcq(e.target.value)}
                />
              </Field>
              <Field id="cf-short" label="Short">
                <input
                  id="cf-short"
                  type="number"
                  min={0}
                  max={QUESTION_CAP}
                  value={short}
                  disabled={busy}
                  onChange={(e) => setShort(e.target.value)}
                />
              </Field>
              <Field id="cf-essay" label="Essay">
                <input
                  id="cf-essay"
                  type="number"
                  min={0}
                  max={QUESTION_CAP}
                  value={essay}
                  disabled={busy}
                  onChange={(e) => setEssay(e.target.value)}
                />
              </Field>
            </div>
            <p className="small" style={{ margin: '0 0 12px' }}>
              Total: {totalQ} / {QUESTION_CAP}
            </p>

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
