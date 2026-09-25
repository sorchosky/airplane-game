import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { usePerfStore } from './perfStore'

/** s over which fps is averaged, so the readout is steady enough to read */
const SAMPLE_WINDOW = 0.5

/**
 * Mount inside the `<Canvas>`. Averages fps and copies the renderer's draw call and triangle
 * counts into `perfStore`. `gl.info` still holds the previous frame's numbers when `useFrame`
 * runs, which is what we want: a whole frame's worth.
 */
export function PerfProbe() {
  const elapsed = useRef(0)
  const frames = useRef(0)

  useFrame(({ gl }, delta) => {
    elapsed.current += delta
    frames.current += 1
    if (elapsed.current < SAMPLE_WINDOW) return
    usePerfStore.setState({
      fps: frames.current / elapsed.current,
      frameMs: (elapsed.current / frames.current) * 1000,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    })
    elapsed.current = 0
    frames.current = 0
  })

  return null
}
