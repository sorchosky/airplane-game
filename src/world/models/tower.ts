import { BoxGeometry, type BufferGeometry } from 'three'
import { color } from '../../styles/tokens'
import { block, mergeParts, prism } from './kit'

/**
 * The watchtower: a tapered octagonal stone shaft on a stepped base, a flared gallery, an open
 * belfry of four piers and a steep spire. An original silhouette (not a Sheikah tower): it reads
 * at 5 km as a needle with a notch near the top. Origin at ground level, front toward -Z.
 *
 * `foundation` is how far below the origin the base must reach to meet the lowest ground under it.
 */
export function buildTower(foundation: number): BufferGeometry {
  const stone = color.rock
  const trim = color.rockShadow
  const parts: BufferGeometry[] = [
    // Footing and stepped plinth.
    prism({
      color: trim,
      radiusBottom: 27,
      radiusTop: 25,
      bottom: -foundation - 6,
      top: 7,
      sides: 8,
      jitter: 0.8,
      seed: 11,
    }),
    prism({
      color: stone,
      radiusBottom: 22,
      radiusTop: 20,
      bottom: 7,
      top: 20,
      sides: 8,
      jitter: 0.5,
      seed: 12,
    }),
    // The shaft, with two string courses.
    prism({
      color: stone,
      radiusBottom: 16,
      radiusTop: 11,
      bottom: 20,
      top: 148,
      sides: 8,
      jitter: 0.6,
      seed: 13,
    }),
    prism({
      color: trim,
      radiusBottom: 15.8,
      radiusTop: 15.4,
      bottom: 58,
      top: 62,
      sides: 8,
      seed: 14,
    }),
    prism({
      color: trim,
      radiusBottom: 13.4,
      radiusTop: 13,
      bottom: 108,
      top: 112,
      sides: 8,
      seed: 15,
    }),
    // Corbelled gallery.
    prism({
      color: trim,
      radiusBottom: 11,
      radiusTop: 17,
      bottom: 140,
      top: 150,
      sides: 8,
      seed: 16,
    }),
    prism({
      color: stone,
      radiusBottom: 17,
      radiusTop: 17,
      bottom: 150,
      top: 155,
      sides: 8,
      seed: 17,
    }),
  ]
  // Belfry: four piers on the diagonals, so the open sides face the compass points.
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2
    parts.push(
      block(new BoxGeometry(4, 22, 4), {
        color: stone,
        position: [Math.cos(angle) * 9.5, 166, Math.sin(angle) * 9.5],
        rotation: [0, -angle, 0],
      }),
    )
  }
  parts.push(
    prism({
      color: trim,
      radiusBottom: 14,
      radiusTop: 14,
      bottom: 177,
      top: 181,
      sides: 8,
      seed: 18,
    }),
    prism({
      color: color.bark,
      radiusBottom: 13,
      radiusTop: 0.5,
      bottom: 181,
      top: 210,
      sides: 8,
      seed: 19,
    }),
  )
  return mergeParts(parts)
}
