import { useState } from 'react'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { useToast } from '../Toast'

/** Join-by-code form matching v7 student dash / s-classes. */
export default function JoinClass({ onJoined, className = '' }) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const joinCode = code.trim()
    if (!joinCode) {
      setError('Enter the join code your teacher shared.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const cls = await api.joinClass(joinCode)
      setCode('')
      toast(`Joined ${cls.code}`)
      if (typeof onJoined === 'function') onJoined(cls)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Could not join. Check the code and try again.'
      setError(msg)
      toast(msg, { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={`panel panel-b fd-join ${className}`.trim()}
      style={{ maxWidth: 520, marginTop: 'var(--space-2xl)' }}
    >
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
          <label htmlFor="j-code">Join a class</label>
          <input
            id="j-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (error) setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="SRE-5T6"
            autoComplete="off"
            aria-describedby="j-hint"
            disabled={busy}
          />
          {error ? <p className="ferr">{error}</p> : null}
        </div>
        <button type="button" className="btn" onClick={submit} disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </div>
      <p className="small" id="j-hint" style={{ margin: '8px 0 0' }}>
        Your teacher shares the join code.
      </p>
    </section>
  )
}
