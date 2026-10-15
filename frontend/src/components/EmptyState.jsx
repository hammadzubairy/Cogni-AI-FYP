import { Illo } from './IconSprite'

/** Empty / not-found panel matching v7 `.panel.empty` / `.empty`. */
export default function EmptyState({ children, panel = true, illo = false }) {
  const body = (
    <>
      {illo ? <Illo name="empty" /> : null}
      {children}
    </>
  )
  if (panel) return <div className="panel empty">{body}</div>
  return <div className="empty">{body}</div>
}
