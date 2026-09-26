import { BoxGeometry, type BufferGeometry } from 'three'
import { color } from '../../styles/tokens'
import { block, blob, flatGround, mergeParts, prism, seededRandom, type LocalGround } from './kit'

/** m, how far each piece is sunk into the ground, so a slope never shows under an edge. */
const SINK = 3

/**
 * The ruin cluster: a broken keep with a slanted break, a courtyard of ruined walls with gaps, a
 * colonnade of columns at different broken heights, a fallen column and a gateway, with moss on
 * the tops. Laid out by a seeded random so it's the same every load. Each piece sits on the ground
 * under it (`ground`), since the cluster spans over 200 m.
 */
export function buildRuins(ground: LocalGround = flatGround): BufferGeometry {
  const random = seededRandom(61)
  const stone = color.rock
  const dark = color.rockShadow
  const moss = color.foliage
  const parts: BufferGeometry[] = []
  /** Lowest ground under a set of points, minus the sink. */
  const baseUnder = (...points: [number, number][]) =>
    Math.min(...points.map(([x, z]) => ground(x, z))) - SINK

  // The keep: a hexagonal tower broken off on a slant, with a dark doorway.
  {
    const x = 18
    const z = 10
    const base = baseUnder([x - 13, z], [x + 13, z], [x, z - 13], [x, z + 13])
    const keep = prism({
      color: stone,
      radiusBottom: 14,
      radiusTop: 12,
      bottom: base - 8,
      top: base + 56,
      sides: 6,
      jitter: 0.8,
      seed: 62,
      position: [x, 0, z],
    })
    // Slant the break: top vertices drop the further they are toward +x.
    const position = keep.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > base + 50) {
        position.setY(i, position.getY(i) - ((position.getX(i) - x + 12) / 24) * 22)
      }
    }
    keep.deleteAttribute('normal')
    keep.computeVertexNormals()
    parts.push(keep)
    parts.push(
      block(new BoxGeometry(6, 10, 2), {
        color: color.outline,
        position: [x, ground(x, z - 12) + 3, z - 12.4],
      }),
    )
  }

  // Courtyard walls: a rough rectangle with gaps, each run broken to a jagged top.
  const walls: [number, number, number, number][] = [
    // centre x, centre z, length, yaw
    [-40, -55, 60, 0],
    [40, -58, 44, 0.05],
    [-78, 0, 70, Math.PI / 2],
    [72, 30, 50, Math.PI / 2 + 0.06],
    [-20, 62, 54, -0.04],
  ]
  for (const [i, [cx, cz, length, yaw]] of walls.entries()) {
    const ex = (Math.cos(yaw) * length) / 2
    const ez = (-Math.sin(yaw) * length) / 2
    const base = baseUnder([cx - ex, cz - ez], [cx, cz], [cx + ex, cz + ez])
    const courses = 3
    let runLength = length
    let top = base
    for (let c = 0; c < courses; c++) {
      const h = 5 + random() * 5
      const offset = (random() - 0.5) * (length - runLength)
      parts.push(
        block(new BoxGeometry(runLength, h + (c === 0 ? 6 : 0), 4.5), {
          color: c === 0 ? dark : stone,
          position: [
            cx + Math.cos(yaw) * offset,
            top + (h + (c === 0 ? 6 : 0)) / 2 - (c === 0 ? 6 : 0),
            cz - Math.sin(yaw) * offset,
          ],
          rotation: [0, yaw, 0],
          jitter: 0.3,
          seed: 70 + i * 3 + c,
        }),
      )
      top += h
      runLength *= 0.45 + random() * 0.3
    }
    parts.push(
      blob({
        color: moss,
        radius: 4,
        detail: 0,
        position: [cx, top, cz],
        scale: [1.6, 0.5, 1],
        seed: 90 + i,
      }),
    )
  }

  // Colonnade along the south side: some columns whole with a capital, some snapped off.
  for (let i = 0; i < 7; i++) {
    const x = -60 + i * 14
    const z = -85
    const base = baseUnder([x, z])
    const whole = i % 3 !== 1
    const h = whole ? 24 : 6 + random() * 10
    parts.push(
      prism({
        color: stone,
        radiusBottom: 2.6,
        radiusTop: 2.2,
        bottom: base - 4,
        top: base + h,
        sides: 6,
        seed: 100 + i,
        position: [x, 0, z],
      }),
    )
    if (whole) {
      parts.push(
        block(new BoxGeometry(7, 2.5, 7), { color: dark, position: [x, base + h + 1.2, z] }),
      )
    }
  }
  // A lintel still spanning two of them.
  parts.push(
    block(new BoxGeometry(22, 3, 5), {
      color: stone,
      position: [-53, baseUnder([-60, -85], [-46, -85]) + 28, -85],
      jitter: 0.3,
      seed: 110,
    }),
  )

  // A fallen column lying across the courtyard.
  parts.push(
    prism({
      color: stone,
      radiusBottom: 2.6,
      radiusTop: 2.4,
      bottom: -12,
      top: 12,
      sides: 6,
      seed: 111,
      position: [-20, ground(-20, 20) + 1.2, 20],
      rotation: [Math.PI / 2, 0, 0.7],
    }),
  )

  // The gateway: two piers and a lintel on the approach from the north.
  {
    const z = 95
    const base = baseUnder([-9, z], [9, z])
    for (const x of [-9, 9]) {
      parts.push(
        block(new BoxGeometry(6, 26, 6), {
          color: stone,
          position: [x, base + 13 - 4, z],
          jitter: 0.4,
          seed: 120 + x,
        }),
      )
    }
    parts.push(
      block(new BoxGeometry(26, 4, 7), { color: dark, position: [0, base + 24, z], seed: 123 }),
    )
    parts.push(
      blob({
        color: moss,
        radius: 5,
        detail: 0,
        position: [3, base + 26, z],
        scale: [1.8, 0.45, 1],
        seed: 124,
      }),
    )
  }

  return mergeParts(parts)
}
