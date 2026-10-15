/** Panel matching v7 `.panel` / `.panel-h` / `.panel-b`. */
export default function Panel({ title, headerRight, children, className = '', body = true }) {
  const hasHeader = title != null || headerRight != null
  return (
    <div className={`panel ${className}`.trim()}>
      {hasHeader ? (
        <div className="panel-h">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {headerRight}
        </div>
      ) : null}
      {body && children != null ? <div className="panel-b">{children}</div> : children}
    </div>
  )
}
