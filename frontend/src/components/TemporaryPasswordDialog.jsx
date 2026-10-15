import { useState } from 'react'
/**
 * One-time temporary password disclosure (admin create / reset).
 * Caller must not close until the user confirms they saved the password.
 */
export default function TemporaryPasswordDialog({
  title = 'Temporary password',
  userLabel,
  temporaryPassword,
  onClose,
}) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <h3>{title}</h3>
      {userLabel ? (
        <p className="small" style={{ marginTop: 0 }}>
          {userLabel}
        </p>
      ) : null}
      <p className="small">
        Share this password securely. It is shown only once. They must change it on first sign-in.
      </p>
      <div
        className="callout blue"
        style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        <span className="mono" style={{ fontSize: 16, letterSpacing: '0.04em' }}>
          {temporaryPassword}
        </span>
        <button type="button" className="btn small" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy password'}
        </button>
      </div>
      <label className="apopt" style={{ marginTop: 16 }}>
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <span>
          <b>I have saved this password</b>
          <small>Required before you can close this dialog.</small>
        </span>
      </label>
      <div className="acts">
        <button
          type="button"
          className="btn primary"
          disabled={!saved}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </>
  )
}
