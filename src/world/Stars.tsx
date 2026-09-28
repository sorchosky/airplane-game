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
    for (let i = 0; i < STAR_COUNT; i++) {
      const azimuth = random() * Math.PI * 2
      const elevation = 0.08 + random() * (Math.PI / 2 - 0.12)
      const cos = Math.cos(elevation) * STAR_RADIUS
      positions[i * 3] = Math.sin(azimuth) * cos
      positions[i * 3 + 1] = Math.sin(elevation) * STAR_RADIUS
      positions[i * 3 + 2] = Math.cos(azimuth) * cos
      sizes[i] = 1.5 + random() * 2.2
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
    const material = new ShaderMaterial({
      uniforms: { atmoNight: atmosphereUniforms.atmoNight },
      vertexShader: `attribute float aSize; varying float vSize;
        void main() { vSize = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize; }`,
      fragmentShader: `#include <common>
        uniform float atmoNight; varying float vSize;
        void main() { if (atmoNight < 0.005) discard;
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float a = (1.0 - smoothstep(0.1, 1.0, d)) * atmoNight;
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
