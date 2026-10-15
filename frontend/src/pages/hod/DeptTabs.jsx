import { useNavigate } from 'react-router-dom'

/** Analytics / Policy sub-tabs (v7 `subTabs` under Department). */
export default function DeptTabs({ current }) {
  const navigate = useNavigate()
  return (
    <nav className="tabs" aria-label="Section">
      <button
        type="button"
        className={current === 'analytics' ? 'on' : ''}
        aria-current={current === 'analytics' ? 'page' : undefined}
        onClick={() => navigate('/app/hod/analytics')}
      >
        Analytics
      </button>
      <button
        type="button"
        className={current === 'policy' ? 'on' : ''}
        aria-current={current === 'policy' ? 'page' : undefined}
        onClick={() => navigate('/app/hod/policy')}
      >
        Policy
      </button>
    </nav>
  )
}
