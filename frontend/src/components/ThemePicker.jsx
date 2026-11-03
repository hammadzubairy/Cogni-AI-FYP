import { useTheme } from '../hooks/useTheme'

/**
 * Appearance controls for Settings: light/dark mode + palette grid.
 * Applies immediately (localStorage); no form save required.
 */
export default function ThemePicker() {
  const { theme, setTheme, palette, setPalette, palettes, isDark } = useTheme()

  return (
    <div className="panel theme-picker">
      <div className="panel-h">
        <h3>Appearance</h3>
      </div>
      <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="small" style={{ margin: 0, color: 'var(--color-muted-foreground)' }}>
          Pick a colour theme. Changes apply right away on this device.
        </p>

        <div>
          <div className="small" style={{ fontWeight: 650, marginBottom: 8 }}>
            Mode
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn small${theme === 'light' ? ' primary' : ''}`}
              aria-pressed={theme === 'light'}
              onClick={(e) => setTheme('light', e.currentTarget)}
            >
              Light
            </button>
            <button
              type="button"
              className={`btn small${theme === 'dark' ? ' primary' : ''}`}
              aria-pressed={theme === 'dark'}
              onClick={(e) => setTheme('dark', e.currentTarget)}
            >
              Dark
            </button>
          </div>
        </div>

        <div>
          <div className="small" style={{ fontWeight: 650, marginBottom: 8 }}>
            Colour theme
          </div>
          <div className="theme-grid" role="listbox" aria-label="Colour themes">
            {palettes.map((p) => {
              const on = p.id === palette
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`theme-card${on ? ' on' : ''}`}
                  onClick={(e) => setPalette(p.id, e.currentTarget)}
                >
                  <span className="theme-swatches" aria-hidden="true">
                    {p.swatches.map((c) => (
                      <span key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="theme-card-txt">
                    <b>{p.name}</b>
                    <span className="small">{p.blurb}</span>
                  </span>
                  {on ? <span className="theme-card-check">Active</span> : null}
                </button>
              )
            })}
          </div>
          <p className="small" style={{ margin: '10px 0 0', color: 'var(--color-muted-foreground)' }}>
            Showing {isDark ? 'dark' : 'light'} preview for each theme via the mode toggle above.
          </p>
        </div>
      </div>
    </div>
  )
}
