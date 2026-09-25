import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, type Mesh, ShaderMaterial } from 'three'
import { ATMOSPHERE_GLSL } from './atmosphereShader'
import { TERRAIN_CONFIG } from './terrainConfig'

/**
 * Sky dome radius, m. Inside the camera's far plane (1.2 × view distance) so it's never clipped.
 * The dome is drawn first and never writes depth, so terrain past it still draws on top.
 */
const SKY_RADIUS = TERRAIN_CONFIG.viewDistance

/** Sun disc angular radius and its soft edge, radians */
const SUN_DISC_RADIUS = 0.035
const SUN_DISC_SOFTNESS = 0.012

const vertexShader = /* glsl */ `
varying vec3 vDirection;
void main() {
  // The dome is centred on the camera and never rotated, so a vertex's local position is also
  // its world-space direction from the camera.
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
${ATMOSPHERE_GLSL}
const float SUN_DISC_COS = ${Math.cos(SUN_DISC_RADIUS).toFixed(6)};
const float SUN_DISC_EDGE_COS = ${Math.cos(SUN_DISC_RADIUS + SUN_DISC_SOFTNESS).toFixed(6)};
varying vec3 vDirection;
void main() {
  vec3 dir = normalize(vDirection);
  vec3 sky = atmosphereSky(dir);
  float disc = smoothstep(SUN_DISC_EDGE_COS, SUN_DISC_COS, dot(dir, ATMO_SUN_DIR));
  // Written as-is: same sRGB colour space as the haze, which Three applies after tone mapping.
  gl_FragColor = vec4(mix(sky, ATMO_SUN_DISC, disc), 1.0);
}
`

/**
 * Stylized sky: an inside-out sphere that follows the camera, shaded with a horizon-to-zenith
 * gradient and a soft warm sun. Shares `atmosphereSky` with the terrain haze so the two meet
 * without a seam.
 */
export function Sky() {
  const meshRef = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame(({ camera }) => {
    meshRef.current?.position.copy(camera.position)
  })

  return (
    <mesh ref={meshRef} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
    </mesh>
  )
}
