import { Vector3, type BufferGeometry } from 'three'
import { color } from '../../styles/tokens'
import { ARCH_OPENING } from '../landmarks'
import { blob, flatGround, mergeParts, sweep, type LocalGround } from './kit'

/** m, the arch's thickness (radius of its cross-section) at the feet and at the crown */
const FOOT_RADIUS = 19
const CROWN_RADIUS = 11
/** Points along the curve; more = rounder span, more triangles. */
const SEGMENTS = 18

/**
 * A natural stone arch big enough to fly through: a rough seven-sided slab swept along a
 * half-ellipse whose inside clears `ARCH_OPENING.span` × `ARCH_OPENING.clearance`, thick at the
 * feet and thin at the crown, with a cap of grass on top. The opening faces local -Z (front).
 */
export function buildArch(foundation: number, ground: LocalGround = flatGround): BufferGeometry {
  const a = ARCH_OPENING.span / 2 + FOOT_RADIUS
  const b = ARCH_OPENING.clearance + CROWN_RADIUS
  const path: Vector3[] = []
  const radius: number[] = []
  // Each foot runs straight down past the lowest ground, so uneven ground never shows a gap.
  const leftFoot = Math.min(ground(-a, 0), 0) - foundation - 8
  const rightFoot = Math.min(ground(a, 0), 0) - foundation - 8
  path.push(new Vector3(-a, leftFoot, 0))
  radius.push(FOOT_RADIUS + 2)
  for (let i = 0; i <= SEGMENTS; i++) {
    const theta = Math.PI - (i / SEGMENTS) * Math.PI
    const t = Math.sin(theta)
    path.push(new Vector3(Math.cos(theta) * a, Math.sin(theta) * b, 0))
    radius.push(FOOT_RADIUS + (CROWN_RADIUS - FOOT_RADIUS) * t * t)
  }
  path.push(new Vector3(a, rightFoot, 0))
  radius.push(FOOT_RADIUS + 2)

  return mergeParts([
    sweep(path, radius, 7, { color: color.rock, depthScale: 1.35, jitter: 2.2, seed: 21 }),
    // Grass and scrub clinging to the crown.
    blob({
      color: color.foliageLight,
      radius: 9,
      detail: 0,
      position: [-6, b + CROWN_RADIUS - 2, 2],
      scale: [1.4, 0.5, 1.2],
      seed: 22,
    }),
    blob({
      color: color.foliage,
      radius: 7,
      detail: 0,
      position: [9, b + CROWN_RADIUS - 3, -3],
      scale: [1.3, 0.55, 1.1],
      seed: 23,
    }),
  ])
}
