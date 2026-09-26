import { useEffect, useState } from 'react'
import { INITIAL_THERMAL_WATCH, stepThermalWatch } from '../app/robustness'
import { usePerfStore } from '../debug/perfStore'
import { color, space, type } from '../styles/tokens'
import { copy } from './copy'

/** How long the caption stays up. */
const SHOW_MS = 6000

/** Once per page load, across flights: the phone doesn't cool down between them. */
let warnedThisSession = false

/**
 * "Your phone is getting warm", once, when frame times stay slow on the lowest tier (#61): the
 * only proxy the browser offers for thermal throttling. Reads the perf probe's once-a-second
 * summary; re-renders React only to show and hide the caption.
 */
export function WarmCaption() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (warnedThisSession) return
    let watch = INITIAL_THERMAL_WATCH
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = usePerfStore.subscribe((perf, previous) => {
      // The probe publishes a new summary about once a second; skip unrelated store writes.
      if (perf.p95Ms === previous.p95Ms && perf.tier === previous.tier) return
      const result = stepThermalWatch(watch, {
        p95Ms: perf.p95Ms,
        tier: perf.tier,
        nowMs: performance.now(),
      })
      watch = result.state
      if (!result.warn) return
      warnedThisSession = true
      unsubscribe()
      setShown(true)
      hideTimer = setTimeout(() => setShown(false), SHOW_MS)
    })
    return () => {
      unsubscribe()
      clearTimeout(hideTimer)
    }
  }, [])

  if (!shown) return null
  return (
    <p
      role="status"
      data-testid="warm-caption"
      style={{
        position: 'absolute',
        top: space.xl,
        left: '50%',
        transform: 'translateX(-50%)',
        margin: 0,
        padding: `${space.sm} ${space.lg}`,
        borderRadius: space.md,
        background: color.surfaceHud,
        color: color.textPrimary,
        fontFamily: type.fontBody,
        fontSize: type.tvBody,
        whiteSpace: 'nowrap',
      }}
    >
      {copy.hud.warm}
    </p>
  )
}
