import { useEffect, useRef } from 'react'
import { CLOUD_BURST, veilOpacity } from '../world/cloudMath'
import { useCloudStore } from '../world/cloudStore'
import { activeLighting } from '../world/lightingPreset'

/**
 * The fly-through screen veil (#70, `docs/art-bible.md` §7): a `cloud-top` wash that flashes to
 * 30% and fades over 0.4 s each time the plane punches into a cumulus. A DOM layer over the canvas,
 * so it costs no draw call. Animated by writing opacity straight to the element, never as React
 * state.
 */
export function CloudVeil() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const unsubscribe = useCloudStore.subscribe((cloud, previous) => {
      if (cloud.bursts === previous.bursts) return
      cancelAnimationFrame(frame)
      const start = performance.now()
      const tick = (now: number) => {
        const age = (now - start) / 1000
        const el = ref.current
        if (el) el.style.opacity = String(veilOpacity(age))
        if (age < CLOUD_BURST.veilDuration) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      ref={ref}
      data-testid="cloud-veil"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        background: activeLighting().cloudLight,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
