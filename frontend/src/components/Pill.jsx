import { statusClass, statusLabel } from '../utils/status'

/** Status pill from v7 `ST` / `pill(s)`. Pass `status` or raw `label` + `tone`. */
export default function Pill({ status, label, tone, children, className = '' }) {
  let text = children ?? label
  let cls = tone || ''
  if (status) {
    text = text ?? statusLabel(status)
    cls = statusClass(status)
  }
  return <span className={`pill ${cls} ${className}`.trim()}>{text}</span>
}
