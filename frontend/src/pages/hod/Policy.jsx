import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { redirectIfForbiddenRole } from '../../auth/redirectIfForbiddenRole'
import { ShellError, ShellLoading } from '../../components/AppShell'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import { useToast } from '../../components/Toast'
import { APPROVAL_LABELS } from '../../utils/hod'
import DeptTabs from './DeptTabs'

/**
 * Department policy (v7 `P['h-policy']` + ACT pol-save).
 */
export default function Policy() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [policy, setPolicy] = useState(null)
  const [settings, setSettings] = useState(null)
  const [deptName, setDeptName] = useState('your department')
  const [minClo, setMinClo] = useState(2)
  const [higher, setHigher] = useState(25)
  const [repeat, setRepeat] = useState(2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, st] = await Promise.all([
        api.getHodPolicy(),
        api.getAdminSettings().catch(() => null),
      ])
      setPolicy(p)
      setMinClo(p.min_clo ?? 0)
      setHigher(p.higher_order_pct ?? 0)
      setRepeat(p.max_repeats ?? 0)
      setSettings(st)
      if (user?.dept_name) setDeptName(user.dept_name)
    } catch (err) {
      if (await redirectIfForbiddenRole(err, { refreshUser, navigate })) return
      setError(err)
      setPolicy(null)
    } finally {
      setLoading(false)
    }
  }, [user?.id, user?.email, user?.dept_name, refreshUser, navigate])

  useEffect(() => {
    load()
  }, [load])

  const onSave = async () => {
    setSaving(true)
    try {
      const body = {
        min_clo: Math.max(0, Number(minClo) || 0),
        higher_order_pct: Math.max(0, Math.min(100, Number(higher) || 0)),
        max_repeats: Math.max(0, Number(repeat) || 0),
      }
      const saved = await api.putHodPolicy(body)
      setPolicy(saved)
      setMinClo(saved.min_clo)
      setHigher(saved.higher_order_pct)
      setRepeat(saved.max_repeats)
      toast('Policy saved. Teachers notified.')
    } catch (err) {
      toast(err.message || 'Could not save policy.', { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ShellLoading label="Loading policy…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Could not load policy.'} onRetry={load} />
    )
  }
  if (!policy) {
    return <ShellError message="Policy not found." onRetry={load} />
  }

  const approvalKey = settings?.approval
  const approvalLabel = APPROVAL_LABELS[approvalKey] || 'configured by your admin'
  const threshold = settings?.ai_threshold_default

  return (
    <>
      <PageTop
        crumb="Applied automatically to every paper sent for approval"
        title="Department"
        actions={
          <button type="button" className="btn primary" onClick={onSave} disabled={saving}>
            Save policy
          </button>
        }
      />
      <DeptTabs current="policy" />

      <div className="grid g2e">
        <Panel title="Coverage rules">
          <Field id="p-clo" label="Minimum questions per CLO">
            <input
              id="p-clo"
              type="number"
              min={0}
              value={minClo}
              onChange={(e) => setMinClo(e.target.value)}
            />
          </Field>
          <Field
            id="p-hi"
            label="Minimum higher-order questions (Analyze and above), %"
          >
            <input
              id="p-hi"
              type="number"
              min={0}
              max={100}
              value={higher}
              onChange={(e) => setHigher(e.target.value)}
            />
          </Field>
          <Field id="p-rep" label="Maximum questions repeated from earlier papers">
            <input
              id="p-rep"
              type="number"
              min={0}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
        </Panel>

        <Panel title="Set by your admin">
          <div className="pol">
            <span className="ic ok" aria-hidden="true">
              <Icon name="check" />
            </span>
            <span>
              HOD approval required for: <b>{approvalLabel}</b>
            </span>
          </div>
          <div className="pol">
            <span className="ic ok" aria-hidden="true">
              <Icon name="check" />
            </span>
            <span>
              Default AI-writing flag threshold:{' '}
              <b>{threshold != null ? `${threshold}%` : 'set by admin'}</b>
            </span>
          </div>
          <div className="pol">
            <span className="ic ok" aria-hidden="true">
              <Icon name="check" />
            </span>
            <span>
              AI flags change grades: <b>never automatically</b>
            </span>
          </div>
          <p className="small">
            Changes here notify every teacher in {deptName} and apply to the next paper they
            submit.
          </p>
        </Panel>
      </div>
    </>
  )
}
