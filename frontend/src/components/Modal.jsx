import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const ModalContext = createContext(null)

/**
 * Context modal matching v7 `openModal` / `closeModal`.
 * Esc and backdrop click close; focuses first input (or first action button).
 * openModal(node, { onClose }) — onClose runs once when the modal is dismissed.
 */
export function ModalProvider({ children }) {
  const [content, setContent] = useState(null)
  const [closing, setClosing] = useState(false)
  const lastFocus = useRef(null)
  const boxRef = useRef(null)
  const closeTimer = useRef(null)
  const onCloseRef = useRef(null)
  const open = content != null || closing

  const contentRef = useRef(null)
  const closingRef = useRef(false)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    closingRef.current = closing
  }, [closing])

  const finishClose = useCallback(() => {
    const cb = onCloseRef.current
    onCloseRef.current = null
    setContent(null)
    setClosing(false)
    if (lastFocus.current && document.contains(lastFocus.current)) {
      lastFocus.current.focus()
    }
    if (typeof cb === 'function') cb()
  }, [])

  const closeModal = useCallback(() => {
    // Use refs so callers that captured closeModal at open-time still work
    // (fixes indefinite Create-class spinner after a successful create).
    if (contentRef.current == null && !closingRef.current) return
    setClosing(true)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(finishClose, 150)
  }, [finishClose])

  const openModal = useCallback((node, options = {}) => {
    clearTimeout(closeTimer.current)
    setClosing(false)
    if (node != null) lastFocus.current = document.activeElement
    onCloseRef.current = options.onClose || null
    setContent(node)
  }, [])

  useEffect(() => {
    if (content == null || closing) return undefined
    const box = boxRef.current
    if (!box) return undefined
    const title = box.querySelector('h3')
    if (title && !title.id) title.id = 'modal-title'
    const focusable =
      box.querySelector('input, select, textarea') || box.querySelector('.acts .btn')
    if (focusable) focusable.focus()
    return undefined
  }, [content, closing])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeModal()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeModal])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const value = useMemo(() => ({ openModal, closeModal }), [openModal, closeModal])

  return (
    <ModalContext.Provider value={value}>
      {children}
      <div
        className={`modal-bg${closing ? ' closing' : ''}`}
        hidden={!open}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal()
        }}
      >
        <div
          className="modal"
          id="modal-box"
          ref={boxRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </ModalContext.Provider>
  )
}

export function useModal() {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error('useModal must be used within ModalProvider')
  return ctx
}
