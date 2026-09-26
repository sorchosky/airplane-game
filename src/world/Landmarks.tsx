import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Object3D,
  Vector3,
  type BufferGeometry,
} from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { activeShot } from '../debug/shots'
import { heightAt } from './heightfield'
import {
  createLandmarkMaterial,
  createLandmarkOutlineMaterial,
  createMistMaterial,
  createRibbonMaterial,
  landmarkTimeUniform,
} from './landmarkMaterials'
import { getLandmarks, LANDMARK_CONFIG, type Landmark } from './landmarks'
import { buildArch } from './models/arch'
import { mergeParts, seededRandom, type LocalGround } from './models/kit'
import { buildRuins } from './models/ruins'
import { buildTower } from './models/tower'
import { buildTree } from './models/tree'
import { buildWaterfall } from './models/waterfall'
import { TERRAIN_CONFIG } from './terrainConfig'

/** Mist puffs at the foot of the waterfall. */
const MIST_PUFFS = 12
/** s, how long one puff takes to billow up and fade */
const MIST_CYCLE = 5

/** Model-to-world matrix: turn by the landmark's yaw, then move to its origin. */
function landmarkMatrix(landmark: Landmark): Matrix4 {
  return new Matrix4().makeRotationY(landmark.yaw).setPosition(landmark.x, landmark.y, landmark.z)
}

/** Ground under a model-space point, relative to the model's origin. */
function localGround(landmark: Landmark): LocalGround {
  const cos = Math.cos(landmark.yaw)
  const sin = Math.sin(landmark.yaw)
  return (x, z) =>
    heightAt(landmark.x + x * cos + z * sin, landmark.z - x * sin + z * cos, TERRAIN_CONFIG) -
    landmark.y
}

interface LandmarkMeshes {
  solid: BufferGeometry
  hull: BufferGeometry
  ribbon: BufferGeometry | null
  /** World position where the fall hits the lake. */
  plunge: Vector3 | null
}

function buildLandmarkMeshes(landmarks: readonly Landmark[]): LandmarkMeshes {
  const solids: BufferGeometry[] = []
  let ribbon: BufferGeometry | null = null
  let plunge: Vector3 | null = null
  for (const landmark of landmarks) {
    const matrix = landmarkMatrix(landmark)
    let geometry: BufferGeometry
    switch (landmark.kind) {
      case 'tower':
        geometry = buildTower(landmark.relief)
        break
      case 'arch':
        geometry = buildArch(landmark.relief, localGround(landmark))
        break
      case 'tree':
        geometry = buildTree(landmark.relief)
        break
      case 'ruins':
        geometry = buildRuins(localGround(landmark))
        break
      case 'waterfall': {
        const model = buildWaterfall(
          landmark.plungeDistance ?? LANDMARK_CONFIG.waterfallShoreMin,
          landmark.y - TERRAIN_CONFIG.waterLevel,
          landmark.relief,
        )
        geometry = model.cliff
        ribbon = model.ribbon.applyMatrix4(matrix)
        plunge = new Vector3(...model.plunge).applyMatrix4(matrix)
        break
      }
    }
    solids.push(geometry.applyMatrix4(matrix))
  }
  const solid = mergeParts(solids)
  // The hull wants one smoothed normal per corner, or it splits open along every facet edge.
  const hull = toCreasedNormals(solid, Math.PI)
  return { solid, hull, ribbon, plunge }
}

/**
 * The five landmarks (#76): tower, arch, waterfall, giant tree and ruins, placed on the horizon
 * around spawn by `placeLandmarks`. Four draw calls in all: every solid model merged into one toon
 * mesh plus its outline hull, the waterfall's ribbon, and its instanced mist.
 */
export function Landmarks() {
  const meshes = useMemo(() => buildLandmarkMeshes(getLandmarks()), [])
  const material = useMemo(() => createLandmarkMaterial(), [])
  const outline = useMemo(() => createLandmarkOutlineMaterial(), [])
  const ribbonMaterial = useMemo(() => createRibbonMaterial(), [])

  const mistMaterial = useMemo(() => createMistMaterial(), [])
  const mist = useMemo(() => {
    if (!meshes.plunge) return null
    const instanced = new InstancedMesh(new IcosahedronGeometry(1, 1), mistMaterial, MIST_PUFFS)
    // The puffs move every frame; their bounds are the plunge pool, not the unit ball at origin.
    instanced.frustumCulled = false
    return instanced
  }, [meshes, mistMaterial])

  const puffs = useMemo(() => {
    const random = seededRandom(77)
    return Array.from({ length: MIST_PUFFS }, (_, i) => ({
      phase: i / MIST_PUFFS,
      angle: random() * Math.PI * 2,
      spread: 6 + random() * 16,
      size: 7 + random() * 7,
    }))
  }, [])
  const dummy = useMemo(() => new Object3D(), [])

  useEffect(
    () => () => {
      meshes.solid.dispose()
      meshes.hull.dispose()
      meshes.ribbon?.dispose()
      material.dispose()
      outline.dispose()
      ribbonMaterial.dispose()
      mistMaterial.dispose()
      if (mist) {
        mist.geometry.dispose()
        mist.dispose()
      }
    },
    [meshes, material, outline, ribbonMaterial, mistMaterial, mist],
  )

  useFrame((_state, delta) => {
    // `?shot=` bookmarks freeze the water so a capture is repeatable.
    if (!activeShot()) landmarkTimeUniform.value += delta
    if (!mist || !meshes.plunge) return
    const t = landmarkTimeUniform.value / MIST_CYCLE
    const { x, y, z } = meshes.plunge
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i]
      if (!puff) continue
      // Each puff billows out and up from the plunge, swelling then shrinking to nothing, so the
      // loop back to the start is never seen.
      const life = (t + puff.phase) % 1
      const swell = Math.sin(life * Math.PI)
      const out = puff.spread * (0.4 + life)
      dummy.position.set(
        x + Math.cos(puff.angle) * out,
        y + 2 + life * 22,
        z + Math.sin(puff.angle) * out,
      )
      const size = puff.size * (0.5 + life) * swell
      dummy.scale.set(size, size * 0.8, size)
      dummy.updateMatrix()
      mist.setMatrixAt(i, dummy.matrix)
    }
    mist.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <mesh geometry={meshes.solid} material={material}>
        <mesh geometry={meshes.hull} material={outline} raycast={() => undefined} />
      </mesh>
      {meshes.ribbon && <mesh geometry={meshes.ribbon} material={ribbonMaterial} />}
      {mist && <primitive object={mist} />}
    </group>
  )
}
