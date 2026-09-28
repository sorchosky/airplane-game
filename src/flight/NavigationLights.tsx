import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, MeshBasicMaterial, SphereGeometry, type Mesh } from 'three'
import { color } from '../styles/tokens'
import { atmosphereUniforms } from '../world/atmosphereUniforms'
import { PLANE_DIMENSIONS } from './planeGeometry'

const geometry = new SphereGeometry(0.14, 8, 6)

/** Red port, green starboard, and a short white tail strobe. Three tiny emissive draws. */
export function NavigationLights({ paused }: { paused: boolean }) {
  const left = useRef<Mesh>(null)
  const right = useRef<Mesh>(null)
  const tail = useRef<Mesh>(null)
  const elapsed = useRef(0)
  const materials = useMemo(
    () =>
      [color.navRed, color.navGreen, color.navWhite].map((hex) => {
        const c = new Color(hex).multiplyScalar(3)
        return new MeshBasicMaterial({
          color: c,
          toneMapped: false,
          transparent: true,
          depthWrite: false,
        })
      }),
    [],
  )
  useFrame((_state, delta) => {
    if (!paused) elapsed.current += delta
    const night = atmosphereUniforms.atmoNight.value[0] ?? 0
    const pulse = elapsed.current % 1.8 < 0.9
    const strobe = elapsed.current % 1.8 < 0.1 || (elapsed.current + 1.6) % 1.8 < 0.1
    if (left.current) left.current.visible = night > 0.08 && pulse
    if (right.current) right.current.visible = night > 0.08 && pulse
    if (tail.current) tail.current.visible = night > 0.08 && strobe
    for (const material of materials) material.opacity = night
  })
  const wingY =
    PLANE_DIMENSIONS.wingY + (PLANE_DIMENSIONS.wingSpan / 2) * Math.tan(PLANE_DIMENSIONS.dihedral)
  return (
    <>
      <mesh
        ref={left}
        geometry={geometry}
        material={materials[0]}
        position={[-PLANE_DIMENSIONS.wingSpan / 2, wingY, 0.45]}
        visible={false}
      />
      <mesh
        ref={right}
        geometry={geometry}
        material={materials[1]}
        position={[PLANE_DIMENSIONS.wingSpan / 2, wingY, 0.45]}
        visible={false}
      />
      <mesh
        ref={tail}
        geometry={geometry}
        material={materials[2]}
        position={[0, 0.3, 4]}
        visible={false}
      />
    </>
  )
}
