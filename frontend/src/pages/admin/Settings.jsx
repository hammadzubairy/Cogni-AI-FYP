import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import { useToast } from '../../components/Toast'
import { formatRelativeTime } from '../../utils/format'
import SettingsTabs from './SettingsTabs'

/**
 * Admin settings + activity log (v7 `P['a-settings']` / `P['a-audit']`).
 */
export default function Settings() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'activity' ? 'activity' : 'general'
  const toast = useToast()

  const [settings, setSettings] = useState(null)
  const [approval, setApproval] = useState('major')
  const [maxMb, setMaxMb] = useState(10)
  const [thr, setThr] = useState(70)
  const [institutionName, setInstitutionName] = useState('')
  const [currentTerm, setCurrentTerm] = useState('')
  const [studentSignup, setStudentSignup] = useState(true)
  const [activity, setActivity] = useState([])
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'activity') {
        const log = await api.listAdminActivity({
          role: roleFilter || undefined,
          limit: 100,
        })
        setActivity(log || [])
      } else {
        const s = await api.getAdminSettings()
        setSettings(s)
        setApproval(s.approval)
        setMaxMb(s.max_upload_mb)
        setThr(s.ai_threshold_default)
        setInstitutionName(s.institution_name || '')
        setCurrentTerm(s.current_term || '')
        setStudentSignup(s.student_signup_enabled !== false)
      }
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [tab, roleFilter])

  useEffect(() => {
    load()
  }, [load])

  async function onSave() {
    const next = {}
    const mb = Number(maxMb)
    const t = Number(thr)
    if (!(mb >= 1)) next.mb = 'Enter a size of at least 1 MB'
    if (!(t >= 50 && t <= 95)) next.thr = 'Enter a threshold between 50 and 95'
    setFieldErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const updated = await api.putAdminSettings({
        approval,
        max_upload_mb: Math.round(mb),
        ai_threshold_default: Math.round(t),
        institution_name: institutionName.trim(),
        current_term: currentTerm.trim(),
        student_signup_enabled: studentSignup,
      })
      setSettings(updated)
      toast('Settings saved')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save settings.', {
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ShellLoading label="Loading settings…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load settings.'} onRetry={load} />
    )
  }

  return (
    <>
      <PageTop
        title="Settings"
        actions={
          tab === 'general' ? (
            <button
              type="button"
              className={`btn primary${saving ? ' busy' : ''}`}
              onClick={onSave}
              disabled={saving}
              aria-busy={saving}
            >
              Save settings
            </button>
          ) : null
        }
      />
      <SettingsTabs current={tab === 'activity' ? 'activity' : 'general'} />

      {tab === 'activity' ? (
        <>
          <div className="filters">
            <select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All roles</option>
              {['admin', 'hod', 'teacher', 'student'].map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
            <span className="small">{activity.length} events</span>
          </div>
          <div className="panel">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Role</th>
                    <th>Who</th>
                    <th>What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.length ? (
                    activity.map((l) => (
                      <tr key={l.id}>
                        <td className="small" style={{ whiteSpace: 'nowrap' }}>
                          {formatRelativeTime(l.at)}
                        </td>
                        <td>
                          <span
                            className={`portal r-${l.role === 'system' ? 'admin' : l.role}`}
                            style={{ margin: 0 }}
                          >
                            {String(l.role || '').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <b>{l.actor_name}</b>
                        </td>
                        <td>{l.text}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="empty">
                        No activity yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {!activity.length ? (
            <EmptyState panel={false}>No events match this filter.</EmptyState>
          ) : null}
        </>
      ) : (
        <>
          <div className="grid g2e">
            <div className="panel">
              <div className="panel-h">
                <h3>Institution</h3>
              </div>
              <div className="panel-b">
                <Field id="st-inst" label="Institution name">
                  <input
                    id="st-inst"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    disabled={saving}
                    placeholder="Your university or school"
                  />
                </Field>
                <Field id="st-term" label="Current term">
                  <input
                    id="st-term"
                    value={currentTerm}
                    onChange={(e) => setCurrentTerm(e.target.value)}
                    disabled={saving}
                    placeholder="e.g. Autumn term"
                  />
                </Field>
                <label className="apopt">
                  <input
                    type="checkbox"
                    checked={studentSignup}
                    onChange={(e) => setStudentSignup(e.target.checked)}
                    disabled={saving}
                  />
                  <span>
                    <b>Allow student self-signup</b>
                    <small>
                      When on, students can create an account (email verification required). Teachers,
                      HODs and admins are always added by an admin. When off, only admins can add
                      users.
                    </small>
                  </span>
                </label>
              </div>
            </div>
            <div className="panel">
              <div className="panel-h">
                <h3>Approval workflow</h3>
              </div>
              <div className="panel-b">
                <Field id="st-appr" label="HOD approval required for">
                  <select
                    id="st-appr"
                    value={approval}
                    onChange={(e) => setApproval(e.target.value)}
                    disabled={saving}
                  >
                    <option value="all">All papers, including quizzes</option>
                    <option value="major">Midterms and finals only</option>
                    <option value="none">No papers (teachers publish directly)</option>
                  </select>
                </Field>
                <Field id="st-mb" label="Max upload size (MB)" error={fieldErrors.mb}>
                  <input
                    id="st-mb"
                    type="number"
                    min={1}
                    value={maxMb}
                    onChange={(e) => setMaxMb(e.target.value)}
                    disabled={saving}
                  />
                </Field>
              </div>
            </div>
            <div className="panel">
              <div className="panel-h">
                <h3>Academic integrity</h3>
              </div>
              <div className="panel-b">
                <Field
                  id="st-thr"
                  label="Default AI-writing flag threshold for new exams (%)"
                  error={fieldErrors.thr}
                >
                  <input
                    id="st-thr"
                    type="number"
                    min={50}
                    max={95}
                    step={5}
                    value={thr}
                    onChange={(e) => setThr(e.target.value)}
                    disabled={saving}
                  />
                </Field>
                <Field id="st-pen" label="AI flags change grades">
                  <select id="st-pen" disabled>
                    <option>Never automatically. Teacher review only.</option>
                  </select>
                </Field>
                <p className="small">
                  This rule is locked: detectors misread non-native English more often, so a
                  person always decides.
                </p>
              </div>
            </div>
          </div>
          {!settings ? (
            <EmptyState>Settings could not be loaded.</EmptyState>
          ) : null}
        </>
      )}
    </>
  )
}
