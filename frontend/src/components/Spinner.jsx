/** Loading indicator using the same spin animation as v7 pipeline dots. */
export default function Spinner({ label = 'Loading…', inline = false }) {
  const inner = (
    <>
      <span className="dot run" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </>
  )
  if (inline) {
    return (
      <span className="row" role="status" style={{ gap: 10, alignItems: 'center' }}>
        {inner}
      </span>
    )
  }
  return (
    <div className="panel empty" role="status" style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
      {inner}
    </div>
  )
}
