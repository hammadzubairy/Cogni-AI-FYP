import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import PipelineSteps from '../../components/PipelineSteps'
import Tabs from '../../components/Tabs'
import { useConfirm } from '../../components/ConfirmModal'
import { useToast } from '../../components/Toast'
import { formatShortDate } from '../../utils/format'
import {
  isMaterialFile,
  kindLabel,
  MATERIAL_ACCEPT,
  MATERIAL_PIPE_STEPS,
  MIN_PASTE_CHARS,
  SCANNED_PDF_MESSAGE,
  wordCount,
} from '../../utils/teacher'

/**
 * Course material page (v7 t-materials).
 * When `embedded` + `classId`, renders without page top (class tab).
 */
export default function Materials({ embedded = false, classId: fixedClassId } = {}) {
  const toast = useToast()
  const confirm = useConfirm()
  const fileRef = useRef(null)

  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState(fixedClassId || '')
  const [tab, setTab] = useState('pdf')
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [files, setFiles] = useState([])
  const [notes, setNotes] = useState('')
  const [notesName, setNotesName] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [scannedCallout, setScannedCallout] = useState(false)
  const [pipePromise, setPipePromise] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  const activeClassId = fixedClassId || classId

  const refreshMaterials = useCallback(async (clsList, uploadClassId) => {
    if (fixedClassId) {
      setMaterials(await api.listMaterials(fixedClassId))
      return
    }
    const targets = uploadClassId
      ? clsList
      : clsList
    const all = []
    await Promise.all(
      targets.map(async (c) => {
        try {
          const mats = await api.listMaterials(c.id)
          all.push(...mats)
        } catch {
          /* skip */
        }
      }),
    )
    all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    setMaterials(all)
  }, [fixedClassId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (fixedClassId) {
        setClassId(fixedClassId)
        setClasses([])
        await refreshMaterials([], fixedClassId)
      } else {
        const list = await api.listClasses()
        setClasses(list)
        if (!classId && list[0]) setClassId(list[0].id)
        await refreshMaterials(list)
      }
    } catch (err) {
      setError(err)
      setMaterials([])
    } finally {
      setLoading(false)
    }
  }, [fixedClassId, classId, refreshMaterials])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when class context changes
  }, [fixedClassId])

  const classById = useMemo(() => {
    const m = new Map()
    classes.forEach((c) => m.set(c.id, c))
    return m
  }, [classes])

  const pasteWords = wordCount(notes)
  const pasteChars = notes.trim().length

  function acceptFiles(list) {
    const incoming = Array.from(list || [])
    if (!incoming.length) return
    const good = []
    const bad = []
    incoming.forEach((f) => {
      if (isMaterialFile(f.name)) good.push(f)
      else bad.push(f.name)
    })
    if (bad.length) {
      toast(`Skipped unsupported file(s): ${bad.slice(0, 3).join(', ')}`, { type: 'error' })
    }
    if (!good.length) return
    setFiles((prev) => {
      const names = new Set(prev.map((f) => `${f.name}:${f.size}`))
      const merged = [...prev]
      good.forEach((f) => {
        const key = `${f.name}:${f.size}`
        if (!names.has(key)) {
          names.add(key)
          merged.push(f)
        }
      })
      return merged
    })
    setScannedCallout(false)
    setFieldError('')
  }

  function onDrop(e) {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    acceptFiles(e.dataTransfer?.files)
  }

  async function uploadFilesQueue(queue) {
    let last = null
    let ok = 0
    for (let i = 0; i < queue.length; i += 1) {
      const f = queue[i]
      setUploadProgress(`Uploading ${i + 1} of ${queue.length}: ${f.name}`)
      const fd = new FormData()
      fd.append('file', f)
      fd.append('name', f.name)
      last = await api.uploadMaterialPdf(activeClassId, fd)
      ok += 1
    }
    return { last, ok, total: queue.length }
  }

  function startUpload() {
    if (!activeClassId) {
      toast('Create a class first.', { type: 'error' })
      return
    }
    setScannedCallout(false)
    setFieldError('')
    setUploadProgress('')

    if (tab === 'pdf') {
      if (!files.length) {
        toast('Choose at least one PDF, DOCX, or PPTX file', { type: 'error' })
        return
      }
      setBusy(true)
      setPipePromise(uploadFilesQueue(files))
      return
    }

    if (pasteChars < MIN_PASTE_CHARS) {
      setFieldError(`Pasted text must be at least ${MIN_PASTE_CHARS} characters.`)
      return
    }
    const name =
      notesName.trim() ||
      `Pasted notes · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    setBusy(true)
    setPipePromise(api.uploadMaterialText(activeClassId, { name, text: notes.trim() }))
  }

  async function onPipeDone(result) {
    setBusy(false)
    setPipePromise(null)
    setFiles([])
    setNotes('')
    setNotesName('')
    setUploadProgress('')
    if (fileRef.current) fileRef.current.value = ''
    try {
      if (fixedClassId) await refreshMaterials([], fixedClassId)
      else await refreshMaterials(classes)
    } catch {
      /* ignore refresh error */
    }
    if (result && typeof result.ok === 'number') {
      toast(
        `${result.ok} file${result.ok === 1 ? '' : 's'} saved` +
          (result.last?.chunk_count != null
            ? ` · last file ${result.last.chunk_count} chunk${result.last.chunk_count === 1 ? '' : 's'}`
            : ''),
      )
      return
    }
    const chunks = result?.chunk_count ?? 0
    toast(`Material saved · ${chunks} chunk${chunks === 1 ? '' : 's'}`)
  }

  function onPipeError(err) {
    setBusy(false)
    setPipePromise(null)
    setUploadProgress('')
    const code = err instanceof ApiError ? err.code : ''
    const msg = err instanceof ApiError ? err.message : 'Upload failed.'
    if (code === 'SCANNED_PDF' || /scanned|OCR/i.test(msg)) {
      setScannedCallout(true)
    }
    setFieldError(msg)
    toast(msg, { type: 'error' })
  }

  async function onDelete(m) {
    const ok = await confirm({
      title: `Delete ${m.name}?`,
      body: 'Students lose access to it in the study assistant. Exams made from it stay.',
      ok: 'Delete file',
      tone: 'bad',
    })
    if (!ok) return
    try {
      await api.deleteMaterial(m.id)
      setMaterials((list) => list.filter((x) => x.id !== m.id))
      toast('Material deleted')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete.', { type: 'error' })
    }
  }

  if (loading) return <ShellLoading label="Loading materials…" />
  if (error) {
    return <ShellError message={error.message || 'Could not load materials.'} onRetry={load} />
  }

  if (!fixedClassId && !classes.length) {
    return (
      <>
        {!embedded ? <PageTop title="Course material" /> : null}
        <EmptyState>Create a class first.</EmptyState>
      </>
    )
  }

  return (
    <>
      {!embedded ? <PageTop title="Course material" /> : null}

      <div className="grid" style={{ maxWidth: 760 }}>
        <Panel title="Upload">
          {!fixedClassId ? (
            <Field id="mat-cls" label="Class">
              <select
                id="mat-cls"
                value={activeClassId}
                disabled={busy}
                onChange={(e) => setClassId(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <div className="lbl" id="src-lbl" style={{ marginBottom: 6 }}>
            Source
          </div>
          <Tabs
            aria-label="Source"
            value={tab}
            onChange={(k) => {
              if (busy) return
              setTab(k)
              setFieldError('')
              setScannedCallout(false)
            }}
            items={[
              { id: 'pdf', label: 'Files' },
              { id: 'text', label: 'Paste notes' },
            ]}
          />

          {scannedCallout ? (
            <div className="callout red" style={{ marginTop: 14 }}>
              <Icon name="alert" />
              <div>
                <b>{SCANNED_PDF_MESSAGE}</b>
              </div>
            </div>
          ) : null}

          {tab === 'pdf' ? (
            <>
              <label
                className="drop"
                htmlFor="mat-file"
                style={dragging ? { borderColor: 'var(--color-primary)' } : undefined}
                onDragEnter={(e) => {
                  e.preventDefault()
                  dragDepth.current += 1
                  setDragging(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  dragDepth.current -= 1
                  if (dragDepth.current <= 0) {
                    dragDepth.current = 0
                    setDragging(false)
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
              >
                <Icon name={files.length ? 'check' : 'upload'} />
                <b>
                  {files.length
                    ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
                    : 'Choose PDF, DOCX, or PPTX'}
                </b>
                <span>
                  {files.length
                    ? files.map((f) => f.name).join(' · ')
                    : 'Upload one or more files. Scanned PDFs use OCR. Presentations and Word docs are supported.'}
                </span>
              </label>
              <input
                ref={fileRef}
                type="file"
                id="mat-file"
                accept={MATERIAL_ACCEPT}
                multiple
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  acceptFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              {files.length ? (
                <div className="file-queue" style={{ marginTop: 10 }}>
                  {files.map((f) => (
                    <div className="lrow" key={`${f.name}:${f.size}`} style={{ padding: '8px 0' }}>
                      <div className="grow">
                        <b>{f.name}</b>
                        <div className="small">{Math.max(1, Math.round(f.size / 1024))} KB</div>
                      </div>
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy}
                        onClick={() =>
                          setFiles((prev) =>
                            prev.filter((x) => !(x.name === f.name && x.size === f.size)),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {uploadProgress ? (
                <p className="small" style={{ marginTop: 8 }}>
                  {uploadProgress}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <Field id="mat-name" label="Name (optional)">
                <input
                  id="mat-name"
                  value={notesName}
                  disabled={busy}
                  onChange={(e) => setNotesName(e.target.value)}
                  placeholder="Week 4 notes"
                />
              </Field>
              <Field id="mat-notes" label="Notes" error={fieldError && tab === 'text' ? fieldError : ''}>
                <textarea
                  id="mat-notes"
                  rows={6}
                  value={notes}
                  disabled={busy}
                  onChange={(e) => {
                    setNotes(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="Paste lecture notes here…"
                />
              </Field>
              <p className="small" style={{ margin: '-6px 0 12px' }}>
                {pasteWords} word{pasteWords === 1 ? '' : 's'} · {pasteChars} characters
                {pasteChars < MIN_PASTE_CHARS
                  ? ` · need at least ${MIN_PASTE_CHARS} characters`
                  : ''}
              </p>
            </>
          )}

          {tab === 'pdf' && fieldError && !scannedCallout ? (
            <p className="ferr" style={{ marginBottom: 12 }}>
              <Icon name="alert" className="sm" />
              <span>{fieldError}</span>
            </p>
          ) : null}

          <div className="row">
            <button
              type="button"
              className={`btn primary${busy ? ' busy' : ''}`}
              onClick={startUpload}
              disabled={busy}
              aria-busy={busy}
            >
              Process material
            </button>
          </div>

          {pipePromise ? (
            <div style={{ marginTop: 16 }}>
              <PipelineSteps
                steps={MATERIAL_PIPE_STEPS}
                promise={pipePromise}
                minDisplayMs={1600}
                onDone={onPipeDone}
                onError={onPipeError}
              />
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="panel mt">
        <div className="panel-h">
          <h3>
            {fixedClassId ? 'Material in this class' : 'All my material'} ({materials.length})
          </h3>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                {!fixedClassId ? <th>Class</th> : null}
                <th>Type</th>
                <th>Words</th>
                <th>Chunks</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {materials.length ? (
                materials.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{m.name}</b>
                    </td>
                    {!fixedClassId ? (
                      <td>{classById.get(m.class_id)?.code || '—'}</td>
                    ) : null}
                    <td>{kindLabel(m.kind)}</td>
                    <td className="num">{m.word_count ?? '—'}</td>
                    <td className="num">{m.chunk_count ?? '—'}</td>
                    <td>{formatShortDate(m.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small bad"
                        onClick={() => onDelete(m)}
                        aria-label={`Delete ${m.name}`}
                      >
                        Delete…
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={fixedClassId ? 6 : 7} className="empty">
                    No material yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
