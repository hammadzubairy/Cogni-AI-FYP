import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Icon } from './IconSprite'

const ToastContext = createContext(null)

/**
 * Context toast matching v7 `toast(m, o)`.
 * Usage: const toast = useToast(); toast('Saved'); toast('Nope', { type: 'error' })
 */
export function ToastProvider({ children }) {
  const [state, setState] = useState({ show: false, message: '', type: '', undo: null })
  const timer = useRef(null)
  const undoRef = useRef(null)

  const hide = useCallback(() => {
    setState((s) => ({ ...s, show: false, undo: null }))
    undoRef.current = null
  }, [])

  const toast = useCallback(
    (message, options = {}) => {
      clearTimeout(timer.current)
      undoRef.current = options.undo || null
      setState({
        show: false,
        message: String(message || ''),
        type: options.type === 'error' ? 'error' : '',
        undo: options.undo || null,
      })
      // Force reflow so re-showing the same message retriggers the CSS transition
      requestAnimationFrame(() => {
        setState((s) => ({ ...s, show: true }))
      })
      timer.current = setTimeout(hide, options.undo ? 7000 : 3200)
    },
    [hide],
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={`toast${state.type === 'error' ? ' error' : ''}${state.show ? ' show' : ''}`}
        role="status"
        aria-live="polite"
      >
        <Icon name={state.type === 'error' ? 'alert' : 'check'} />
        <span>{state.message}</span>
        {state.undo ? (
          <button
            type="button"
            onClick={() => {
              const fn = undoRef.current
              hide()
              if (typeof fn === 'function') fn()
            }}
          >
            Undo
          </button>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
