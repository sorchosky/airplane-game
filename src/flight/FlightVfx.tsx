import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three'
import { color } from '../styles/tokens'
import { heightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useFlightStore } from './flightStore'
import { lowPassIntensity } from './flightVfxMath'

const matrix = new Matrix4()
const position = new Vector3()
const scale = new Vector3()
const up = new Vector3(0, 1, 0)

/** Low-pass dust and spray contact feedback. */
export function FlightVfx({ paused }: { paused: boolean }) {
  const contact = useRef<InstancedMesh>(null)
  const puffGeometry = useMemo(() => new PlaneGeometry(1, 1), [])
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

  useEffect(
    () => () => {
      puffGeometry.dispose()
      puffMaterial.dispose()
    },
    [puffGeometry, puffMaterial],
  )

  useFrame(({ camera, clock }) => {
    const { state } = useFlightStore.getState()
    const puffMesh = contact.current
    if (!puffMesh) return

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
  })

  return (
    <instancedMesh ref={contact} args={[puffGeometry, puffMaterial, 12]} frustumCulled={false} />
  )
}
