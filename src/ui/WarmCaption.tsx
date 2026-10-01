import { useEffect, useState } from 'react'
import { INITIAL_THERMAL_WATCH, stepThermalWatch } from '../app/robustness'
import { usePerfStore } from '../debug/perfStore'
import { useThermalStore } from '../debug/thermalStore'
import {
  classifyWarm,
  formatTrace,
  pushTraceSample,
  type ThermalTraceSample,
} from '../debug/thermalTrace'
import { useQualityStore } from '../render/qualityStore'
import { color, effect, space, type } from '../styles/tokens'
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
    let trace: ThermalTraceSample[] = []
    const mountedMs = performance.now()
    useThermalStore.setState({ overForMs: 0, fired: null })
    const unsubscribe = usePerfStore.subscribe((perf, previous) => {
      // The probe publishes a new summary about once a second; skip unrelated store writes.
      if (perf.p95Ms === previous.p95Ms && perf.tier === previous.tier) return
      const nowMs = performance.now()
      const result = stepThermalWatch(watch, { p95Ms: perf.p95Ms, tier: perf.tier, nowMs })
      watch = result.state
      const sample: ThermalTraceSample = {
        atMs: nowMs - mountedMs,
        frameMs: perf.frameMs,
        p95Ms: perf.p95Ms,
        p99Ms: perf.p99Ms,
        tier: perf.tier,
        rung: useQualityStore.getState().rung + 1,
        dpr: perf.dpr,
      }
      trace = pushTraceSample(trace, sample)
      useThermalStore.setState({
        overForMs: watch.overSinceMs === null ? 0 : nowMs - watch.overSinceMs,
      })
      if (!result.warn) return
      const cause = classifyWarm(sample)
      useThermalStore.setState({ fired: { sample, cause } })
      console.info(`[warm-caption] fired, likely ${cause}\n${formatTrace(trace)}`)
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
        textShadow: effect.textGlow,
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
