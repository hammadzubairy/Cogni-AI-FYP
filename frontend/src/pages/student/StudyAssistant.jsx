import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { useConfirm } from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import { materialKindLabel, studySourceLabel } from '../../utils/student'

const SUGGESTIONS = [
  'Summarise the main ideas',
  'What should I revise first?',
  'Give me a practice question',
]

function AiChip({ children = 'Study assistant' }) {
  return (
    <span className="chip-study">
      <Icon name="spark" />
      {children}
    </span>
  )
}

const SECTION_RE = /^(practice question|question|good answer|model answer|answer outline)\s*:?$/i

function greetingMessage(doc) {
  return {
    r: 'a',
    t: `Hi. Ask me anything about "${doc.name}". I answer only from this material and show the page I used.`,
    id: `greet-${doc.id}`,
  }
}

/** Render assistant text with clear section labels and line breaks. */
function StudyMessageBody({ text }) {
  const lines = String(text || '').split('\n')
  return (
    <div className="msg-body">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="msg-gap" />
        if (SECTION_RE.test(trimmed)) {
          return (
            <div key={i} className="msg-h">
              {trimmed.replace(/:$/, '')}
            </div>
          )
        }
        return (
          <p key={i} className="msg-line">
            {line}
          </p>
        )
      })}
    </div>
  )
}

export default function StudyAssistant() {
  const [searchParams, setSearchParams] = useSearchParams()
  const docParam = searchParams.get('doc') || ''
  const confirm = useConfirm()

  const [docs, setDocs] = useState([])
  const [docId, setDocId] = useState(docParam)
  const [chats, setChats] = useState({})
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const msgsRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const classes = await api.listClasses()
      const all = []
      await Promise.all(
        (classes || []).map(async (c) => {
          try {
            const mats = await api.listMaterials(c.id)
            mats.forEach((m) => all.push({ ...m, class_code: c.code }))
          } catch {
            /* skip */
          }
        }),
      )
      all.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      setDocs(all)
      const preferred =
        (docParam && all.find((d) => d.id === docParam)?.id) || all[0]?.id || ''
      setDocId(preferred)
    } catch (err) {
      setError(err)
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [docParam])

  useEffect(() => {
    load()
  }, [load])

  const doc = docs.find((d) => d.id === docId) || null

  useEffect(() => {
    if (!doc) return
    setChats((prev) => {
      if (prev[doc.id]) return prev
      return {
        ...prev,
        [doc.id]: [greetingMessage(doc)],
      }
    })
  }, [doc])

  useEffect(() => {
    const el = msgsRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chats, docId, typing])

  function selectDoc(id) {
    setDocId(id)
    const next = new URLSearchParams(searchParams)
    next.set('doc', id)
    setSearchParams(next, { replace: true })
  }

  function applyClearChat(material) {
    setChats((prev) => ({
      ...prev,
      [material.id]: [greetingMessage(material)],
    }))
  }

  async function onClearChat(material, e) {
    e.preventDefault()
    e.stopPropagation()
    const thread = chats[material.id] || []
    const hasExtra = thread.length > 1
    if (hasExtra) {
      const ok = await confirm({
        title: 'Clear this chat?',
        body: `Remove the conversation for “${material.name}”? The material file stays.`,
        ok: 'Clear chat',
        tone: 'bad',
      })
      if (!ok) return
    }
    applyClearChat(material)
    if (docId !== material.id) selectDoc(material.id)
  }

  async function ask(question) {
    const q = String(question || '').trim()
    if (!q || !doc || typing) return
    setInput('')
    setChats((prev) => ({
      ...prev,
      [doc.id]: [...(prev[doc.id] || []), { r: 'u', t: q, id: `u-${Date.now()}` }],
    }))
    setTyping(true)
    try {
      const res = await api.askMaterial(doc.id, q)
      const sources = (res.sources || [])
        .map(studySourceLabel)
        .filter(Boolean)
      setChats((prev) => ({
        ...prev,
        [doc.id]: [
          ...(prev[doc.id] || []),
          {
            r: 'a',
            t: res.answer || 'No answer returned.',
            sources,
            id: `a-${Date.now()}`,
          },
        ],
      }))
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong asking the assistant.'
      setChats((prev) => ({
        ...prev,
        [doc.id]: [
          ...(prev[doc.id] || []),
          { r: 'a', t: msg, error: true, id: `e-${Date.now()}` },
        ],
      }))
    } finally {
      setTyping(false)
    }
  }

  if (loading) return <ShellLoading label="Loading study assistant…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load materials.'} onRetry={load} />
    )
  }
  if (!docs.length) {
    return (
      <>
        <PageTop title="Study assistant" />
        <EmptyState>Join a class to get its material here.</EmptyState>
      </>
    )
  }

  const chat = (doc && chats[doc.id]) || []

  return (
    <>
      <PageTop crumb="Answers come only from your class material" title="Study assistant" />
      <div className="panel chat">
        <div className="docs">
          <div className="small" style={{ marginBottom: 8 }}>
            Material
          </div>
          {docs.map((m) => (
            <div key={m.id} className={`doc-row${m.id === doc?.id ? ' on' : ''}`}>
              <button
                type="button"
                className={`doc${m.id === doc?.id ? ' on' : ''}`}
                title={m.name}
                onClick={() => selectDoc(m.id)}
              >
                <span className="doc-name">{m.name}</span>
                <span className="doc-meta">
                  {m.class_code || materialKindLabel(m.kind)}
                </span>
              </button>
              <button
                type="button"
                className="btn small icon doc-clear"
                aria-label={`Clear chat for ${m.name}`}
                title="Clear chat"
                disabled={typing}
                onClick={(e) => onClearChat(m, e)}
              >
                <Icon name="trash" className="sm" />
              </button>
            </div>
          ))}
        </div>
        <div className="conv">
          <div
            className="msgs"
            id="msgs"
            ref={msgsRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation"
          >
            {chat.map((m) => (
              <div
                key={m.id}
                className={`msg ${m.r}${m.error ? ' old' : ''}`}
                style={m.error ? { borderColor: 'var(--color-destructive)' } : undefined}
              >
                {m.r === 'a' ? (
                  <div style={{ marginBottom: 6 }}>
                    <AiChip />
                  </div>
                ) : null}
                {m.r === 'a' ? <StudyMessageBody text={m.t} /> : m.t}
                {(m.sources || []).length ? (
                  <div className="study-sources" style={{ marginTop: 8 }}>
                    <div className="small" style={{ marginBottom: 4 }}>
                      Page numbers refer to locations in the selected document.
                    </div>
                    {(m.sources || []).map((s, i) => (
                      <span className="src" key={i}>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {typing ? (
              <div className="msg a old typing" aria-label="Assistant is typing">
                <div style={{ marginBottom: 6 }}>
                  <AiChip />
                </div>
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            ) : null}
          </div>
          <div className="sugg">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" disabled={typing} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="composer">
            <label htmlFor="cq" className="sr-only">
              Ask a question about {doc?.name}
            </label>
            <input
              id="cq"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ask(input)
                }
              }}
              placeholder="Ask about this material…"
              autoComplete="off"
              disabled={typing}
            />
            <button
              type="button"
              className="btn primary"
              disabled={typing || !input.trim()}
              onClick={() => ask(input)}
            >
              <Icon name="send" className="sm" />
              Ask
            </button>
          </div>
        </div>
      </div>
      <p className="small mt">
        The assistant is for studying. Exam answers must be your own; written answers are checked
        for AI-generated text.
      </p>
    </>
  )
}
