import { useCallback, useEffect, useRef, useState } from 'react'

const BLUR_DEBOUNCE_MS = 500
const LEAVE_COOLDOWN_MS = 800

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
 * Hard fullscreen exam lock: no strike/violation UI.
 * Leaving fullscreen, the tab, or the window calls onLeave once (exit confirm).
 */
export default function useExamLock({ active, onLeave }) {
  const [outOfLock, setOutOfLock] = useState(false)

  const activeRef = useRef(active)
  const armedRef = useRef(false)
  const blurTimerRef = useRef(null)
  const onLeaveRef = useRef(onLeave)
  const ignoringFsExitRef = useRef(false)
  const leaveFiredRef = useRef(false)
  const lastLeaveAtRef = useRef(0)
  const eventsRef = useRef([])

  useEffect(() => {
    activeRef.current = active
  }, [active])
  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])

  const signalLeave = useCallback((type) => {
    if (!activeRef.current || !armedRef.current) return
    if (leaveFiredRef.current) return
    const nowMs = Date.now()
    if (nowMs - lastLeaveAtRef.current < LEAVE_COOLDOWN_MS) return
    lastLeaveAtRef.current = nowMs
    leaveFiredRef.current = true
    const at = new Date().toISOString()
    eventsRef.current = [...eventsRef.current, { type, at }]
    setOutOfLock(true)
    onLeaveRef.current?.({ type, at })
  }, [])

  const reenterFullscreen = useCallback(async () => {
    if (!activeRef.current) return false
    try {
      ignoringFsExitRef.current = true
      await requestExamFullscreen()
      leaveFiredRef.current = false
      setOutOfLock(false)
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
    leaveFiredRef.current = false
    setOutOfLock(false)
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
  }, [])

  const getIntegrityPayload = useCallback(
    () => ({
      violation_count: 0,
      integrity_events: eventsRef.current,
    }),
    [],
  )

  useEffect(() => {
    if (!active) {
      disarm()
      return undefined
    }

    armedRef.current = false
    leaveFiredRef.current = false
    const armTimer = window.setTimeout(() => {
      armedRef.current = true
      if (!isFullscreen()) {
        signalLeave('fullscreen_exit')
      }
    }, 600)

    const onVisibility = () => {
      if (!armedRef.current || !activeRef.current) return
      if (document.visibilityState === 'hidden') {
        signalLeave('tab_hide')
      }
    }

    const onBlur = () => {
      if (!armedRef.current || !activeRef.current) return
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      blurTimerRef.current = window.setTimeout(() => {
        blurTimerRef.current = null
        if (!activeRef.current || !armedRef.current) return
        if (document.visibilityState === 'hidden') return
        if (!document.hasFocus()) {
          signalLeave('window_blur')
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
        signalLeave('fullscreen_exit')
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
  }, [active, disarm, signalLeave])

  return {
    outOfLock,
    reenterFullscreen,
    disarm,
    getIntegrityPayload,
    isFullscreen,
  }
}
