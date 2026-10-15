import { Icon } from './IconSprite'

/** Form field matching v7 `.field` + inline `.ferr`. */
export default function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      {label != null ? <label htmlFor={id}>{label}</label> : null}
      {hint != null ? (
        <span className="hint" id={id ? `${id}-h` : undefined}>
          {hint}
        </span>
      ) : null}
      {children}
      {error ? (
        <p className="ferr" id={id ? `${id}-err` : undefined}>
          <Icon name="alert" className="sm" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
