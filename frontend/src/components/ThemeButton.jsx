import { useTheme } from '../hooks/useTheme'
import { Icon } from './IconSprite'

/** Same markup as v7 THEME_BTN(). */
export default function ThemeButton({ className = '' }) {
  const { isDark, toggleTheme } = useTheme()
  const cls = ['btn', 'ghost', 'icon', 'theme-btn', className].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      onClick={(e) => toggleTheme(e.currentTarget)}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  )
}
