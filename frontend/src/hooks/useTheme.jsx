import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const KEY = 'cogni-theme'
const ThemeContext = createContext(null)

function readTheme() {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let mq
    try {
      mq = matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return undefined
    }
    const onChange = (e) => {
      let saved = null
      try {
        saved = localStorage.getItem(KEY)
      } catch {
        /* ignore */
      }
      if (!saved) {
        const next = e.matches ? 'dark' : 'light'
        document.documentElement.dataset.theme = next
        setThemeState(next)
      }
    }
    try {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    } catch {
      return undefined
    }
  }, [])

  const setTheme = useCallback((t, fromEl) => {
    const next = t === 'dark' ? 'dark' : 'light'
    const apply = () => {
      applyTheme(next)
      setThemeState(next)
    }
    if (
      !document.startViewTransition ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      apply()
      return
    }
    const r = fromEl
      ? fromEl.getBoundingClientRect()
      : { left: window.innerWidth - 40, top: 30, width: 0, height: 0 }
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const R = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    document
      .startViewTransition(apply)
      .ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0 at ${x}px ${y}px)`,
              `circle(${R}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 520,
            easing: 'cubic-bezier(.22,1,.36,1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
      .catch(() => {})
  }, [])

  const toggleTheme = useCallback(
    (fromEl) => {
      setTheme(theme === 'dark' ? 'light' : 'dark', fromEl)
    },
    [setTheme, theme],
  )

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isDark: theme === 'dark' }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Theme toggle matching v7 setTheme / THEME_BTN behaviour. */
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
