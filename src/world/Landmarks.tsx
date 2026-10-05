import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  type Group,
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
import { Boats } from './Boats'
import { buildArch } from './models/arch'
import { mergeParts, seededRandom, type LocalGround } from './models/kit'
import { buildRuins } from './models/ruins'
import { buildTower } from './models/tower'
import { buildResort } from './models/resort'
import { buildTown } from './models/town'
import { buildTree } from './models/tree'
import { buildWaterfall } from './models/waterfall'
import { getResort } from './resort'
import { getTown } from './town'
import { TERRAIN_CONFIG } from './terrainConfig'
import { imageShift, nearestImages } from './wrap'

/** Mist puffs at the foot of the waterfall. */
const MIST_PUFFS = 12
/** s, how long one puff takes to billow up and fade */
const MIST_CYCLE = 5

/** Copies of the merged landmark mesh: enough for every landmark's nearest image (#177). */
const COPIES = 4

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
  // The fishing town (#224) merges into the same draw, in the world's frame: no yaw.
  const town = getTown()
  solids.push(
    buildTown(town.layout, town.ground).applyMatrix4(
      new Matrix4().makeTranslation(town.x, town.y, town.z),
    ),
  )
  // The island resort (#235) merges in too, turned to face the sea.
  const resort = getResort()
  solids.push(
    buildResort(resort.layout, resort.ground).applyMatrix4(
      new Matrix4().makeRotationY(resort.yaw).setPosition(resort.x, resort.y, resort.z),
    ),
  )
  const solid = mergeParts(solids)
  // The hull wants one smoothed normal per corner, or it splits open along every facet edge.
  const hull = toCreasedNormals(solid, Math.PI)
  return { solid, hull, ribbon, plunge }
}

/**
 * The five landmarks (#76): tower, arch, waterfall, giant tree and ruins, placed at their route
 * stations (#173) by `placeLandmarks`, and the fishing town (#224). Four draw calls in all: every solid model merged into one toon
 * mesh plus its outline hull, the waterfall's ribbon, and its instanced mist.
 *
 * The world wraps (#177): each landmark is drawn at its copy nearest the camera. The merged mesh
 * is drawn once per distinct image shift (`nearestImages`), so away from the seam it is one copy
 * and two draw calls as before; looking across the seam it can take up to four.
 */
export function Landmarks() {
  const landmarks = getLandmarks()
  const meshes = useMemo(() => buildLandmarkMeshes(landmarks), [landmarks])
  const copies = useRef<(Group | null)[]>([])
  // The merged mesh holds the town and the resort too, so its nearest copy counts when picking the copies drawn.
  const imageAnchors = useMemo(() => [...landmarks, getTown(), getResort()], [landmarks])
  const waterfallRef = useRef<Group>(null)
  const shifts = useMemo(() => new Float64Array(COPIES * 2), [])
  const waterfall = landmarks.find((landmark) => landmark.kind === 'waterfall') ?? null
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

  useFrame(({ camera }, delta) => {
    const period = TERRAIN_CONFIG.worldPeriod
    const { x: cx, z: cz } = camera.position
    const count = nearestImages(imageAnchors, cx, cz, period, shifts)
    for (let i = 0; i < COPIES; i++) {
      const copy = copies.current[i]
      if (!copy) continue
      copy.visible = i < count
      if (copy.visible) copy.position.set(shifts[i * 2] ?? 0, 0, shifts[i * 2 + 1] ?? 0)
    }
    const fall = waterfallRef.current
    if (fall && waterfall) {
      fall.position.set(imageShift(waterfall.x, cx, period), 0, imageShift(waterfall.z, cz, period))
    }

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
      {Array.from({ length: COPIES }, (_, i) => (
        <group
          key={i}
          ref={(group) => {
            copies.current[i] = group
          }}
          visible={i === 0}
        >
          <mesh geometry={meshes.solid} material={material}>
            <mesh geometry={meshes.hull} material={outline} raycast={() => undefined} />
          </mesh>
        </group>
      ))}
      <Boats />
      <group ref={waterfallRef}>
        {meshes.ribbon && <mesh geometry={meshes.ribbon} material={ribbonMaterial} />}
        {mist && <primitive object={mist} />}
      </group>
    </group>
  )
}
