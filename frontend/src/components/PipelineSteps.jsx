import { useEffect, useRef, useState } from 'react'
import { Icon } from './IconSprite'

const DONE_PAUSE_MS = 250

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * LLM pipeline progress. While work runs, steps show indeterminate "Working…"
 * (no fake per-step durations).
 */
export default function PipelineSteps({
  steps = [],
  promise = null,
  minDisplayMs = 2400,
  onDone,
  onError,
  readyLabel = 'Ready',
}) {
  const [status, setStatus] = useState(readyLabel)
  const [working, setWorking] = useState(false)
  const [done, setDone] = useState(false)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  onDoneRef.current = onDone
  onErrorRef.current = onError

  useEffect(() => {
    if (promise == null) {
      setStatus(readyLabel)
      setWorking(false)
      setDone(false)
      return undefined
    }

    let cancelled = false
    const started = Date.now()

    async function run() {
      setWorking(true)
      setDone(false)
      setStatus('Working…')

      let result
      let err
      try {
        result = await promise
      } catch (e) {
        err = e
      }

      if (cancelled) return

      const elapsed = Date.now() - started
      if (elapsed < minDisplayMs) await delay(minDisplayMs - elapsed)
      if (cancelled) return

      setWorking(false)
      setDone(true)
      setStatus('Done')
      await delay(DONE_PAUSE_MS)
      if (cancelled) return

      if (err) onErrorRef.current?.(err)
      else onDoneRef.current?.(result)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [promise, minDisplayMs, readyLabel])

  const progress = working ? 45 : done ? 100 : 0

  return (
    <div className="pipe">
      <div className="pprog" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
      <span className="sr-only" role="status">
        {status}
      </span>
      {steps.map((label, i) => {
        let cls = 'st wait'
        let dotCls = 'dot'
        let dotInner = null
        if (done) {
          cls = 'st'
          dotCls = 'dot ok'
          dotInner = <Icon name="check" />
        } else if (working) {
          cls = 'st'
          dotCls = 'dot run'
        }
        return (
          <div key={i} className={cls}>
            <span className={dotCls} aria-hidden="true">
              {dotInner}
            </span>
            <span>{label}</span>
            <span className="small mono">{working ? 'Working…' : done ? 'Done' : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

export const DEFAULT_GEN_STEPS = [
  'Retrieve topic chunks from material',
  'Generate questions per topic',
  'Check each question is answerable from source',
  'Verify MCQ distractors are wrong',
  'Confirm Bloom level with a second check',
  'Remove duplicates and assemble paper',
]
