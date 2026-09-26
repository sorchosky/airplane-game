import { DoubleSide, FrontSide, ShaderMaterial, UniformsLib, UniformsUtils } from 'three'
import { atmosphereUniforms } from './atmosphereUniforms'
import { CLOUD_LIT_GAIN, CLOUD_RAMP, CLOUD_SHADE_GAIN } from './cloudMath'

// Cloud shaders (#70, `docs/art-bible.md` §5): two-band toon, tinted `cloud-top` and `cloud-shade`
// from the lighting preset's shared uniforms, a soft fresnel edge, no outline, and the same haze as
// everything else so far clouds fade into the sky behind them.

function glslFloat(value: number): string {
  return value.toFixed(6)
}

const TONE = /* glsl */ `
const float CLOUD_LIT_GAIN = ${glslFloat(CLOUD_LIT_GAIN)};
const float CLOUD_SHADE_GAIN = ${glslFloat(CLOUD_SHADE_GAIN)};
uniform vec3 atmoCloudTop;
uniform vec3 atmoCloudShade;
`

// ---------------------------------------------------------------------------------------------
// Mid-layer cumulus heaps: opaque, one instanced draw.

const cumulusVertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec3 vCloudNormal;
varying vec3 vCloudWorld;
void main() {
  // The instance matrix is yaw times a non-uniform scale, so its inverse transpose (what normals
  // need) is the matrix itself applied to the normal divided by each axis's squared scale.
  mat3 m = mat3(instanceMatrix);
  vec3 scaleSq = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
  vCloudNormal = normalize(mat3(modelMatrix) * (m * (normal / scaleSq)));
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vCloudWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`

const cumulusFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${TONE}
// Declared by the haze chunk when fog is on.
#ifndef USE_FOG
uniform vec3 atmoSunDir;
#endif
varying vec3 vCloudNormal;
varying vec3 vCloudWorld;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vCloudNormal);
  vec3 viewDir = normalize(cameraPosition - vCloudWorld);

  // Two bands, the twin of cloudBand() in cloudMath.ts: sunward and upward faces take the top
  // tint, undersides and the far side take the shade tint.
  float lightness = ${glslFloat(CLOUD_RAMP.sunWeight)} * dot(n, atmoSunDir)
    + ${glslFloat(CLOUD_RAMP.upWeight)} * n.y;
  float band = smoothstep(
    ${glslFloat(CLOUD_RAMP.threshold - CLOUD_RAMP.softness)},
    ${glslFloat(CLOUD_RAMP.threshold + CLOUD_RAMP.softness)},
    lightness
  );
  vec3 top = atmoCloudTop * CLOUD_LIT_GAIN;
  vec3 color = mix(atmoCloudShade * CLOUD_SHADE_GAIN, top, band);

  // Soft fresnel edge: the silhouette lifts toward the top tint, the way light scatters through a
  // cloud's thin rim. This is what makes the shape read as soft volume instead of a hard shell.
  float rim = smoothstep(
    ${glslFloat(CLOUD_RAMP.fresnelStart)},
    ${glslFloat(CLOUD_RAMP.fresnelEnd)},
    1.0 - max(dot(n, viewDir), 0.0)
  );
  color = mix(color, top, rim * ${glslFloat(CLOUD_RAMP.fresnelStrength)});

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

/** The cumulus material. Not cached: `Clouds` owns and disposes it. */
export function createCumulusMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    // The fog uniforms are cloned per material; the lighting preset's are shared, so the day
    // cycle (#92) and `?tod=` reach the clouds with no recompile.
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), ...atmosphereUniforms },
    vertexShader: cumulusVertex,
    fragmentShader: cumulusFragment,
    side: FrontSide,
    fog: true,
  })
}

// ---------------------------------------------------------------------------------------------
// High stratus band: soft-edged billboard impostors, one instanced, blended draw.

const stratusVertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec2 vStratusUv;
varying float vStratusSeed;
void main() {
  // The instance matrix carries the sheet's centre and its width and height as x and y scale.
  vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float width = length(instanceMatrix[0].xyz);
  float height = length(instanceMatrix[1].xyz);

  // Face the camera, but keep the sheet's long axis level with the horizon, so the band doesn't
  // roll with the camera when the plane banks.
  vec3 toCamera = cameraPosition - centre;
  vec3 right = cross(vec3(0.0, 1.0, 0.0), toCamera);
  float rightLength = length(right);
  right = rightLength > 1e-3 ? right / rightLength : vec3(1.0, 0.0, 0.0);
  vec3 up = normalize(cross(toCamera, right));

  vec3 world = centre + right * position.x * width + up * position.y * height;
  vStratusUv = uv;
  vStratusSeed = float(gl_InstanceID) * 1.618;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`

const stratusFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${TONE}
varying vec2 vStratusUv;
varying float vStratusSeed;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vStratusUv * 2.0 - 1.0;
  float s = vStratusSeed;

  // A long, low streak: tapered ends, a lumpy top edge, a flatter base.
  float taper = 1.0 - smoothstep(0.35, 1.0, abs(p.x));
  float crest = 0.3 + 0.25 * (0.5 + 0.5 * sin(p.x * 4.0 + s)) + 0.12 * sin(p.x * 9.0 + s * 2.0);
  float topEdge = crest * taper;
  float baseEdge = -0.3 * taper + 0.06 * sin(p.x * 6.0 + s * 3.0);
  float alpha = smoothstep(baseEdge - 0.25, baseEdge + 0.05, p.y)
    * (1.0 - smoothstep(topEdge - 0.35, topEdge, p.y))
    * smoothstep(0.0, 0.25, taper);
  alpha *= 0.7;
  if (alpha < 0.01) discard;

  // Two bands: a thin shaded sliver along the base, the rest in the top tint.
  float band = smoothstep(baseEdge + 0.12, baseEdge + 0.2, p.y);
  vec3 color = mix(atmoCloudShade * CLOUD_SHADE_GAIN, atmoCloudTop * CLOUD_LIT_GAIN, band);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

/** The stratus material. Not cached: `Clouds` owns and disposes it. */
export function createStratusMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), ...atmosphereUniforms },
    vertexShader: stratusVertex,
    fragmentShader: stratusFragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  })
}
