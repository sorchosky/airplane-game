import { Canvas } from '@react-three/fiber'
import { color } from '../styles/tokens'

// Placeholder scene carried over from the #6 scaffold. Real flight, camera
// and world content land in M1/M2/M3.
export function FlightScene() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%', display: 'block' }}
      camera={{ position: [4, 3, 6], fov: 50 }}
    >
      <color attach="background" args={[color.sky]} />
      <directionalLight position={[5, 8, 3]} intensity={1.5} castShadow />
      <ambientLight intensity={0.4} />
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color.accent} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color={color.ground} />
      </mesh>
    </Canvas>
  )
}
