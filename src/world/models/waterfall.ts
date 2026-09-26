import { BufferAttribute, BufferGeometry } from 'three'
import { color } from '../../styles/tokens'
import { WATERFALL_CLIFF } from '../landmarks'
import { mergeParts, prism } from './kit'

/** Points down the falling ribbon. */
const RIBBON_SEGMENTS = 16

export interface WaterfallModel {
  /** The cliff: toon-shaded stone with a grass lip. Merges with the other landmarks. */
  cliff: BufferGeometry
  /**
   * The falling water, drawn with its own animated material: uv.x runs across (0..1), uv.y is
   * metres fallen from the lip, so the streaks scroll at a steady speed however long the drop.
   */
  ribbon: BufferGeometry
  /** Local position where the fall meets the lake, for the mist. */
  plunge: readonly [number, number, number]
}

/**
 * The waterfall: a tall rock stack at the shore with a grass lip, and a ribbon of water that pours
 * off the front of its top, arcs out and plunges into the lake. Front (the lake side) is local -Z.
 *
 * `plungeDistance` is how far in front of the centre the lake is deep enough to take the fall,
 * `waterDepth` how far below the origin the water surface is, and `foundation` how far below the
 * origin the lowest ground under the stack is.
 */
export function buildWaterfall(
  plungeDistance: number,
  waterDepth: number,
  foundation: number,
): WaterfallModel {
  const height = WATERFALL_CLIFF.height
  // The face stops short of the plunge, so the water falls clear of it.
  const baseRadius = Math.max(20, plungeDistance - 8)
  const topRadius = baseRadius * 0.72
  const bottom = -Math.max(foundation, waterDepth) - 12
  // Wider than it is deep, so it reads as a bluff along the shore, not a chimney.
  const wide = [1.8, 1, 1] as const
  const cliff = mergeParts([
    prism({
      color: color.rockShadow,
      radiusBottom: baseRadius,
      radiusTop: baseRadius * 0.9,
      bottom,
      top: height * 0.35,
      sides: 7,
      jitter: 3,
      seed: 31,
      scale: wide,
    }),
    prism({
      color: color.rock,
      radiusBottom: baseRadius * 0.9,
      radiusTop: topRadius,
      bottom: height * 0.35,
      top: height,
      sides: 7,
      jitter: 2.5,
      seed: 32,
      scale: wide,
    }),
    // Grass lip with a slight overhang, the way turf hangs over a cliff edge.
    prism({
      color: color.grassLight,
      radiusBottom: topRadius,
      radiusTop: topRadius + 2,
      bottom: height,
      top: height + 3,
      sides: 7,
      jitter: 0.8,
      seed: 33,
      scale: wide,
    }),
    // Lower shoulders stepping down either side, so the skyline steps like a real escarpment.
    ...[-1, 1].map((side, i) =>
      prism({
        color: color.rock,
        radiusBottom: baseRadius * 0.85,
        radiusTop: baseRadius * 0.6,
        bottom,
        top: height * (0.55 - i * 0.12),
        sides: 6,
        jitter: 2.5,
        seed: 34 + i,
        position: [side * baseRadius * 1.9, 0, baseRadius * 0.25],
      }),
    ),
  ])

  // The ribbon: from the lip at `topRadius`, water shoots forward and falls on a parabola to the
  // plunge point on the lake.
  const lip = topRadius - 1
  const drop = height + waterDepth + 2
  const halfWidth = WATERFALL_CLIFF.ribbonWidth / 2
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let fallen = 0
  let previous: [number, number] | null = null
  for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
    const t = i / RIBBON_SEGMENTS
    // Horizontal travel grows linearly with time and the drop with its square, like a jet.
    const forward = lip + (plungeDistance - lip) * t
    const y = height + 1.5 - drop * t * t
    if (previous) fallen += Math.hypot(forward - previous[0], y - previous[1])
    previous = [forward, y]
    // The sheet spreads a little as it falls.
    const w = halfWidth * (1 + 0.35 * t)
    positions.push(-w, y, -forward, w, y, -forward)
    uvs.push(0, fallen, 1, fallen)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const ribbon = new BufferGeometry()
  ribbon.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  ribbon.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  ribbon.setIndex(indices)
  ribbon.computeVertexNormals()

  return { cliff, ribbon, plunge: [0, -waterDepth, -plungeDistance] }
}
