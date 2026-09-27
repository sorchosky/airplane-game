import { Box3, Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { ARCH_OPENING, WATERFALL_CLIFF } from '../landmarks'
import { buildArch } from './arch'
import { prism, sweep } from './kit'
import { buildRuins } from './ruins'
import { buildTower } from './tower'
import { buildTree } from './tree'
import { buildWaterfall } from './waterfall'

function bounds(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) throw new Error('no bounds')
  return box
}

/** Share of triangles whose face normal points away from `center` (0..1). */
function outwardShare(geometry: BufferGeometry, center: (p: Vector3) => Vector3): number {
  const position = geometry.getAttribute('position')
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  let outward = 0
  let counted = 0
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    const normal = new Vector3().subVectors(c, b).cross(new Vector3().subVectors(a, b))
    const mid = a.clone().add(b).add(c).divideScalar(3)
    const away = mid.clone().sub(center(mid))
    // Caps face along the axis; only the sides say which way the winding runs.
    if (Math.abs(normal.clone().normalize().dot(away.clone().normalize())) < 0.5) continue
    counted++
    if (normal.dot(mid.clone().sub(center(mid))) > 0) outward++
  }
  return outward / counted
}

describe('landmark models', () => {
  const models: [string, BufferGeometry][] = [
    ['tower', buildTower(5)],
    ['arch', buildArch(5)],
    ['tree', buildTree(5)],
    ['ruins', buildRuins()],
    ['waterfall', buildWaterfall(40, 12, 5).cliff],
  ]

  it('are mergeable: non-indexed, with position, normal and colour', () => {
    for (const [, geometry] of models) {
      expect(geometry.index).toBeNull()
      for (const name of ['position', 'normal', 'color']) {
        expect(geometry.getAttribute(name).count).toBe(geometry.getAttribute('position').count)
      }
    }
  })

  it('stay low-poly (under 3k triangles each)', () => {
    for (const [, geometry] of models) {
      expect(geometry.getAttribute('position').count / 3).toBeLessThan(3000)
    }
  })

  it('reach below the foundation depth so uneven ground never shows a gap', () => {
    for (const [name, geometry] of models) {
      if (name === 'ruins') continue
      expect(bounds(geometry).min.y).toBeLessThan(-5)
    }
  })

  it('stand as tall as their silhouettes are meant to', () => {
    expect(bounds(buildTower(0)).max.y).toBeCloseTo(210, 0)
    expect(bounds(buildTree(0)).max.y).toBeGreaterThan(110)
    expect(bounds(buildWaterfall(40, 12, 0).cliff).max.y).toBeGreaterThanOrEqual(
      WATERFALL_CLIFF.height,
    )
  })

  it('leave the arch opening clear to fly through', () => {
    const arch = buildArch(0)
    const position = arch.getAttribute('position')
    const p = new Vector3()
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i)
      // No vertex inside the clear half-ellipse (the stone's jitter is allowed a few metres).
      const rx = p.x / (ARCH_OPENING.span / 2 - 6)
      const ry = p.y / (ARCH_OPENING.clearance - 6)
      const inside = p.y > 0 && rx * rx + ry * ry < 1
      expect(inside).toBe(false)
    }
  })

  it('wind prisms and sweeps outward, so the toon side is the outside', () => {
    const column = prism({
      color: '#808080',
      radiusTop: 2,
      radiusBottom: 2,
      bottom: 0,
      top: 10,
      sides: 6,
    })
    expect(outwardShare(column, (m) => new Vector3(0, m.y, 0))).toBeGreaterThan(0.99)
    const tube = sweep(
      [new Vector3(0, 0, 0), new Vector3(0, 10, 0), new Vector3(0, 20, 0)],
      [2, 2, 2],
      6,
      { color: '#808080' },
    )
    expect(outwardShare(tube, (m) => new Vector3(0, m.y, 0))).toBeGreaterThan(0.99)
  })

  it('pours the ribbon from the lip down to the lake', () => {
    const { ribbon, plunge } = buildWaterfall(40, 12, 5)
    const box = bounds(ribbon)
    expect(box.max.y).toBeGreaterThan(WATERFALL_CLIFF.height)
    expect(box.min.y).toBeLessThanOrEqual(plunge[1])
    expect(box.min.z).toBeCloseTo(plunge[2], 0)
  })
})
