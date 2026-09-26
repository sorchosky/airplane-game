import { clamp } from '../input/clamp'

/**
 * The plane's contact shadow (#71, `docs/art-bible.md` §5): a soft dark disc on the ground under
 * the plane that grows and fades with height, so a low pass reads as low. Not a shadow map and
 * no raycast: `shadowAnchor` walks down the sun's ray by sampling the heightfield, and the
 * component lays one decal there. Pure math here, drawn by `ContactShadow.tsx`.
 */
export interface ShadowBlobParams {
  /** m, disc radius with the plane on the ground. About half the wingspan. */
  radiusAtGround: number
  /** m, disc radius at `fadeEnd`: the penumbra widens with height. */
  radiusAtFadeEnd: number
  /** 0..1, darkness of the disc's centre with the plane on the ground. */
  opacityAtGround: number
  /** m above ground where the disc starts to fade faster. */
  fadeStart: number
  /** m above ground at and above which the disc is gone. */
  fadeEnd: number
  /** m, the disc floats this far off the sampled surface, along its normal, against z-fighting. */
  lift: number
}

export const SHADOW_BLOB_PARAMS: ShadowBlobParams = {
  radiusAtGround: 4.5,
  radiusAtFadeEnd: 8,
  opacityAtGround: 0.5,
  // The soft floor starts pulling up at 20 m, so a low pass lives around 10–25 m: the disc is at
  // its clearest there, and gone well before cruise heights.
  fadeStart: 30,
  fadeEnd: 60,
  lift: 0.4,
}

export interface ShadowBlob {
  radius: number
  opacity: number
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Size and darkness of the disc at `height` m above the surface. Opacity falls linearly to 70 %
 * by `fadeStart`, then eases to 0 at `fadeEnd`, so there's no visible pop when it disappears.
 * Written into `out`.
 */
export function shadowBlob(
  height: number,
  params: ShadowBlobParams = SHADOW_BLOB_PARAMS,
  out: ShadowBlob = { radius: 0, opacity: 0 },
): ShadowBlob {
  const h = Math.max(height, 0)
  const t = clamp(h / params.fadeEnd, 0, 1)
  out.radius = params.radiusAtGround + (params.radiusAtFadeEnd - params.radiusAtGround) * t
  const near = 1 - 0.3 * clamp(h / params.fadeStart, 0, 1)
  const far = 1 - smoothstep(params.fadeStart, params.fadeEnd, h)
  out.opacity = params.opacityAtGround * near * far
  return out
}

export interface ShadowAnchor {
  /** World position of the disc's centre on the surface, before `lift`. */
  x: number
  y: number
  z: number
  /** m, the plane's height above that point. Drives `shadowBlob`. */
  height: number
}

/**
 * Where the plane's shadow lands: along the ray away from the sun (`sunDirection` points toward
 * it), found without a raycast by fixed-point iteration on `surfaceAt` — drop to the surface
 * under the current guess, slide along the ray to that height, resample. Three rounds land
 * within centimetres on the gentle slopes a low pass flies over.
 *
 * Why the sun's ray and not straight down: the chase camera sits 11 m behind and a few metres
 * above, so the ground straight under the plane is more than 60° below the view axis at any
 * height worth cueing, off the bottom of the screen. Cast along the light, the blob lands where
 * a real shadow would, and with the sun behind the camera that is ahead of the plane, in frame.
 */
export function shadowAnchor(
  x: number,
  y: number,
  z: number,
  sunDirection: readonly [number, number, number],
  surfaceAt: (x: number, z: number) => number,
  out: ShadowAnchor = { x: 0, y: 0, z: 0, height: 0 },
  iterations = 3,
): ShadowAnchor {
  const [sx, sy, sz] = sunDirection
  // Horizontal metres travelled per metre dropped, moving away from the sun. A sun at or below
  // the horizon would cast to infinity: fall back to straight down.
  const perMetre = sy > 0.05 ? 1 / sy : 0
  let ground = surfaceAt(x, z)
  let gx = x
  let gz = z
  for (let i = 0; i < iterations; i++) {
    const drop = Math.max(y - ground, 0)
    gx = x - sx * perMetre * drop
    gz = z - sz * perMetre * drop
    ground = surfaceAt(gx, gz)
  }
  out.x = gx
  out.y = ground
  out.z = gz
  out.height = Math.max(y - ground, 0)
  return out
}

/**
 * Alpha of the disc at `r` (0 = centre, 1 = rim): a solid core to 30 %, easing to 0 at the rim,
 * so it reads as a soft blob rather than a stamped circle.
 */
export function shadowFalloff(r: number): number {
  return 1 - smoothstep(0.3, 1, r)
}

/**
 * RGBA texels of the disc's alpha map, `size` square. Three's `alphaMap` reads the green channel;
 * every channel carries the value so the texture is correct whichever one is sampled.
 */
export function buildShadowAlphaData(size = 64): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1
      const v = ((y + 0.5) / size) * 2 - 1
      const value = Math.round(shadowFalloff(Math.hypot(u, v)) * 255)
      data.fill(value, (y * size + x) * 4, (y * size + x) * 4 + 4)
    }
  }
  return data
}
