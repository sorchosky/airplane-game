import { Vector3, type BufferGeometry } from 'three'
import { color } from '../../styles/tokens'
import { blob, mergeParts, prism, sweep } from './kit'

/** Branches: yaw (radians), height they leave the trunk, and where they end (radius, height). */
const BRANCHES = [
  { yaw: 0.3, from: 46, reach: 30, to: 76 },
  { yaw: 2.4, from: 52, reach: 28, to: 82 },
  { yaw: 4.3, from: 42, reach: 32, to: 70 },
] as const

/**
 * The lone giant tree: a flared trunk, three limbs, and a canopy of big soft clumps, darker
 * underneath and lighter on top. About 120 m tall, so it holds the horizon like a mountain does.
 */
export function buildTree(foundation: number): BufferGeometry {
  const bark = color.bark
  const parts: BufferGeometry[] = [
    // Root flare and trunk.
    prism({
      color: bark,
      radiusBottom: 15,
      radiusTop: 8,
      bottom: -foundation - 6,
      top: 10,
      sides: 7,
      jitter: 1,
      seed: 41,
    }),
    prism({
      color: bark,
      radiusBottom: 8,
      radiusTop: 5,
      bottom: 10,
      top: 72,
      sides: 7,
      jitter: 0.8,
      seed: 42,
    }),
  ]
  for (const [i, branch] of BRANCHES.entries()) {
    const dx = Math.cos(branch.yaw)
    const dz = Math.sin(branch.yaw)
    const path = [
      new Vector3(0, branch.from, 0),
      new Vector3(
        dx * branch.reach * 0.45,
        branch.from + (branch.to - branch.from) * 0.55,
        dz * branch.reach * 0.45,
      ),
      new Vector3(dx * branch.reach, branch.to, dz * branch.reach),
    ]
    parts.push(
      sweep(path, [3.6, 2.6, 1.6], 5, {
        color: bark,
        up: new Vector3(0, 1, 0),
        jitter: 0.4,
        seed: 43 + i,
      }),
    )
    // A clump at each limb's end.
    parts.push(
      blob({
        color: color.foliage,
        radius: 26,
        position: [dx * branch.reach, branch.to + 6, dz * branch.reach],
        scale: [1, 0.72, 1],
        jitter: 2,
        seed: 46 + i,
        smooth: true,
      }),
    )
  }
  parts.push(
    // The crown: one big clump over the trunk, and lighter clumps on top catching the sun.
    blob({
      color: color.foliage,
      radius: 36,
      position: [0, 86, 0],
      scale: [1, 0.7, 1],
      jitter: 2.5,
      seed: 50,
      smooth: true,
    }),
    blob({
      color: color.foliageLight,
      radius: 24,
      position: [-8, 104, 6],
      scale: [1, 0.72, 1],
      jitter: 2,
      seed: 51,
      smooth: true,
    }),
    blob({
      color: color.foliageLight,
      radius: 18,
      position: [14, 100, -10],
      scale: [1, 0.75, 1],
      jitter: 1.5,
      seed: 52,
      smooth: true,
    }),
  )
  return mergeParts(parts)
}
