/** Same mark + wordmark as v7 LOGO / [data-logo]. */
export default function Logo({ className = '', to, onClick, 'aria-label': ariaLabel }) {
  const cls = ['logo', className].filter(Boolean).join(' ')
  const inner = (
    <>
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="9" style={{ fill: 'var(--color-primary)' }} />
        <path
          d="M22.3 10.3A8.5 8.5 0 1 0 22.3 21.7"
          fill="none"
          style={{ stroke: 'var(--color-on-primary)' }}
          strokeWidth="4.4"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="3.9" style={{ fill: 'var(--color-on-primary)' }} />
        <rect
          x="16"
          y="14.9"
          width="9"
          height="2.2"
          rx="1.1"
          style={{ fill: 'var(--color-on-primary)' }}
        />
      </svg>
      <span>cogni.ai</span>
    </>
  )

  if (to) {
    return (
      <a className={cls} href={to} aria-label={ariaLabel || 'cogni.ai home'} onClick={onClick}>
        {inner}
      </a>
    )
  }

  return (
    <span className={cls} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : true}>
      {inner}
    </span>
  )
}
