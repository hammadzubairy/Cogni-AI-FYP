import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import Field from '../../components/Field'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import ThemePicker from '../../components/ThemePicker'
import { useToast } from '../../components/Toast'

/**
 * Teacher LLM BYOK settings — personal OpenRouter / Groq key for exam generation.
 */
export default function Settings() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [catalog, setCatalog] = useState(null)
  const [provider, setProvider] = useState('platform')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeySet, setApiKeySet] = useState(false)
  const [apiKeyMasked, setApiKeyMasked] = useState(null)
  const [usingPlatform, setUsingPlatform] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await api.getMyLlmSettings()
      setCatalog(s.catalog || null)
      setProvider(s.provider || 'platform')
      setModel(s.model || '')
      setApiKeySet(!!s.api_key_set)
      setApiKeyMasked(s.api_key_masked || null)
      setUsingPlatform(s.using_platform !== false)
      setApiKey('')
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const providerMeta = useMemo(() => {
    const list = catalog?.providers || []
    return list.find((p) => p.id === provider) || list[0] || null
  }, [catalog, provider])

  const models = providerMeta?.models || []
  const needsKey = !!providerMeta?.needs_api_key

  useEffect(() => {
    if (!needsKey) return
    if (model && models.some((m) => m.id === model)) return
    if (models[0]) setModel(models[0].id)
  }, [needsKey, model, models])

  async function onSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        provider,
        model: provider === 'platform' ? '' : model,
      }
      if (needsKey && apiKey.trim()) {
        body.api_key = apiKey.trim()
      }
      const updated = await api.putMyLlmSettings(body)
      setProvider(updated.provider)
      setModel(updated.model || '')
      setApiKeySet(!!updated.api_key_set)
      setApiKeyMasked(updated.api_key_masked || null)
      setUsingPlatform(updated.using_platform !== false)
      setCatalog(updated.catalog || catalog)
      setApiKey('')
      toast('LLM settings saved')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save settings.', {
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  async function onClearKey() {
    setSaving(true)
    try {
      const updated = await api.putMyLlmSettings({
        provider: 'platform',
        model: '',
        clear_api_key: true,
      })
      setProvider(updated.provider)
      setModel('')
      setApiKeySet(false)
      setApiKeyMasked(null)
      setUsingPlatform(true)
      setApiKey('')
      setCatalog(updated.catalog || catalog)
      toast('Switched to platform default and cleared your key')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not clear key.', { type: 'error' })
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
        subtitle="Appearance, plus your exam-generation LLM (platform default or your own key)."
      />

      <div style={{ marginBottom: 16 }}>
        <ThemePicker />
      </div>

      <form className="panel" onSubmit={onSave} style={{ maxWidth: 640 }}>
        <div className="panel-h">
          <h3>Exam generation LLM</h3>
        </div>
        <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="small" style={{ margin: 0, color: 'var(--color-muted-foreground)' }}>
            {usingPlatform
              ? 'Currently using the platform LLM configuration.'
              : `Currently using your ${provider} key${apiKeyMasked ? ` (${apiKeyMasked})` : ''}.`}
          </p>

          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => {
                const next = e.target.value
                setProvider(next)
                const meta = (catalog?.providers || []).find((p) => p.id === next)
                const first = meta?.models?.[0]?.id || ''
                setModel(next === 'platform' ? '' : first)
              }}
            >
              {(catalog?.providers || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          {needsKey ? (
            <>
              <Field label="Model">
                <select value={model} onChange={(e) => setModel(e.target.value)} required>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={apiKeySet ? 'API key (leave blank to keep saved key)' : 'API key'}
                hint={
                  providerMeta?.key_help_url
                    ? `Get a key at ${providerMeta.key_help_url}. Free tiers have rate limits.`
                    : 'Free tiers have rate limits.'
                }
              >
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={apiKeySet ? apiKeyMasked || '•••• saved' : 'Paste API key'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required={!apiKeySet}
                />
              </Field>
            </>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Platform default uses the server LLM (VyceAI Claude Sonnet 4.6) configured by your admin.
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" />
              {saving ? 'Saving…' : 'Save'}
            </button>
            {apiKeySet || provider !== 'platform' ? (
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={onClearKey}
              >
                Clear key / use platform
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </>
  )
}
