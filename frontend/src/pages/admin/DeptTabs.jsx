import { useNavigate } from 'react-router-dom'

/** Departments / Classes sub-tabs (v7 `subTabs`). */
export default function DeptTabs({ current }) {
  const navigate = useNavigate()
  return (
    <nav className="tabs" aria-label="Section">
      <button
        type="button"
        className={current === 'depts' ? 'on' : ''}
        aria-current={current === 'depts' ? 'page' : undefined}
        onClick={() => navigate('/app/admin/departments')}
      >
        Departments
      </button>
      <button
        type="button"
        className={current === 'classes' ? 'on' : ''}
        aria-current={current === 'classes' ? 'page' : undefined}
        onClick={() => navigate('/app/admin/departments?tab=classes')}
      >
        Classes
      </button>
    </nav>
  )
}
