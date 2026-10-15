import { Icon } from './IconSprite'
import { useModal } from './Modal'

/**
 * Promise-based confirm dialog replacing `window.confirm`.
 * Returns true if the user confirms, false if cancelled/dismissed.
 *
 * confirmModal({ title, body, ok, cancel, tone: 'bad'|'good'|undefined })
 */
export function useConfirm() {
  const { openModal, closeModal } = useModal()

  return function confirmModal(options = {}) {
    const {
      title = 'Are you sure?',
      body = '',
      ok = 'Confirm',
      cancel = 'Cancel',
      tone,
    } = options

    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        closeModal()
        resolve(value)
      }

      const okClass =
        tone === 'bad' ? 'bad solid' : tone === 'good' ? 'good' : 'primary'

      openModal(
        <>
          <h3>
            {tone === 'bad' ? (
              <span style={{ color: 'var(--color-destructive)' }}>
                <Icon name="warn" />
              </span>
            ) : null}
            {title}
          </h3>
          {body ? <p className="small">{body}</p> : null}
          <div className="acts">
            <button type="button" className="btn" onClick={() => finish(false)}>
              {cancel}
            </button>
            <button type="button" className={`btn ${okClass}`} onClick={() => finish(true)}>
              {ok}
            </button>
          </div>
        </>,
        {
          onClose: () => {
            if (!settled) {
              settled = true
              resolve(false)
            }
          },
        },
      )
    })
  }
}
