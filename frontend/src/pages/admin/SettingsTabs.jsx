import { useNavigate } from 'react-router-dom'

/** Settings / Activity log sub-tabs (v7 `subTabs`). */
export default function SettingsTabs({ current }) {
  const navigate = useNavigate()
  return (
    <nav className="tabs" aria-label="Section">
      <button
        type="button"
        className={current === 'general' ? 'on' : ''}
        aria-current={current === 'general' ? 'page' : undefined}
        onClick={() => navigate('/app/admin/settings')}
      >
        General
      </button>
      <button
        type="button"
        className={current === 'activity' ? 'on' : ''}
        aria-current={current === 'activity' ? 'page' : undefined}
        onClick={() => navigate('/app/admin/settings?tab=activity')}
      >
        Activity log
      </button>
    </nav>
  )
}
