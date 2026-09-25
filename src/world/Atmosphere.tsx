import { color } from '../styles/tokens'
import { LIGHT_INTENSITY, SUN_DIRECTION } from './atmosphere'
import { installAtmosphereFog } from './atmosphereShader'
import { Clouds } from './Clouds'
import { Sky } from './Sky'

// Patch Three's fog chunks at import time, before any material in the scene compiles.
installAtmosphereFog()

/** m, how far along `SUN_DIRECTION` the light sits. Only the direction matters for a sun. */
const SUN_LIGHT_DISTANCE = 100

/**
 * Sky, sun light, fill light, haze and clouds. The scene `fog` only switches haze on for
 * built-in materials; its colour and range are unused, since the haze model in
 * `atmosphereShader.ts` replaces Three's fog math.
 */
export function Atmosphere() {
  const [x, y, z] = SUN_DIRECTION
  return (
    <>
      <fog attach="fog" args={[color.fog, 0, 1]} />
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
