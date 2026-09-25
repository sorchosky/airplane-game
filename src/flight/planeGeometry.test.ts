import { Box3, Vector3, type BufferGeometry } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import { CONTROL_SURFACES, PLANE_DIMENSIONS, buildPlaneGeometry, surfaceId } from './planeGeometry'

const plane = buildPlaneGeometry()
afterAll(() => plane.dispose())

const solids = { body: plane.body, stripe: plane.stripe, metal: plane.metal, glass: plane.glass }

function bounds(...geometries: BufferGeometry[]): Box3 {
  const box = new Box3()
  for (const g of geometries) {
    g.computeBoundingBox()
    if (g.boundingBox) box.union(g.boundingBox)
  }
  return box
}

/** Signed volume of a closed mesh: positive when every face winds outward. */
function signedVolume(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const count = index ? index.count : position.count
  const at = (i: number) => (index ? index.getX(i) : i)
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  let volume = 0
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, at(i))
    b.fromBufferAttribute(position, at(i + 1))
    c.fromBufferAttribute(position, at(i + 2))
    volume += a.dot(b.cross(c)) / 6
  }
  return volume
}

function surfaceIds(geometry: BufferGeometry): Set<number> {
  const surface = geometry.getAttribute('surface')
  const ids = new Set<number>()
  for (let i = 0; i < surface.count; i++) ids.add(surface.getX(i))
  return ids
}

describe('buildPlaneGeometry', () => {
  it('is about 8 m long with an 11 m wingspan, nose toward -Z', () => {
    const box = bounds(plane.body, plane.stripe)
    const size = box.getSize(new Vector3())
    expect(size.z).toBeGreaterThan(7.6)
    expect(size.z).toBeLessThan(8.4)
    expect(size.x).toBeCloseTo(PLANE_DIMENSIONS.wingSpan, 1)
    expect(box.min.z).toBeCloseTo(PLANE_DIMENSIONS.noseZ, 2)
    // The tail, not the nose, is the long end from the center of mass.
    expect(box.max.z).toBeGreaterThan(-box.min.z)
  })

  it('is left-right symmetric about the pivot', () => {
    const box = bounds(...Object.values(solids))
    expect(box.min.x).toBeCloseTo(-box.max.x, 5)
  })

  it('pivots near the center of mass: the wing and main gear straddle it', () => {
    // Center of mass sits near the wing's quarter chord, just ahead of the main wheels.
    const aileron = plane.hinges.aileronRight.origin
    expect(aileron.z).toBeGreaterThan(0)
    expect(plane.propHub.z).toBeLessThan(-2.5)
    const metal = bounds(plane.metal)
    expect(metal.min.z).toBeLessThan(0)
    expect(metal.max.z).toBeGreaterThan(0)
  })

  it('has the high wing above the cabin and the wheels below it', () => {
    const body = bounds(plane.body)
    const glass = bounds(plane.glass)
    expect(PLANE_DIMENSIONS.wingY).toBeGreaterThan(0.6)
    expect(glass.min.y).toBeLessThan(-1.2)
    expect(body.max.y).toBeGreaterThan(1.5) // fin top
  })

  it('gives every mergeable part position, normal and surface attributes', () => {
    for (const g of [...Object.values(solids), plane.blades]) {
      expect(g.getAttribute('position')).toBeDefined()
      expect(g.getAttribute('normal')).toBeDefined()
      expect(g.getAttribute('surface')).toBeDefined()
      expect(g.getAttribute('uv')).toBeUndefined()
    }
  })

  it('winds closed parts outward', () => {
    expect(signedVolume(plane.body)).toBeGreaterThan(0)
    expect(signedVolume(plane.metal)).toBeGreaterThan(0)
    expect(signedVolume(plane.blades)).toBeGreaterThan(0)
  })

  it('puts every control surface in the stripe mesh, and nothing moving elsewhere', () => {
    expect(surfaceIds(plane.stripe)).toEqual(
      new Set([0, ...CONTROL_SURFACES.map((s) => surfaceId(s))]),
    )
    for (const g of [plane.body, plane.metal, plane.glass, plane.blades]) {
      expect(surfaceIds(g)).toEqual(new Set([0]))
    }
  })

  it('gives the wing dihedral', () => {
    const right = plane.hinges.aileronRight
    const left = plane.hinges.aileronLeft
    expect(right.origin.y).toBeGreaterThan(PLANE_DIMENSIONS.wingY)
    expect(left.origin.x).toBeCloseTo(-right.origin.x, 5)
    expect(left.origin.y).toBeCloseTo(right.origin.y, 5)
  })

  it('sizes the prop blades to the disc', () => {
    const blades = bounds(plane.blades)
    expect(blades.max.y).toBeCloseTo(PLANE_DIMENSIONS.propRadius, 2)
    expect(blades.min.y).toBeCloseTo(-PLANE_DIMENSIONS.propRadius, 2)
  })
})
