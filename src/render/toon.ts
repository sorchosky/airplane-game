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
import { atmosphereUniforms } from '../world/atmosphereUniforms'

/**
 * Lit level of each toon band (shadow / mid / highlight), as a fraction of the light's color.
 * The shadow band stays well above 0 so the unlit side reads as a soft fill, not an ink shadow;
 * the hemisphere light adds the sky's colour on top, so shadows read cool and sky-lit (#64,
 * `docs/art-bible.md` §5).
 */
export const TOON_BAND_LEVELS = [0.62, 0.86, 1] as const

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

/**
 * Stepped specular highlight (#71): a hard-edged Blinn-Phong glint off the key light, for glossy
 * surfaces like the canopy. A threshold on N·H rather than a power curve, so it reads as a
 * painted highlight, anti-aliased by `softness`.
 */
export const TOON_SPECULAR = {
  /** N·H at which the highlight switches on. About 20° of half-vector cone. */
  threshold: 0.94,
  /** Half-width of the edge blend, in N·H. */
  softness: 0.012,
  /** Fraction of the key light's colour added inside the highlight. */
  strength: 0.7,
} as const

export interface ToonMaterialOptions {
  color: ColorRepresentation
  /** Soft fresnel rim light tinted with the lighting preset's sun colour. Off by default. */
  rim?: boolean
  /** Stepped specular glint off the key light (`TOON_SPECULAR`). Off by default. */
  specular?: boolean
  /** Multiplies `color` by the geometry's `color` attribute, for shading parts of one mesh. */
  vertexColors?: boolean
}

/** Cache key for a toon material. Colors are normalized so `'#fff'` and `0xffffff` share one. */
export function toonMaterialKey({
  color,
  rim = false,
  specular = false,
  vertexColors = false,
}: ToonMaterialOptions): string {
  const flags = `rim:${rim ? 1 : 0}|spec:${specular ? 1 : 0}|vc:${vertexColors ? 1 : 0}`
  return `${new Color(color).getHexString()}|${flags}`
}

const RIM_FRAGMENT = /* glsl */ `
  float toonRimFacing = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
  outgoingLight += toonRimColor * toonRimStrength * smoothstep( 0.55, 0.85, toonRimFacing );`

// The first directional light is the sun (`Atmosphere`). `vViewPosition` points from the fragment
// to the camera in view space, the same space as the light's direction.
const SPECULAR_FRAGMENT = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
    vec3 toonHalf = normalize( directionalLights[ 0 ].direction + normalize( vViewPosition ) );
    float toonNdotH = dot( normal, toonHalf );
    float toonGlint = smoothstep(
      toonSpecular.x - toonSpecular.y, toonSpecular.x + toonSpecular.y, toonNdotH );
    outgoingLight += directionalLights[ 0 ].color * toonGlint * toonSpecular.z;
  #endif`

/**
 * Patches the toon shader with the optional rim and specular terms, both added to the lit colour
 * just before it's written out.
 */
function addShaderTerms(material: MeshToonMaterial, rim: boolean, specular: boolean): void {
  material.onBeforeCompile = (shader) => {
    const uniforms: string[] = []
    let terms = ''
    if (rim) {
      // Shared with the lighting preset, so the rim follows the sun's colour.
      shader.uniforms.toonRimColor = atmosphereUniforms.atmoSunLight
      shader.uniforms.toonRimStrength = { value: lighting.rimStrength }
      uniforms.push('uniform vec3 toonRimColor;', 'uniform float toonRimStrength;')
      terms += RIM_FRAGMENT
    }
    if (specular) {
      const { threshold, softness, strength } = TOON_SPECULAR
      shader.uniforms.toonSpecular = { value: [threshold, softness, strength] }
      uniforms.push('uniform vec3 toonSpecular;')
      terms += SPECULAR_FRAGMENT
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${uniforms.join('\n')}\nvoid main() {`)
      .replace('#include <opaque_fragment>', `${terms}\n  #include <opaque_fragment>`)
  }
  const key = `toon${rim ? '-rim' : ''}${specular ? '-spec' : ''}`
  material.customProgramCacheKey = () => key
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
    vertexColors: options.vertexColors ?? false,
  })
  if (options.rim || options.specular) {
    addShaderTerms(material, options.rim ?? false, options.specular ?? false)
  }
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
      ...atmosphereUniforms,
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
