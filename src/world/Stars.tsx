import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three'
import { mulberry32 } from './atmosphere'
import { atmosphereUniforms } from './atmosphereUniforms'
import { TERRAIN_CONFIG } from './terrainConfig'

const STAR_COUNT = 240
const STAR_RADIUS = TERRAIN_CONFIG.viewDistance * 0.95

/** One GPU draw: fixed seeded celestial points, visible above the horizon as night fades in. */
export function Stars() {
  const points = useRef<Points>(null)
  const { geometry, material } = useMemo(() => {
    const random = mulberry32(92)
    const positions = new Float32Array(STAR_COUNT * 3)
    const sizes = new Float32Array(STAR_COUNT)
    const magnitudes = new Float32Array(STAR_COUNT)
    for (let i = 0; i < STAR_COUNT; i++) {
      const azimuth = random() * Math.PI * 2
      const elevation = 0.08 + random() * (Math.PI / 2 - 0.12)
      const cos = Math.cos(elevation) * STAR_RADIUS
      positions[i * 3] = Math.sin(azimuth) * cos
      positions[i * 3 + 1] = Math.sin(elevation) * STAR_RADIUS
      positions[i * 3 + 2] = Math.cos(azimuth) * cos
      magnitudes[i] = random()
      sizes[i] = 1.5 + (1 - magnitudes[i]!) * 2.2
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
    geometry.setAttribute('aMagnitude', new BufferAttribute(magnitudes, 1))
    const material = new ShaderMaterial({
      uniforms: { atmoSunElevation: atmosphereUniforms.atmoSunElevation },
      vertexShader: `attribute float aSize; attribute float aMagnitude;
        varying float vSize; varying float vMagnitude;
        void main() { vSize = aSize; vMagnitude = aMagnitude;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize; }`,
      fragmentShader: `#include <common>
        uniform float atmoSunElevation; varying float vSize; varying float vMagnitude;
        float starVisibility(float elevation, float magnitude) {
          if (elevation >= 0.0) return 0.0;
          float fadeStart = radians(-2.0 - magnitude * 4.0);
          float fadeEnd = fadeStart - radians(8.0);
          return 1.0 - smoothstep(fadeEnd, fadeStart, elevation);
        }
        void main() { float visibility = starVisibility(atmoSunElevation, vMagnitude);
          if (visibility < 0.005) discard;
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float a = (1.0 - smoothstep(0.1, 1.0, d)) * visibility;
          gl_FragColor = vec4(vec3(0.77, 0.84, 1.0) * a, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geometry, material }
  }, [])

  useFrame(({ camera }) => {
    points.current?.position.copy(camera.position)
  })
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  return (
    <points
      ref={points}
      geometry={geometry}
      material={material}
      renderOrder={-0.5}
      frustumCulled={false}
    />
  )
}
