import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import Field from '../Field'
import { useModal } from '../Modal'
import { useToast } from '../Toast'
import { Icon } from '../IconSprite'

/** Opens the v7 New class modal; on success navigates to the class and toasts the join code. */
export function useNewClassModal() {
  const { openModal, closeModal } = useModal()
  const toast = useToast()
  const navigate = useNavigate()

  return function openNewClass() {
    openModal(<NewClassForm closeModal={closeModal} toast={toast} navigate={navigate} />)
  }
}

function NewClassForm({ closeModal, toast, navigate }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  async function submit() {
    const next = {}
    const n = name.trim()
    const c = code.trim().toUpperCase()
    if (!n) next.name = 'Enter a course name'
    if (!c) next.code = 'Enter a course code, e.g. CS-330-A'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const created = await api.createClass({ name: n, code: c })
      closeModal()
      toast(`Class created. Share join code ${created.join_code}`)
      navigate(`/app/teacher/classes/${created.id}`)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not create class.'
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ code: msg })
      } else {
        setErrors({ name: msg })
      }
      setBusy(false)
    }
  }

  return (
    <>
      <h3>New class</h3>
      <Field id="nc-name" label="Course name" error={errors.name}>
        <input
          id="nc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Algorithms"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </Field>
      <Field id="nc-code" label="Course code" error={errors.code}>
        <input
          id="nc-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CS-330-A"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </Field>
      <div className="acts">
        <button type="button" className="btn" onClick={closeModal} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn primary${busy ? ' busy' : ''}`}
          onClick={submit}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Creating…' : 'Create class'}
        </button>
      </div>
    </>
  )
}

export function NewClassButton({ className = 'btn primary' }) {
  const open = useNewClassModal()
  return (
    <button type="button" className={className} onClick={open}>
      <Icon name="plus" className="sm" />
      New class
    </button>
  )
}
