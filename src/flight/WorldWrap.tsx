import { useFrame } from '@react-three/fiber'
import { wrapWorld } from './flightStore'

/**
 * Wraps the plane round the world (#177) at the very start of each frame: priority -1 runs before
 * every other `useFrame` (all at 0), and a negative priority leaves React Three Fiber's own render
 * call in place. Everything after it this frame sees the plane on one side of the seam.
 */
export function WorldWrap() {
  useFrame(() => {
    wrapWorld()
  }, -1)
  return null
}
