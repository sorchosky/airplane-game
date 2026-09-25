import {
  BackSide,
  Color,
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  type ColorRepresentation,
} from 'three'
import { color as colorTokens, lighting, toonRamp } from '../styles/tokens'

/**
 * Lit level of each toon band (shadow / mid / highlight), as a fraction of the light's color.
 * The shadow band stays well above 0 so the unlit side reads as a soft fill, not an ink shadow,
 * matching the low-contrast sunset look in docs/art-direction.md.
 */
export const TOON_BAND_LEVELS = [0.5, 0.78, 1] as const

/** Texels in the gradient map. Enough to resolve `toonRamp.edgeSoftness` as a short ramp. */
export const TOON_RAMP_WIDTH = 256

/** Default inverted-hull outline weight: world meters, capped on screen by `maxPixels`. */
export const OUTLINE_DEFAULTS = {
  /** Hull offset along the vertex normal, in meters. Shrinks on screen with distance. */
  thickness: 0.06,
  /** Screen-space cap, in CSS pixels, so a mesh right in front of the camera isn't heavy-lined. */
  maxPixels: 3,
} as const

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Brightness at a given N·L for the token ramp. Bands switch at `toonRamp.thresholds` with a
 * smoothstep of half-width `edgeSoftness`, so edges anti-alias instead of stair-stepping.
 */
export function toonRampValue(
  nDotL: number,
  ramp: { thresholds: readonly number[]; edgeSoftness: number } = toonRamp,
  levels: readonly number[] = TOON_BAND_LEVELS,
): number {
  let value = levels[0] ?? 0
  ramp.thresholds.forEach((threshold, i) => {
    const step = smoothstep(threshold - ramp.edgeSoftness, threshold + ramp.edgeSoftness, nDotL)
    value += ((levels[i + 1] ?? 0) - (levels[i] ?? 0)) * step
  })
  return value
}

/**
 * Gradient-map texels. Three's toon shader samples the map at `u = N·L * 0.5 + 0.5`, so texel `i`
 * covers N·L = 2u - 1 at its center.
 */
export function buildToonRampData(width = TOON_RAMP_WIDTH): Uint8Array {
  const data = new Uint8Array(width)
  for (let i = 0; i < width; i++) {
    const u = (i + 0.5) / width
    data[i] = Math.round(toonRampValue(u * 2 - 1) * 255)
  }
  return data
}

let gradientMap: DataTexture | null = null

/** The one gradient map every toon material shares. Nearest filtering, no mipmaps. */
export function getToonGradientMap(): DataTexture {
  if (gradientMap) return gradientMap
  const texture = new DataTexture(
    buildToonRampData(),
    TOON_RAMP_WIDTH,
    1,
    RedFormat,
    UnsignedByteType,
  )
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  gradientMap = texture
  return texture
}

export interface ToonMaterialOptions {
  color: ColorRepresentation
  /** Soft fresnel rim light tinted with the `sun` token. Off by default. */
  rim?: boolean
}

/** Cache key for a toon material. Colors are normalized so `'#fff'` and `0xffffff` share one. */
export function toonMaterialKey({ color, rim = false }: ToonMaterialOptions): string {
  return `${new Color(color).getHexString()}|rim:${rim ? 1 : 0}`
}

const RIM_FRAGMENT = /* glsl */ `
  float toonRimFacing = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
  outgoingLight += toonRimColor * toonRimStrength * smoothstep( 0.55, 0.85, toonRimFacing );
  #include <opaque_fragment>`

function addRimLight(material: MeshToonMaterial): void {
  const rimColor = new Color(colorTokens.sun)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.toonRimColor = { value: rimColor }
    shader.uniforms.toonRimStrength = { value: lighting.rimStrength }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 toonRimColor;\nuniform float toonRimStrength;\nvoid main() {',
      )
      .replace('#include <opaque_fragment>', RIM_FRAGMENT)
  }
  material.customProgramCacheKey = () => 'toon-rim'
}

const toonMaterials = new Map<string, MeshToonMaterial>()

/**
 * Cel-shaded material for all solid geometry. One cached instance per color and option set, all
 * sharing the gradient map, so identical meshes share a shader program and uniforms. Materials
 * are shared: never dispose one from a component.
 */
export function createToonMaterial(options: ToonMaterialOptions): MeshToonMaterial {
  const key = toonMaterialKey(options)
  const cached = toonMaterials.get(key)
  if (cached) return cached
  const material = new MeshToonMaterial({
    color: options.color,
    gradientMap: getToonGradientMap(),
  })
  if (options.rim) addRimLight(material)
  toonMaterials.set(key, material)
  return material
}

/**
 * Hull offset in meters for a vertex `depth` meters in front of the camera. Mirrors the outline
 * vertex shader so the falloff can be unit tested: the hull is `thickness` meters thick (so it
 * thins on screen with distance), but never wider on screen than `maxPixels`.
 *
 * `projectionScaleY` is `projectionMatrix[1][1]`, i.e. `1 / tan(fovY / 2)`.
 */
export function outlineOffset(
  thickness: number,
  maxPixels: number,
  depth: number,
  projectionScaleY: number,
  viewportHeight: number,
): number {
  const metersPerPixel = (2 * Math.max(depth, 1e-3)) / (projectionScaleY * viewportHeight)
  return Math.min(thickness, maxPixels * metersPerPixel)
}

const OUTLINE_VERTEX = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  uniform float thickness;
  uniform float maxPixels;
  uniform float viewportHeight;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vec3 viewNormal = normalize( normalMatrix * normal );
    float depth = max( -mvPosition.z, 1e-3 );
    float metersPerPixel = 2.0 * depth / ( projectionMatrix[1][1] * viewportHeight );
    mvPosition.xyz += viewNormal * min( thickness, maxPixels * metersPerPixel );
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`

const OUTLINE_FRAGMENT = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 color;
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4( color, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`

/**
 * Viewport height in CSS pixels, shared by every outline material so `maxPixels` means the same
 * thing everywhere. `ToonMesh` keeps it in sync with the canvas size.
 */
const viewportHeightUniform = { value: 1080 }

export function setOutlineViewportHeight(height: number): void {
  if (height > 0) viewportHeightUniform.value = height
}

export interface OutlineMaterialOptions {
  color?: ColorRepresentation
  thickness?: number
  maxPixels?: number
}

const outlineMaterials = new Map<string, ShaderMaterial>()

/**
 * Shared back-face material for the inverted-hull outline. Cached per color and weight, so every
 * outlined mesh costs exactly one extra draw call and no extra shader programs.
 */
export function getOutlineMaterial({
  color = colorTokens.outline,
  thickness = OUTLINE_DEFAULTS.thickness,
  maxPixels = OUTLINE_DEFAULTS.maxPixels,
}: OutlineMaterialOptions = {}): ShaderMaterial {
  const key = `${new Color(color).getHexString()}|${thickness}|${maxPixels}`
  const cached = outlineMaterials.get(key)
  if (cached) return cached
  const material = new ShaderMaterial({
    uniforms: {
      color: { value: new Color(color) },
      thickness: { value: thickness },
      maxPixels: { value: maxPixels },
      viewportHeight: viewportHeightUniform,
      // Fog uniforms, so outlines fade into the haze with the geometry they belong to.
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
      fogDensity: { value: 0.00025 },
    },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: BackSide,
    fog: true,
  })
  outlineMaterials.set(key, material)
  return material
}
