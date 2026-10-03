import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { seededElapsed } from './castClock'
import { shouldDrawFrame } from './screens/titleIntro'

/**
 * Frame cap (#27). Mount inside the `<Canvas>` only while the Canvas runs
 * `frameloop="never"`: this drives it, drawing at most `fps` times a second so the screen
 * mirror's encoder has the rest of the phone's time. `advance` runs every `useFrame` subscriber,
 * the same as the default loop does.
 */
export function CastFrameLoop({ fps }: { fps: number }) {
  const advance = useThree((s) => s.advance)
  const clock = useThree((s) => s.clock)

  useEffect(() => {
    let frame = 0
    let last = -Infinity
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (!shouldDrawFrame(now, last, fps)) return
      last = now
      const seconds = now / 1000
      // `advance` measures the frame from `clock.elapsedTime`, which R3F zeroes when the cap
      // turns on mid-flight. Seeded here, the first capped frame is a frame, not the page uptime.
      clock.elapsedTime = seededElapsed(seconds, clock.elapsedTime)
      advance(seconds)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [advance, clock, fps])

  return null
}
