import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { PlaneModel } from '../flight/PlaneModel'
import { ToonMesh } from '../render/ToonMesh'
import { color } from '../styles/tokens'
import { activeLighting } from '../world/lightingPreset'
import { PerfHud } from './PerfHud'
import { PerfProbe } from './PerfProbe'

const SUN_DISTANCE = 20

/**
 * `?scene=materials`: a sphere, a box, a torus knot and the plane under the active lighting preset
 * (`?tod=`), for reviewing the toon ramp and outlines. Add `&rim` to
 * turn on the rim light. Drag to orbit. The perf readout (top right, `F` toggles) shows draw calls.
 */
export function MaterialsScene() {
  const rim = useMemo(() => new URLSearchParams(window.location.search).has('rim'), [])
  const light = activeLighting()
  const sunPosition = useMemo(
    () => light.sunDirection.map((v) => v * SUN_DISTANCE) as [number, number, number],
    [light],
  )

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 3, 11], fov: 45 }}>
        <color attach="background" args={[light.skyHorizon]} />
        <directionalLight position={sunPosition} color={light.sun} intensity={light.sunIntensity} />
        <hemisphereLight
          args={[light.ambientSky, light.ambientGround, light.hemisphereIntensity]}
        />
        <OrbitControls target={[0, 1, 0]} />

        <ToonMesh color={color.grassLight} rim={rim} position={[-4.5, 1, 0]}>
          <sphereGeometry args={[1, 48, 32]} />
        </ToonMesh>
        <ToonMesh color={color.rock} rim={rim} position={[-1.5, 1, 0]} rotation={[0.4, 0.6, 0]}>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
        </ToonMesh>
        <ToonMesh color={color.waterShallow} rim={rim} position={[1.5, 1, 0]}>
          <torusKnotGeometry args={[0.7, 0.25, 160, 24]} />
        </ToonMesh>
        <group position={[0, 2.5, -7]} rotation={[0.2, -0.7, -0.25]}>
          <PlaneModel />
        </group>

        <ToonMesh color={color.grassShadow} outline={false} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[40, 40]} />
        </ToonMesh>
        <PerfProbe />
      </Canvas>
      <PerfHud initiallyVisible />
    </div>
  )
}
