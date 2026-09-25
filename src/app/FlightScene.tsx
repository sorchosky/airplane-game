import { Canvas } from '@react-three/fiber'
import { Plane } from '../flight/Plane'
import { color } from '../styles/tokens'

// Camera is a fixed placeholder -- the chase camera lands in #11. Terrain and the soft floor
// land in #12; the ground plane below is only a visual reference from the #6 scaffold.
export function FlightScene() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%', display: 'block' }}
      camera={{ position: [4, 3, 12], fov: 50 }}
    >
      <color attach="background" args={[color.skyZenith]} />
      <directionalLight position={[5, 8, 3]} intensity={1.5} castShadow />
      <ambientLight intensity={0.4} />
      <Plane />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color={color.grassLight} />
      </mesh>
    </Canvas>
  )
}
