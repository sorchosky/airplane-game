import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DirectionalLight, Fog, HemisphereLight } from 'three'
import { useClockStore } from './clockStore'
import { useQualityStore } from '../render/qualityStore'
import { hazeForViewDistance, SUN_DIRECTION } from './atmosphere'
import { applyBlendedLighting } from './atmosphereUniforms'
import { horizonCurveRadius } from '../app/urlFlags'
import { installAtmosphereFog } from './atmosphereShader'
import { Clouds } from './Clouds'
import { activeLighting } from './lightingPreset'
import { Sky } from './Sky'
import { TERRAIN_CONFIG } from './terrainConfig'
import { createBlendedLighting, timeOfDay } from './timeOfDay'
import { Stars } from './Stars'

// Patch Three's fog chunks at import time, before any material in the scene compiles.
installAtmosphereFog({ curveRadius: horizonCurveRadius() })

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

function DayCycleDriver() {
  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<HemisphereLight>(null)
  const scene = useThree((s) => s.scene)
  const sample = useMemo(createBlendedLighting, [])
  useFrame(() => {
    timeOfDay(useClockStore.getState().time.minutes, sample)
    applyBlendedLighting(sample)
    const key = sun.current
    const fill = ambient.current
    const c = sample.colors
    const direction = sample.direction
    if (key) {
      key.position.set(
        direction[0]! * SUN_LIGHT_DISTANCE,
        direction[1]! * SUN_LIGHT_DISTANCE,
        direction[2]! * SUN_LIGHT_DISTANCE,
      )
      key.color.setRGB(c.sun[0]!, c.sun[1]!, c.sun[2]!, 'srgb')
      key.intensity = sample.sunIntensity
    }
    if (fill) {
      fill.color.setRGB(c.ambientSky[0]!, c.ambientSky[1]!, c.ambientSky[2]!, 'srgb')
      fill.groundColor.setRGB(c.ambientGround[0]!, c.ambientGround[1]!, c.ambientGround[2]!, 'srgb')
      fill.intensity = sample.hemisphereIntensity
    }
    if (scene.fog instanceof Fog) scene.fog.color.setRGB(c.fog[0]!, c.fog[1]!, c.fog[2]!, 'srgb')
  })
  const light = activeLighting()
  const [x, y, z] = SUN_DIRECTION
  return (
    <>
      <directionalLight
        ref={sun}
        position={[x * SUN_LIGHT_DISTANCE, y * SUN_LIGHT_DISTANCE, z * SUN_LIGHT_DISTANCE]}
        color={light.sun}
        intensity={light.sunIntensity}
      />
      <hemisphereLight
        ref={ambient}
        args={[light.ambientSky, light.ambientGround, light.hemisphereIntensity]}
      />
    </>
  )
}

/**
 * Sky, sun light, fill light, haze and clouds. The scene `fog` switches haze on for built-in
 * materials, and its `near` and `far` carry the far-haze fade range; its colour is unused, since
 * the haze model in `atmosphereShader.ts` replaces Three's fog math.
 */
export function Atmosphere() {
  const light = activeLighting()
  return (
    <>
      <fog attach="fog" args={[light.fog, FULL_HAZE.start, FULL_HAZE.end]} />
      <HazeDriver />
      <Sky />
      <Stars />
      <DayCycleDriver />
      <Clouds />
    </>
  )
}
