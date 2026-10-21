/** Tab strip matching v7 `.tabs` button group. */
export default function Tabs({ items = [], value, onChange, 'aria-label': ariaLabel }) {
  return (
    <div className="tabs" role="group" aria-label={ariaLabel}>
      {items.map((item) => {
        const id = item.id ?? item.value
        const on = value === id
        return (
          <button
            key={id}
            type="button"
            className={on ? 'on' : ''}
            aria-pressed={on}
            onClick={() => onChange?.(id)}
          >
            {item.label}
            {item.count != null ? (
              <span className="small tab-count"> {item.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
