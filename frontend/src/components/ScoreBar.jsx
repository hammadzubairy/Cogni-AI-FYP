import { clampPct } from '../utils/format'
import { pctColor } from '../utils/status'

/** Progress bar matching v7 `bar(v)`. */
export default function ScoreBar({ value, color }) {
  const pct = clampPct(value)
  const bg = color || pctColor(pct)
  return (
    <div className="bar" aria-hidden="true">
      <i style={{ width: `${pct}%`, background: bg }} />
    </div>
  )
}
