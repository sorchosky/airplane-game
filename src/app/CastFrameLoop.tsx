import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { shouldDrawFrame } from './screens/titleIntro'

/**
 * Frame cap (#27). Mount inside the `<Canvas>` only while the Canvas runs
 * `frameloop="never"`: this drives it, drawing at most `fps` times a second so the screen
 * mirror's encoder has the rest of the phone's time. `advance` runs every `useFrame` subscriber,
 * the same as the default loop does.
 */
export function CastFrameLoop({ fps }: { fps: number }) {
  const advance = useThree((s) => s.advance)

  useEffect(() => {
    let frame = 0
    let last = -Infinity
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (!shouldDrawFrame(now, last, fps)) return
      last = now
      advance(now / 1000)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [advance, fps])

  return null
}
