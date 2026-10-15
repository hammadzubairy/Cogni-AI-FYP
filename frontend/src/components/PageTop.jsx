/** Page header matching v7 `pageTop(crumb, title, acts)`. */
export default function PageTop({ crumb, title, actions }) {
  return (
    <div className="topbar">
      <div>
        {crumb ? <div className="crumb">{crumb}</div> : null}
        {title != null ? (typeof title === 'string' ? <h1>{title}</h1> : title) : null}
      </div>
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  )
}
