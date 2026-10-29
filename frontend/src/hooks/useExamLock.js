import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_EXAM_VIOLATIONS = 3
const BLUR_DEBOUNCE_MS = 500
const VIOLATION_COOLDOWN_MS = 1200

function isFullscreen() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement,
  )
}

export async function requestExamFullscreen(el = document.documentElement) {
  const target = el || document.documentElement
  if (isFullscreen()) return true
  const req =
    target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.msRequestFullscreen
  if (!req) {
    throw new Error('Fullscreen is not supported in this browser.')
  }
  await req.call(target)
  return true
}

export async function exitExamFullscreen() {
  if (!isFullscreen()) return
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen
  if (exit) {
    try {
      await exit.call(document)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Browser exam lockdown: fullscreen + tab/window leave detection.
 * Counts violations; at MAX_EXAM_VIOLATIONS calls onMaxViolations once.
 */
export default function useExamLock({
  active,
  onMaxViolations,
  maxViolations = MAX_EXAM_VIOLATIONS,
}) {
  const [violationCount, setViolationCount] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [lastViolationType, setLastViolationType] = useState(null)
  const [events, setEvents] = useState([])

  const activeRef = useRef(active)
  const countRef = useRef(0)
  const eventsRef = useRef([])
  const blockedRef = useRef(false)
  const armedRef = useRef(false)
  const blurTimerRef = useRef(null)
  const maxFiredRef = useRef(false)
  const onMaxRef = useRef(onMaxViolations)
  const ignoringFsExitRef = useRef(false)
  const lastViolationAtRef = useRef(0)

  useEffect(() => {
    activeRef.current = active
  }, [active])
  useEffect(() => {
    onMaxRef.current = onMaxViolations
  }, [onMaxViolations])

  const recordViolation = useCallback(
    (type) => {
      if (!activeRef.current || maxFiredRef.current) return
      const nowMs = Date.now()
      if (nowMs - lastViolationAtRef.current < VIOLATION_COOLDOWN_MS) {
        setBlocked(true)
        blockedRef.current = true
        return
      }
      lastViolationAtRef.current = nowMs
      const at = new Date().toISOString()
      const nextCount = countRef.current + 1
      countRef.current = nextCount
      const nextEvents = [...eventsRef.current, { type, at }]
      eventsRef.current = nextEvents
      setViolationCount(nextCount)
      setLastViolationType(type)
      setEvents(nextEvents)
      setBlocked(true)
      blockedRef.current = true

      if (nextCount >= maxViolations) {
        maxFiredRef.current = true
        onMaxRef.current?.({
          violationCount: nextCount,
          events: nextEvents,
          type,
        })
      }
    },
    [maxViolations],
  )

  const reenterFullscreen = useCallback(async () => {
    if (!activeRef.current) return false
    try {
      ignoringFsExitRef.current = true
      await requestExamFullscreen()
      setBlocked(false)
      blockedRef.current = false
      // Brief grace so the fullscreenchange from entering does not count.
      window.setTimeout(() => {
        ignoringFsExitRef.current = false
      }, 400)
      return true
    } catch {
      ignoringFsExitRef.current = false
      return false
    }
  }, [])

  const disarm = useCallback(() => {
    activeRef.current = false
    armedRef.current = false
    setBlocked(false)
    blockedRef.current = false
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
  }, [])

  const getIntegrityPayload = useCallback(
    () => ({
      violation_count: countRef.current,
      integrity_events: eventsRef.current,
    }),
    [],
  )

  /* Arm after fullscreen is entered; listen while active */
  useEffect(() => {
    if (!active) {
      disarm()
      return undefined
    }

    armedRef.current = false
    maxFiredRef.current = false
    // Allow a moment for initial fullscreen before counting exits.
    const armTimer = window.setTimeout(() => {
      armedRef.current = true
      if (!isFullscreen()) {
        setBlocked(true)
        blockedRef.current = true
      }
    }, 600)

    const onVisibility = () => {
      if (!armedRef.current || !activeRef.current) return
      if (document.visibilityState === 'hidden') {
        recordViolation('tab_hide')
      }
    }

    const onBlur = () => {
      if (!armedRef.current || !activeRef.current) return
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      blurTimerRef.current = window.setTimeout(() => {
        blurTimerRef.current = null
        if (!activeRef.current || !armedRef.current) return
        if (document.visibilityState === 'hidden') return // already counted as tab_hide
        if (!document.hasFocus()) {
          recordViolation('window_blur')
        }
      }, BLUR_DEBOUNCE_MS)
    }

    const onFocus = () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current)
        blurTimerRef.current = null
      }
    }

    const onFsChange = () => {
      if (!armedRef.current || !activeRef.current) return
      if (ignoringFsExitRef.current) return
      if (!isFullscreen()) {
        recordViolation('fullscreen_exit')
      }
    }

    const onContextMenu = (e) => {
      if (!activeRef.current) return
      e.preventDefault()
    }

    const onKeyDown = (e) => {
      if (!activeRef.current) return
      const key = e.key?.toLowerCase?.() || ''
      const meta = e.metaKey || e.ctrlKey
      if (meta && ['c', 'v', 'x', 'p', 'u', 's'].includes(key)) {
        e.preventDefault()
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault()
      }
      if (e.key === 'F12' || (meta && e.shiftKey && ['i', 'j', 'c'].includes(key))) {
        e.preventDefault()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      window.clearTimeout(armTimer)
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [active, disarm, recordViolation])

  return {
    violationCount,
    blocked,
    lastViolationType,
    events,
    maxViolations,
    reenterFullscreen,
    disarm,
    getIntegrityPayload,
    isFullscreen,
  }
}
