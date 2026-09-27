import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  IcosahedronGeometry,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { color } from '../../styles/tokens'
import type { FoliageKind } from '../scatter'

// Low-poly foliage models (#75), built once from primitives. Each is one geometry with per-vertex
// colour, so a variant is one draw call for the body and one for its outline hull. Unit models:
// the scatter's per-instance scale is applied on top. Base at y = 0; trunks and boulders reach
// below it so an instance on a slope never floats.
//
// Canopies are icosahedron "lumps" with normals pointing straight out from each lump's centre,
// so the toon ramp shades them as soft round blobs rather than faceted crystals.

/** A body to draw and the smoothed-normal copy its outline hull draws. */
export interface FoliageModel {
  body: BufferGeometry
  hull: BufferGeometry
}

function linear(hex: string): Color {
  return new Color(hex)
}

/** Drops attributes the foliage material doesn't use, so parts can be merged. */
function prepare(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  flat.deleteAttribute('uv')
  return flat
}

/** Paints every vertex, blending `bottom` to `top` by how far its normal faces up. */
function paint(geometry: BufferGeometry, bottom: Color, top: Color = bottom): BufferGeometry {
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(normal.count * 3)
  const mixed = new Color()
  for (let i = 0; i < normal.count; i++) {
    const t = Math.min(1, Math.max(0, (normal.getY(i) - 0.2) / 0.7))
    mixed.copy(bottom).lerp(top, t * t * (3 - 2 * t))
    colors[i * 3] = mixed.r
    colors[i * 3 + 1] = mixed.g
    colors[i * 3 + 2] = mixed.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

/** A canopy lump: an icosahedron with normals radiating from its centre. */
function lump(radius: number, x: number, y: number, z: number, squash = 1): BufferGeometry {
  const geometry = prepare(new IcosahedronGeometry(radius, 0))
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i)
    const py = position.getY(i)
    const pz = position.getZ(i)
    const length = Math.hypot(px, py, pz) || 1
    normal.setXYZ(i, px / length, py / length, pz / length)
    position.setXYZ(i, px + x, py * squash + y, pz + z)
  }
  return paint(geometry, linear(color.foliage), linear(color.foliageLight))
}

/** An open-ended trunk from `bottom` to `top`. Never seen from below, so no caps. */
function trunk(radiusTop: number, radiusBottom: number, bottom: number, top: number) {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, top - bottom, 6, 1, true)
  geometry.translate(0, (top + bottom) / 2, 0)
  return paint(prepare(geometry), linear(color.bark))
}

function cone(radius: number, height: number, base: number): BufferGeometry {
  const geometry = new ConeGeometry(radius, height, 7, 1, false)
  geometry.translate(0, base + height / 2, 0)
  return paint(prepare(geometry), linear(color.foliage), linear(color.foliageLight))
}

function model(parts: BufferGeometry[]): FoliageModel {
  const body = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!body) throw new Error('foliage model parts have mismatched attributes')
  body.computeBoundingSphere()
  // Averaged normals, so the hull pushed out along them has no gaps at creases.
  const hull = toCreasedNormals(body, Math.PI)
  return { body, hull }
}

/** Broadleaf tree, about 9.5 m: a trunk and three canopy lumps. */
export function buildRoundTree(): FoliageModel {
  return model([
    trunk(0.28, 0.42, -1, 4.6),
    lump(3.2, 0, 6.3, 0, 0.9),
    lump(2.4, 1.7, 5.1, 0.9, 0.9),
    lump(2.2, -1.4, 5.3, -1.1, 0.9),
  ])
}

/** Conifer, about 11.5 m: a trunk and three stacked cones. For high ground. */
export function buildConifer(): FoliageModel {
  return model([
    trunk(0.22, 0.34, -1, 2.6),
    cone(2.9, 5, 2),
    cone(2.2, 4.2, 4.8),
    cone(1.4, 3.4, 7.6),
  ])
}

/** Bush, about 2.2 m: two squat lumps. */
export function buildBush(): FoliageModel {
  return model([lump(1.3, 0, 0.9, 0, 0.85), lump(1, 0.95, 0.65, 0.45, 0.85)])
}

/** Boulder, about 1.7 m tall above ground: a flattened, knocked-about icosahedron. Faceted. */
export function buildBoulder(): FoliageModel {
  const geometry = prepare(new IcosahedronGeometry(1.2, 0))
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    // A fixed bump per corner (the same corner always gets the same bump, so faces stay closed).
    const bump = 1 + 0.18 * Math.sin(x * 5.1 + y * 3.7 + z * 2.3)
    position.setXYZ(i, x * bump * 1.15, y * bump * 0.75 + 0.45, z * bump)
  }
  geometry.computeVertexNormals()
  return model([paint(geometry, linear(color.rockShadow), linear(color.rock))])
}

export const FOLIAGE_MODEL_BUILDERS: Record<FoliageKind, () => FoliageModel> = {
  round: buildRoundTree,
  conifer: buildConifer,
  bush: buildBush,
  boulder: buildBoulder,
}

/** Triangles in a model, for the budget. */
export function triangleCount(geometry: BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
}

/**
 * One grass card: two crossed 1 m quads, base at y = 0, normals straight up so the grass shades
 * like the ground it grows from. `uv.y` runs 0 at the root to 1 at the tip.
 */
export function buildGrassCard(): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const dx = Math.cos(angle) * 0.5
    const dz = Math.sin(angle) * 0.5
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array(positions.map((_, i) => (i % 3 === 1 ? 1 : 0))), 3),
  )
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  return geometry
}

/** Texels along one edge of the grass blade mask. */
const GRASS_MASK_SIZE = 64

/**
 * Alpha mask of a tuft of blades for the grass cards: tapered blades leaning a little either way,
 * opaque inside. Drawn with `alphaTest`, so edges are crisp, like the rest of the toon look.
 */
export function buildGrassMask(size = GRASS_MASK_SIZE): DataTexture {
  const data = new Uint8Array(size * size * 4)
  const blades = [
    { root: 0.14, lean: -0.08, width: 0.1, height: 0.72 },
    { root: 0.3, lean: 0.06, width: 0.12, height: 0.95 },
    { root: 0.46, lean: -0.04, width: 0.13, height: 0.82 },
    { root: 0.62, lean: 0.1, width: 0.12, height: 1 },
    { root: 0.8, lean: 0.03, width: 0.11, height: 0.68 },
  ]
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const inside = blades.some((blade) => {
        if (v > blade.height) return false
        const t = v / blade.height
        const centre = blade.root + blade.lean * t * t
        return Math.abs(u - centre) < (blade.width / 2) * (1 - t)
      })
      data.fill(inside ? 255 : 0, (y * size + x) * 4, (y * size + x) * 4 + 4)
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}
