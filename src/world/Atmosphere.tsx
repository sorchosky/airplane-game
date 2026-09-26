import { useFrame, useThree } from '@react-three/fiber'
import { Fog } from 'three'
import { useQualityStore } from '../render/qualityStore'
import { color } from '../styles/tokens'
import { hazeForViewDistance, LIGHT_INTENSITY, SUN_DIRECTION } from './atmosphere'
import { installAtmosphereFog } from './atmosphereShader'
import { Clouds } from './Clouds'
import { Sky } from './Sky'
import { TERRAIN_CONFIG } from './terrainConfig'

// Patch Three's fog chunks at import time, before any material in the scene compiles.
installAtmosphereFog()

/** m, how far along `SUN_DIRECTION` the light sits. Only the direction matters for a sun. */
const SUN_LIGHT_DISTANCE = 100

/** s, time constant of the far haze easing to a new view distance: settled in about 2 s. */
const HAZE_EASE_TIME = 0.5

const FULL_HAZE = hazeForViewDistance(TERRAIN_CONFIG.viewDistance, TERRAIN_CONFIG)

/**
 * Eases the far haze to the view distance in use. It follows the nearer of the governor's request
 * and what the terrain is actually drawing: closing in as soon as a shorter distance is asked for
 * (before the far tiles go, which `Terrain` holds back until this has settled), and opening out
 * only once the longer layout is on screen.
 */
function HazeDriver() {
  const scene = useThree((s) => s.scene)
  useFrame((_state, delta) => {
    const fog = scene.fog
    if (!(fog instanceof Fog)) return
    const { viewDistance, appliedViewDistance } = useQualityStore.getState()
    const target = hazeForViewDistance(Math.min(viewDistance, appliedViewDistance), TERRAIN_CONFIG)
    const k = 1 - Math.exp(-delta / HAZE_EASE_TIME)
    fog.near += (target.start - fog.near) * k
    fog.far += (target.end - fog.far) * k
  })
  return null
}

/**
 * Sky, sun light, fill light, haze and clouds. The scene `fog` switches haze on for built-in
 * materials, and its `near` and `far` carry the far-haze fade range; its colour is unused, since
 * the haze model in `atmosphereShader.ts` replaces Three's fog math.
 */
export function Atmosphere() {
  const [x, y, z] = SUN_DIRECTION
  return (
    <>
      <fog attach="fog" args={[color.fog, FULL_HAZE.start, FULL_HAZE.end]} />
      <HazeDriver />
      <Sky />
      <directionalLight
        position={[x * SUN_LIGHT_DISTANCE, y * SUN_LIGHT_DISTANCE, z * SUN_LIGHT_DISTANCE]}
        color={color.sun}
        intensity={LIGHT_INTENSITY.sun}
      />
      <hemisphereLight args={[color.skyZenith, color.grassShadow, LIGHT_INTENSITY.hemisphere]} />
      <Clouds />
    </>
  )
}
