import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural Cessna-172-style high-wing plane, built from lofted cross-sections and merged into
 * one geometry per material so the whole plane costs a handful of draw calls.
 *
 * Nothing here touches React or a renderer: `PlaneModel` renders whatever `buildPlaneGeometry`
 * returns, so a glTF loader producing the same `PlaneGeometry` shape could replace this file.
 *
 * Units are meters. Y up, nose toward -Z, origin at the center of mass (the wing's quarter chord,
 * on the fuselage center line). About 8 m long with an 11 m wingspan.
 */

/** Moving parts. Every vertex carries a `surface` attribute: 0 = static, else this index + 1. */
export const CONTROL_SURFACES = [
  'aileronLeft',
  'aileronRight',
  'elevatorLeft',
  'elevatorRight',
  'rudder',
] as const
export type ControlSurface = (typeof CONTROL_SURFACES)[number]

/** Value of the `surface` vertex attribute for a control surface. */
export function surfaceId(surface: ControlSurface): number {
  return CONTROL_SURFACES.indexOf(surface) + 1
}

/**
 * A control surface's hinge line. A positive rotation about `axis` (right-hand rule) moves the
 * trailing edge up for ailerons and elevators, and toward +X (right) for the rudder.
 */
export interface Hinge {
  origin: Vector3
  axis: Vector3
}

export interface PlaneGeometry {
  /** Cream: fuselage, wing, tail, wheel pants, cargo pod. Static. */
  body: BufferGeometry
  /** Terracotta: cheatlines, spinner and every control surface (see the `surface` attribute). */
  stripe: BufferGeometry
  /** Taupe metal: wing struts and landing-gear legs. */
  metal: BufferGeometry
  /** Dark tint: the cabin window band, plus the tires. */
  glass: BufferGeometry
  /** Two-blade prop, hub at the origin, spinning about Z. Place at `propHub`. */
  blades: BufferGeometry
  /** Flat disc in the prop plane, shown instead of the blades at speed. Place at `propHub`. */
  disc: BufferGeometry
  propHub: Vector3
  hinges: Record<ControlSurface, Hinge>
  dispose: () => void
}

/** Headline dimensions, exported for tests and for anyone placing the plane in the world. */
export const PLANE_DIMENSIONS = {
  /** Spinner tip, z. */
  noseZ: -3,
  /** Wing mid-plane height at the root. */
  wingY: 0.74,
  wingSpan: 11,
  /** Slight dihedral, a touch more than a real 172's 1.7° so it reads from the chase camera. */
  dihedral: (2.5 * Math.PI) / 180,
  propRadius: 0.95,
} as const

// ---------------------------------------------------------------------------------------------
// Loft: a surface skinned through a series of cross-section rings.

interface Ring {
  points: Vector3[]
  /** A point inside the ring, used to orient faces outward. */
  center: Vector3
}

const tmpA = new Vector3()
const tmpB = new Vector3()
const tmpN = new Vector3()

function triangleNormal(a: Vector3, b: Vector3, c: Vector3, out: Vector3): Vector3 {
  tmpA.subVectors(b, a)
  tmpB.subVectors(c, a)
  return out.crossVectors(tmpA, tmpB)
}

/**
 * Skins consecutive rings (all with the same point count) into an indexed surface with smooth
 * normals. `closed` wraps each ring back to its first point; `caps` fans a flat cap over the
 * first and last rings (flat-shaded, on their own vertices). Faces always point away from each
 * ring's `center`.
 */
function loft(
  rings: Ring[],
  { closed = true, caps = closed }: { closed?: boolean; caps?: boolean } = {},
): BufferGeometry {
  const count = rings[0]?.points.length ?? 0
  const positions: number[] = []
  const indices: number[] = []
  for (const ring of rings) for (const p of ring.points) positions.push(p.x, p.y, p.z)

  const segments = closed ? count : count - 1
  const side: number[] = []
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * count + j
      const b = (i + 1) * count + j
      const c = i * count + ((j + 1) % count)
      const d = (i + 1) * count + ((j + 1) % count)
      side.push(a, b, c, b, d, c)
    }
  }
  // Orient against a quad in the middle of the loft, where rings aren't degenerate.
  const mid = Math.floor((rings.length - 2) / 2)
  const ringA = rings[mid]
  const ringB = rings[mid + 1]
  const j = Math.floor(segments / 2)
  if (ringA && ringB) {
    const a = ringA.points[j] as Vector3
    const b = ringB.points[j] as Vector3
    const c = ringA.points[(j + 1) % count] as Vector3
    const outward = tmpN.subVectors(a, ringA.center).clone()
    if (triangleNormal(a, b, c, new Vector3()).dot(outward) < 0) flipTriangles(side)
  }
  indices.push(...side)

  if (caps) {
    const first = rings[0]
    const second = rings[1]
    const last = rings[rings.length - 1]
    const beforeLast = rings[rings.length - 2]
    if (first && second) addCap(first, second.center, positions, indices)
    if (last && beforeLast) addCap(last, beforeLast.center, positions, indices)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Fan cap over `ring`, facing away from `inward` (the neighboring ring's center). */
function addCap(ring: Ring, inward: Vector3, positions: number[], indices: number[]): void {
  const base = positions.length / 3
  positions.push(ring.center.x, ring.center.y, ring.center.z)
  for (const p of ring.points) positions.push(p.x, p.y, p.z)
  const n = ring.points.length
  const cap: number[] = []
  for (let j = 0; j < n; j++) cap.push(base, base + 1 + j, base + 1 + ((j + 1) % n))
  const p0 = ring.points[0] as Vector3
  const p1 = ring.points[1 % n] as Vector3
  const outward = new Vector3().subVectors(ring.center, inward)
  if (triangleNormal(ring.center, p0, p1, new Vector3()).dot(outward) < 0) flipTriangles(cap)
  indices.push(...cap)
}

function flipTriangles(indices: number[]): void {
  for (let i = 0; i < indices.length; i += 3) {
    const b = indices[i + 1] as number
    indices[i + 1] = indices[i + 2] as number
    indices[i + 2] = b
  }
}

// ---------------------------------------------------------------------------------------------
// Elliptical sections along Z: fuselage, spinner, wheel pants, cargo pod.

/** An elliptical cross-section at `z`, centered on (cx, cy). */
export interface Station {
  z: number
  rx: number
  ry: number
  cy: number
  cx?: number
}

/** Linearly interpolated station at `z`, clamped to the ends. */
export function stationAt(stations: readonly Station[], z: number): Station {
  const first = stations[0] as Station
  if (z <= first.z) return { ...first, z }
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i] as Station
    const b = stations[i + 1] as Station
    if (z <= b.z) {
      const t = (z - a.z) / (b.z - a.z)
      const mix = (u: number, v: number) => u + (v - u) * t
      return {
        z,
        rx: mix(a.rx, b.rx),
        ry: mix(a.ry, b.ry),
        cy: mix(a.cy, b.cy),
        cx: mix(a.cx ?? 0, b.cx ?? 0),
      }
    }
  }
  return { ...(stations[stations.length - 1] as Station), z }
}

/**
 * Point on a station's ellipse. `theta` is measured from the top (+Y), positive toward +X, so
 * 90° is the right-hand side and 180° the belly.
 */
function ellipsePoint(s: Station, theta: number, scale = 1): Vector3 {
  return new Vector3(
    (s.cx ?? 0) + s.rx * scale * Math.sin(theta),
    s.cy + s.ry * scale * Math.cos(theta),
    s.z,
  )
}

function ellipseLoft(stations: readonly Station[], segments: number): BufferGeometry {
  const rings = stations.map((s) => ({
    points: Array.from({ length: segments }, (_, j) =>
      ellipsePoint(s, (j / segments) * Math.PI * 2),
    ),
    center: new Vector3(s.cx ?? 0, s.cy, s.z),
  }))
  return loft(rings)
}

/**
 * An open strip of a lofted body, a hair outside its surface: livery painted on the fuselage.
 * Covers `z0..z1` and `theta0..theta1` (see `ellipsePoint`).
 */
function ellipsePatch(
  stations: readonly Station[],
  [z0, z1]: [number, number],
  [theta0, theta1]: [number, number],
  { segments, scale }: { segments: number; scale: number },
): BufferGeometry {
  const zs = [z0, ...stations.map((s) => s.z).filter((z) => z > z0 && z < z1), z1]
  const rings = zs.map((z) => {
    const s = stationAt(stations, z)
    return {
      points: Array.from({ length: segments + 1 }, (_, j) =>
        ellipsePoint(s, theta0 + ((theta1 - theta0) * j) / segments, scale),
      ),
      center: new Vector3(s.cx ?? 0, s.cy, z),
    }
  })
  return loft(rings, { closed: false })
}

// ---------------------------------------------------------------------------------------------
// Airfoil panels: wing, tail surfaces, prop blades.

/** Airfoil half-thickness profile: chord fraction `u` → upper / lower surface, as a fraction of
 * half the thickness. Slightly cambered, blunt-ish trailing edge so it survives the outline. */
const AIRFOIL_U = [0, 0.06, 0.2, 0.45, 0.72, 1]
const AIRFOIL_UPPER = [0, 0.75, 1, 0.82, 0.5, 0.1]
const AIRFOIL_LOWER = [0, -0.6, -0.72, -0.58, -0.36, -0.08]

function airfoilAt(u: number): { upper: number; lower: number } {
  for (let i = 0; i < AIRFOIL_U.length - 1; i++) {
    const u0 = AIRFOIL_U[i] as number
    const u1 = AIRFOIL_U[i + 1] as number
    if (u <= u1) {
      const t = (u - u0) / (u1 - u0)
      const up0 = AIRFOIL_UPPER[i] as number
      const lo0 = AIRFOIL_LOWER[i] as number
      return {
        upper: up0 + ((AIRFOIL_UPPER[i + 1] as number) - up0) * t,
        lower: lo0 + ((AIRFOIL_LOWER[i + 1] as number) - lo0) * t,
      }
    }
  }
  return { upper: AIRFOIL_UPPER[5] as number, lower: AIRFOIL_LOWER[5] as number }
}

/** One spanwise station of a lifting surface. */
export interface SurfaceStation {
  /** Leading-edge point on the mid-plane. */
  le: Vector3
  chord: number
  thickness: number
}

interface SurfaceAxes {
  /** Leading edge → trailing edge. */
  chord: Vector3
  /** Toward the upper (cambered) side. */
  thickness: Vector3
}

/** Point on a surface station at chord fraction `u`, `h` half-thicknesses off the mid-plane. */
function surfacePoint(s: SurfaceStation, axes: SurfaceAxes, u: number, h = 0): Vector3 {
  return s.le
    .clone()
    .addScaledVector(axes.chord, u * s.chord)
    .addScaledVector(axes.thickness, (h * s.thickness) / 2)
}

function airfoilRing(s: SurfaceStation, axes: SurfaceAxes, u0: number, u1: number): Ring {
  const us = [u0, ...AIRFOIL_U.filter((u) => u > u0 && u < u1), u1]
  const upper = us.map((u) => surfacePoint(s, axes, u, airfoilAt(u).upper))
  // A leading edge is a single point; a cut (hinge) face has an upper and a lower corner.
  const lowerUs = u0 === 0 ? us.slice(1) : [...us]
  const lower = lowerUs.reverse().map((u) => surfacePoint(s, axes, u, airfoilAt(u).lower))
  return { points: [...upper, ...lower], center: surfacePoint(s, axes, (u0 + u1) / 2) }
}

/** Closed panel lofted through `stations`, covering the chord fractions `u0..u1`. */
function surfacePanel(
  stations: readonly SurfaceStation[],
  axes: SurfaceAxes,
  [u0, u1]: [number, number] = [0, 1],
): BufferGeometry {
  return loft(stations.map((s) => airfoilRing(s, axes, u0, u1)))
}

/** Linear interpolation of surface stations by their position along `spanAxis`. */
function surfaceStationAt(
  stations: readonly SurfaceStation[],
  spanAxis: Vector3,
  at: number,
): SurfaceStation {
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i] as SurfaceStation
    const b = stations[i + 1] as SurfaceStation
    const sa = a.le.dot(spanAxis)
    const sb = b.le.dot(spanAxis)
    if (at <= sb || i === stations.length - 2) {
      const t = (at - sa) / (sb - sa)
      return {
        le: a.le.clone().lerp(b.le, t),
        chord: a.chord + (b.chord - a.chord) * t,
        thickness: a.thickness + (b.thickness - a.thickness) * t,
      }
    }
  }
  return stations[0] as SurfaceStation
}

/** Stations of `stations` between `from` and `to` along `spanAxis`, with the ends interpolated. */
function surfaceSpan(
  stations: readonly SurfaceStation[],
  spanAxis: Vector3,
  from: number,
  to: number,
): SurfaceStation[] {
  const inner = stations.filter((s) => {
    const at = s.le.dot(spanAxis)
    return at > from && at < to
  })
  return [
    surfaceStationAt(stations, spanAxis, from),
    ...inner,
    surfaceStationAt(stations, spanAxis, to),
  ]
}

/** Hinge along chord fraction `u` between two span positions; see `Hinge` for the sign. */
function hingeLine(
  stations: readonly SurfaceStation[],
  axes: SurfaceAxes,
  spanAxis: Vector3,
  u: number,
  [from, to]: [number, number],
  flip: boolean,
): Hinge {
  const a = surfacePoint(surfaceStationAt(stations, spanAxis, from), axes, u)
  const b = surfacePoint(surfaceStationAt(stations, spanAxis, to), axes, u)
  const axis = new Vector3().subVectors(b, a).normalize()
  return { origin: a, axis: flip ? axis.negate() : axis }
}

// ---------------------------------------------------------------------------------------------
// Tubes between two points: struts and gear legs.

/**
 * An elliptical tube from `a` to `b`. `halfWide` runs along `wideHint` (projected off the tube
 * axis), `halfThin` across it: a streamlined strut has its wide side along the airflow.
 */
function tube(
  a: Vector3,
  b: Vector3,
  halfWide: number,
  halfThin: number,
  wideHint = new Vector3(0, 0, 1),
  segments = 8,
): BufferGeometry {
  const axis = new Vector3().subVectors(b, a).normalize()
  const wide = wideHint.clone().addScaledVector(axis, -wideHint.dot(axis)).normalize()
  const thin = new Vector3().crossVectors(axis, wide)
  const ring = (center: Vector3): Ring => ({
    points: Array.from({ length: segments }, (_, j) => {
      const t = (j / segments) * Math.PI * 2
      return center
        .clone()
        .addScaledVector(wide, Math.cos(t) * halfWide)
        .addScaledVector(thin, Math.sin(t) * halfThin)
    }),
    center,
  })
  return loft([ring(a), ring(b)])
}

// ---------------------------------------------------------------------------------------------
// Assembly helpers.

/** Adds the `surface` attribute (0 unless given) and drops UVs so every part merges cleanly. */
function tag(geometry: BufferGeometry, surface: ControlSurface | null = null): BufferGeometry {
  const id = surface ? surfaceId(surface) : 0
  const count = geometry.getAttribute('position').count
  geometry.setAttribute('surface', new Float32BufferAttribute(new Array<number>(count).fill(id), 1))
  geometry.deleteAttribute('uv')
  return geometry
}

/** Mirror image across X = 0, with winding fixed and surface ids remapped (right → left). */
function mirrorX(geometry: BufferGeometry, remap: Partial<Record<number, number>> = {}) {
  const mirrored = geometry.clone().scale(-1, 1, 1)
  const index = mirrored.getIndex()
  if (index) {
    const array = index.array
    for (let i = 0; i < array.length; i += 3) {
      const b = array[i + 1] as number
      array[i + 1] = array[i + 2] as number
      array[i + 2] = b
    }
  }
  const surface = mirrored.getAttribute('surface')
  for (let i = 0; i < surface.count; i++) {
    const id = remap[surface.getX(i)]
    if (id !== undefined) surface.setX(i, id)
  }
  return mirrored
}

/** Right-side parts plus their mirror image. */
function bothSides(parts: BufferGeometry[], remap: Partial<Record<number, number>> = {}) {
  return [...parts, ...parts.map((p) => mirrorX(p, remap))]
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('planeGeometry: parts have mismatched attributes')
  merged.computeBoundingSphere()
  return merged
}

const deg = (d: number) => (d * Math.PI) / 180

// ---------------------------------------------------------------------------------------------
// The plane.

/** Fuselage cross-sections, nose to tail. Squarish-tall cabin, tail cone rising to the fin. */
export const FUSELAGE: readonly Station[] = [
  { z: -2.7, rx: 0.3, ry: 0.3, cy: -0.03 },
  { z: -2.5, rx: 0.46, ry: 0.45, cy: -0.02 },
  { z: -1.9, rx: 0.55, ry: 0.55, cy: 0 },
  { z: -1.25, rx: 0.57, ry: 0.66, cy: 0.05 },
  { z: -0.45, rx: 0.58, ry: 0.68, cy: 0.05 },
  { z: 1, rx: 0.55, ry: 0.62, cy: 0.08 },
  { z: 2, rx: 0.4, ry: 0.45, cy: 0.18 },
  { z: 3.4, rx: 0.22, ry: 0.28, cy: 0.32 },
  { z: 4.6, rx: 0.1, ry: 0.14, cy: 0.42 },
  { z: 4.85, rx: 0.02, ry: 0.03, cy: 0.44 },
]

const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)
const WING_AXES: SurfaceAxes = { chord: new Vector3(0, 0, 1), thickness: Y_AXIS }
const FIN_AXES: SurfaceAxes = { chord: new Vector3(0, 0, 1), thickness: X_AXIS }

const wingY = (x: number) => PLANE_DIMENSIONS.wingY + x * Math.tan(PLANE_DIMENSIONS.dihedral)
const halfSpan = PLANE_DIMENSIONS.wingSpan / 2

/** Right wing: constant chord inboard, tapered outboard. Quarter chord sits at z ≈ 0. */
const WING: readonly SurfaceStation[] = [
  { le: new Vector3(0, wingY(0), -0.45), chord: 1.6, thickness: 0.2 },
  { le: new Vector3(2.6, wingY(2.6), -0.45), chord: 1.6, thickness: 0.19 },
  { le: new Vector3(halfSpan, wingY(halfSpan), -0.1), chord: 1.2, thickness: 0.12 },
]
const AILERON_SPAN: [number, number] = [2.9, 5]
const AILERON_HINGE_U = 0.72

/** Right horizontal stabilizer. */
const STABILIZER: readonly SurfaceStation[] = [
  { le: new Vector3(0, 0.42, 3.75), chord: 1.05, thickness: 0.1 },
  { le: new Vector3(1.7, 0.42, 4.05), chord: 0.72, thickness: 0.06 },
]
const ELEVATOR_SPAN: [number, number] = [0.2, 1.7]
const ELEVATOR_HINGE_U = 0.62

/** Vertical fin, root buried in the tail cone. */
const FIN: readonly SurfaceStation[] = [
  { le: new Vector3(0, 0.35, 3.2), chord: 1.55, thickness: 0.12 },
  { le: new Vector3(0, 0.6, 3.55), chord: 1.25, thickness: 0.11 },
  { le: new Vector3(0, 1.6, 4.25), chord: 0.62, thickness: 0.07 },
]
const RUDDER_SPAN: [number, number] = [0.55, 1.6]
const RUDDER_HINGE_U = 0.62

/** Spinner tip at the nose, flaring back to the cowling. */
const SPINNER: readonly Station[] = [
  { z: PLANE_DIMENSIONS.noseZ, rx: 0.01, ry: 0.01, cy: -0.03 },
  { z: -2.93, rx: 0.1, ry: 0.1, cy: -0.03 },
  { z: -2.82, rx: 0.18, ry: 0.18, cy: -0.03 },
  { z: -2.66, rx: 0.22, ry: 0.22, cy: -0.03 },
]
const PROP_HUB = new Vector3(0, -0.03, -2.78)

/** Adventure touch: a belly cargo pod, like the ones on bush-flown 206s. */
const CARGO_POD: readonly Station[] = [
  { z: -1.5, rx: 0.05, ry: 0.03, cy: -0.6 },
  { z: -1.3, rx: 0.28, ry: 0.13, cy: -0.64 },
  { z: -0.6, rx: 0.34, ry: 0.17, cy: -0.68 },
  { z: 1, rx: 0.32, ry: 0.16, cy: -0.64 },
  { z: 1.9, rx: 0.05, ry: 0.04, cy: -0.34 },
]

/** Wheel pant around a wheel centered at the origin, nose toward -Z. */
const WHEEL_PANT: readonly Station[] = [
  { z: -0.5, rx: 0.02, ry: 0.03, cy: 0.12 },
  { z: -0.4, rx: 0.1, ry: 0.16, cy: 0.13 },
  { z: -0.2, rx: 0.16, ry: 0.27, cy: 0.14 },
  { z: 0.1, rx: 0.17, ry: 0.3, cy: 0.14 },
  { z: 0.35, rx: 0.12, ry: 0.22, cy: 0.16 },
  { z: 0.52, rx: 0.02, ry: 0.03, cy: 0.18 },
]

/** Adventure touch: oversized bush tires, poking well out under the pants. */
const MAIN_WHEEL = { center: new Vector3(1.2, -1.05, 0.35), radius: 0.2, tube: 0.12 }
const NOSE_WHEEL = { center: new Vector3(0, -1.12, -2.2), radius: 0.15, tube: 0.1 }

function wheelPant(center: Vector3, scale: number): BufferGeometry {
  return ellipseLoft(WHEEL_PANT, 12)
    .scale(scale, scale, scale)
    .translate(center.x, center.y, center.z)
}

function tire({ center, radius, tube: tubeRadius }: typeof MAIN_WHEEL): BufferGeometry {
  return new TorusGeometry(radius, tubeRadius, 8, 16)
    .rotateY(Math.PI / 2)
    .translate(center.x, center.y, center.z)
}

function buildBody(): BufferGeometry {
  const wingSpanAxis = X_AXIS
  const stabSpanAxis = X_AXIS
  const finSpanAxis = Y_AXIS
  const [ailIn, ailOut] = AILERON_SPAN
  const [elvIn, elvOut] = ELEVATOR_SPAN
  const [rudLow, rudHigh] = RUDDER_SPAN

  const rightSide = [
    // Wing: full chord inboard of the aileron and at the tip, cut at the hinge line between.
    surfacePanel(surfaceSpan(WING, wingSpanAxis, 0, ailIn), WING_AXES),
    surfacePanel(surfaceSpan(WING, wingSpanAxis, ailIn, ailOut), WING_AXES, [0, AILERON_HINGE_U]),
    surfacePanel(surfaceSpan(WING, wingSpanAxis, ailOut, halfSpan), WING_AXES),
    // Horizontal stabilizer: full chord at the root, cut at the elevator hinge outboard.
    surfacePanel(surfaceSpan(STABILIZER, stabSpanAxis, 0, elvIn), WING_AXES),
    surfacePanel(surfaceSpan(STABILIZER, stabSpanAxis, elvIn, elvOut), WING_AXES, [
      0,
      ELEVATOR_HINGE_U,
    ]),
    wheelPant(MAIN_WHEEL.center, 1),
  ].map((g) => tag(g))

  return merge([
    tag(ellipseLoft(FUSELAGE, 16)),
    ...bothSides(rightSide),
    tag(surfacePanel(surfaceSpan(FIN, finSpanAxis, 0.35, rudLow), FIN_AXES)),
    tag(
      surfacePanel(surfaceSpan(FIN, finSpanAxis, rudLow, rudHigh), FIN_AXES, [0, RUDDER_HINGE_U]),
    ),
    tag(wheelPant(NOSE_WHEEL.center, 0.8)),
    tag(ellipseLoft(CARGO_POD, 12)),
  ])
}

function buildStripe(): BufferGeometry {
  const right = surfaceId('aileronRight')
  const left = surfaceId('aileronLeft')
  const remap = { [right]: left, [surfaceId('elevatorRight')]: surfaceId('elevatorLeft') }
  const rightSide = [
    // Cheatline just below the window band, cowling to tail cone.
    tag(ellipsePatch(FUSELAGE, [-2.55, 4.5], [deg(95), deg(112)], { segments: 2, scale: 1.012 })),
    tag(
      surfacePanel(
        surfaceSpan(WING, X_AXIS, AILERON_SPAN[0] + 0.02, AILERON_SPAN[1] - 0.02),
        WING_AXES,
        [AILERON_HINGE_U, 1],
      ),
      'aileronRight',
    ),
    tag(
      surfacePanel(
        surfaceSpan(STABILIZER, X_AXIS, ELEVATOR_SPAN[0] + 0.02, ELEVATOR_SPAN[1]),
        WING_AXES,
        [ELEVATOR_HINGE_U, 1],
      ),
      'elevatorRight',
    ),
  ]
  return merge([
    ...bothSides(rightSide, remap),
    tag(
      surfacePanel(surfaceSpan(FIN, Y_AXIS, RUDDER_SPAN[0], RUDDER_SPAN[1]), FIN_AXES, [
        RUDDER_HINGE_U,
        1,
      ]),
      'rudder',
    ),
    tag(ellipseLoft(SPINNER, 16)),
  ])
}

function buildMetal(): BufferGeometry {
  const strutTop = new Vector3(2.7, wingY(2.7) - 0.06, -0.05)
  const rightSide = [
    tube(new Vector3(0.5, -0.32, -0.1), strutTop, 0.07, 0.025),
    // Flat spring-steel main gear leg, wide side fore-aft.
    tube(new Vector3(0.45, -0.52, MAIN_WHEEL.center.z), MAIN_WHEEL.center, 0.07, 0.025),
  ].map((g) => tag(g))
  return merge([
    ...bothSides(rightSide),
    tag(tube(new Vector3(0, -0.4, NOSE_WHEEL.center.z), NOSE_WHEEL.center, 0.045, 0.045)),
  ])
}

function buildGlass(): BufferGeometry {
  const band = { segments: 8, scale: 1.01 }
  const side = ellipsePatch(FUSELAGE, [-0.5, 0.95], [deg(35), deg(85)], band)
  return merge([
    // Windshield, wrapping around to the front side windows, up to the wing's leading edge.
    tag(ellipsePatch(FUSELAGE, [-1.85, -0.5], [deg(-85), deg(85)], { ...band, segments: 16 })),
    ...bothSides([tag(side)]),
    ...bothSides([tag(tire(MAIN_WHEEL))]),
    tag(tire(NOSE_WHEEL)),
  ])
}

function buildBlades(): BufferGeometry {
  const r = PLANE_DIMENSIONS.propRadius
  // Blade along +Y, chord across X, thin in Z (the prop disc plane is XY).
  const axes: SurfaceAxes = { chord: new Vector3(1, 0, 0), thickness: new Vector3(0, 0, -1) }
  const blade = surfacePanel(
    [
      { le: new Vector3(-0.07, 0.08, 0), chord: 0.14, thickness: 0.05 },
      { le: new Vector3(-0.08, r * 0.45, 0), chord: 0.16, thickness: 0.035 },
      { le: new Vector3(-0.05, r, 0), chord: 0.1, thickness: 0.02 },
    ],
    axes,
  )
  const other = blade.clone().rotateZ(Math.PI)
  return merge([tag(blade), tag(other)])
}

export function buildPlaneGeometry(): PlaneGeometry {
  const hinges: Record<ControlSurface, Hinge> = {
    // Right-hand rule about an axis pointing -X lifts a trailing edge: outboard → inboard on the
    // right wing, inboard → outboard on the left.
    aileronRight: hingeLine(WING, WING_AXES, X_AXIS, AILERON_HINGE_U, AILERON_SPAN, true),
    aileronLeft: mirrorHinge(
      hingeLine(WING, WING_AXES, X_AXIS, AILERON_HINGE_U, AILERON_SPAN, true),
    ),
    elevatorRight: hingeLine(STABILIZER, WING_AXES, X_AXIS, ELEVATOR_HINGE_U, ELEVATOR_SPAN, true),
    elevatorLeft: mirrorHinge(
      hingeLine(STABILIZER, WING_AXES, X_AXIS, ELEVATOR_HINGE_U, ELEVATOR_SPAN, true),
    ),
    // Bottom → top: a positive rotation about +Y swings the trailing edge toward +X.
    rudder: hingeLine(FIN, FIN_AXES, Y_AXIS, RUDDER_HINGE_U, RUDDER_SPAN, false),
  }

  const geometry: Omit<PlaneGeometry, 'dispose'> = {
    body: buildBody(),
    stripe: buildStripe(),
    metal: buildMetal(),
    glass: buildGlass(),
    blades: buildBlades(),
    disc: new CircleGeometry(PLANE_DIMENSIONS.propRadius, 32),
    propHub: PROP_HUB.clone(),
    hinges,
  }
  return {
    ...geometry,
    dispose: () => {
      for (const g of [
        geometry.body,
        geometry.stripe,
        geometry.metal,
        geometry.glass,
        geometry.blades,
        geometry.disc,
      ])
        g.dispose()
    },
  }
}

/**
 * The left-side twin of a right-side hinge. Mirroring the origin across X = 0 and keeping the
 * axis's X sign (only Y and Z flip under reflection of an axial vector) preserves "positive =
 * trailing edge up".
 */
function mirrorHinge({ origin, axis }: Hinge): Hinge {
  return {
    origin: new Vector3(-origin.x, origin.y, origin.z),
    axis: new Vector3(axis.x, -axis.y, -axis.z),
  }
}
