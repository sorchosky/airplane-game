export interface RingPointerViewport {
  width: number
  height: number
}

export interface RingPointerResult {
  x: number
  y: number
  angle: number
}

interface WorldPosition {
  x: number
  y: number
  z: number
}

/**
 * Projects a ring into the HUD. `output` lets the frame loop reuse one result object.
 * Matrix elements use Three.js/WebGL column-major order.
 */
export function ringPointerPosition(
  viewProjection: ArrayLike<number>,
  ring: WorldPosition,
  viewport: RingPointerViewport,
  output: RingPointerResult = { x: 0, y: 0, angle: 0 },
): RingPointerResult | null {
  const x = ring.x
  const y = ring.y
  const z = ring.z
  const clipX =
    viewProjection[0]! * x + viewProjection[4]! * y + viewProjection[8]! * z + viewProjection[12]!
  const clipY =
    viewProjection[1]! * x + viewProjection[5]! * y + viewProjection[9]! * z + viewProjection[13]!
  const clipW =
    viewProjection[3]! * x + viewProjection[7]! * y + viewProjection[11]! * z + viewProjection[15]!
  const divisor = Math.max(Math.abs(clipW), Number.EPSILON)
  const projectedX = clipX / divisor
  const projectedY = clipY / divisor

  if (clipW > 0 && Math.abs(projectedX) <= 0.8 && Math.abs(projectedY) <= 0.8) return null

  // A point precisely behind the camera has no screen-space bearing. Point down until turning
  // gives it one, rather than allowing an unstable divide around the centre.
  const directionX = Math.abs(projectedX) < Number.EPSILON ? 0 : projectedX
  const directionY =
    Math.abs(projectedX) < Number.EPSILON && Math.abs(projectedY) < Number.EPSILON ? -1 : projectedY
  const extentX = viewport.width * 0.4
  const extentY = viewport.height * 0.4
  const scale = Math.min(
    directionX === 0 ? Number.POSITIVE_INFINITY : extentX / Math.abs(directionX),
    directionY === 0 ? Number.POSITIVE_INFINITY : extentY / Math.abs(directionY),
  )
  const screenDx = directionX * scale
  const screenDy = -directionY * scale
  output.x = viewport.width * 0.5 + screenDx
  output.y = viewport.height * 0.5 + screenDy
  output.angle = Math.atan2(screenDy, screenDx)
  return output
}
