import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three'
import { color } from '../styles/tokens'
import { heightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useFlightStore } from './flightStore'
import { FLIGHT_VFX, lowPassIntensity, speedVfxIntensity } from './flightVfxMath'

const matrix = new Matrix4()
const position = new Vector3()
const scale = new Vector3()
const up = new Vector3(0, 1, 0)

function reducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** Camera-edge air ribbons, low-pass dust/spray, and distant ambient bird silhouettes. */
export function FlightVfx({ paused }: { paused: boolean }) {
  const streaks = useRef<InstancedMesh>(null)
  const contact = useRef<InstancedMesh>(null)
  const birds = useRef<InstancedMesh>(null)
  const phases = useMemo(
    () => Array.from({ length: FLIGHT_VFX.streakCount }, (_, i) => ((i * 0.61803398875) % 1) * 40),
    [],
  )
  const streakGeometry = useMemo(() => new PlaneGeometry(0.035, 1), [])
  const puffGeometry = useMemo(() => new PlaneGeometry(1, 1), [])
  const birdGeometry = useMemo(() => {
    const geometry = new PlaneGeometry(2.6, 0.55)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }, [])
  const streakMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: color.windStreak,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    [],
  )
  const puffMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: color.dust,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    [],
  )
  const birdMaterial = useMemo(() => new MeshBasicMaterial({ color: color.bird, side: 2 }), [])

  useEffect(
    () => () => {
      streakGeometry.dispose()
      puffGeometry.dispose()
      birdGeometry.dispose()
      streakMaterial.dispose()
      puffMaterial.dispose()
      birdMaterial.dispose()
    },
    [birdGeometry, birdMaterial, puffGeometry, puffMaterial, streakGeometry, streakMaterial],
  )

  useFrame(({ camera, clock }) => {
    const { state, params } = useFlightStore.getState()
    const streakMesh = streaks.current
    const puffMesh = contact.current
    const birdMesh = birds.current
    if (!streakMesh || !puffMesh || !birdMesh) return

    const intensity =
      reducedMotion() || paused ? 0 : speedVfxIntensity(state.speed, params.cruiseSpeed)
    streakMesh.visible = intensity > 0
    if (streakMesh.visible) {
      for (let i = 0; i < FLIGHT_VFX.streakCount; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const lane = 3.5 + (i % 6) * 1.25
        const travel = (phases[i]! + clock.elapsedTime * state.speed) % 40
        position
          .set(side * lane, ((i * 7) % 9) - 3, 12 - travel)
          .applyAxisAngle(up, state.heading)
          .add(state.position)
        scale.set(1, 8 + (i % 4) * 4, intensity)
        matrix.compose(position, camera.quaternion, scale)
        streakMesh.setMatrixAt(i, matrix)
      }
      streakMesh.instanceMatrix.needsUpdate = true
    }

    const ground = heightAt(state.position.x, state.position.z, TERRAIN_CONFIG)
    const surface = Math.max(ground, TERRAIN_CONFIG.waterLevel)
    const low = paused ? 0 : lowPassIntensity(state.position.y - surface)
    puffMesh.visible = low > 0
    if (puffMesh.visible) {
      puffMaterial.color.copy(
        new Color(ground < TERRAIN_CONFIG.waterLevel ? color.spray : color.dust),
      )
      for (let i = 0; i < 12; i++) {
        const phase = (clock.elapsedTime * 1.8 + i / 12) % 1
        const back = phase * 24
        position
          .set(Math.sin(i * 8.3) * (1 + phase * 5), surface + 0.15 + phase * 2, back)
          .applyAxisAngle(up, state.heading)
        position.x += state.position.x
        position.z += state.position.z
        scale.setScalar((1 + phase * 4) * low * (1 - phase))
        matrix.compose(position, camera.quaternion, scale)
        puffMesh.setMatrixAt(i, matrix)
      }
      puffMesh.instanceMatrix.needsUpdate = true
    }

    // Three slow V formations remain well ahead and above the player, rearranging seamlessly.
    for (let i = 0; i < 15; i++) {
      const flock = Math.floor(i / 5)
      const wing = i % 5
      const side = wing % 2 === 0 ? -1 : 1
      const rank = Math.ceil(wing / 2)
      position
        .set(side * rank * 7 + flock * 45 - 45, 38 + flock * 13, -150 - flock * 75 + rank * 5)
        .applyAxisAngle(up, state.heading)
        .add(state.position)
      scale.set(1, 1 + Math.sin(clock.elapsedTime * 3 + i) * 0.25, 1)
      matrix.compose(position, camera.quaternion, scale)
      birdMesh.setMatrixAt(i, matrix)
    }
    birdMesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh
        ref={streaks}
        args={[streakGeometry, streakMaterial, FLIGHT_VFX.streakCount]}
        frustumCulled={false}
      />
      <instancedMesh ref={contact} args={[puffGeometry, puffMaterial, 12]} frustumCulled={false} />
      <instancedMesh ref={birds} args={[birdGeometry, birdMaterial, 15]} frustumCulled={false} />
    </>
  )
}
