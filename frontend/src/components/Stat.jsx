/** Stat card matching v7 `stat(l, v, d, c)`. */
export default function Stat({ label, value, detail, color }) {
  return (
    <div className="panel stat">
      <div className="l">{label}</div>
      <div className="v num" style={color ? { color } : undefined}>
        {value}
      </div>
      {detail != null && detail !== '' ? <div className="d">{detail}</div> : null}
    </div>
  )
}
