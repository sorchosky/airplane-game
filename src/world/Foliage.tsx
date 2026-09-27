import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Material,
} from 'three'
import { activeShot } from '../debug/shots'
import { usePerfStore } from '../debug/perfStore'
import { useFlightStore } from '../flight/flightStore'
import { useQualityStore } from '../render/qualityStore'
import { CellCache } from './cellCache'
import { foliageExclusions, foliageExclusionVersion } from './foliageExclusions'
import {
  createFoliageBodyMaterial,
  createFoliageHullMaterial,
  foliageUniforms,
} from './foliageMaterial'
import { FOLIAGE_MODEL_BUILDERS } from './models/tree'
import {
  cellsInRange,
  densityReach,
  FOLIAGE_KINDS,
  foliageReach,
  scatterChunk,
  selectFoliage,
  type ChunkFoliage,
  type FoliageKind,
} from './scatter'
import { chunkCoord } from './chunks'
import { TERRAIN_CONFIG } from './terrainConfig'

/** Instances each variant's buffer holds. Well above what `selectFoliage` picks at full density. */
const CAPACITY: Record<FoliageKind, number> = {
  round: 3000,
  conifer: 3000,
  bush: 1000,
  boulder: 1000,
}

/** ms per frame spent scattering new chunks. */
const SCATTER_BUDGET_MS = 3

/** Foliage chunks kept cached. About twice what is in range, so turning back is free. */
const CACHE_LIMIT = 1200

/** s, time constant of the density fade after a governor step: settled in about 3 s. */
const DENSITY_EASE_TIME = 0.8

interface Variant {
  body: InstancedMesh
  hull: InstancedMesh
  keep: InstancedBufferAttribute
  materials: Material[]
}

function createVariant(kind: FoliageKind): Variant {
  const f = TERRAIN_CONFIG.foliage
  const fadeEnd = foliageReach(kind, TERRAIN_CONFIG)
  const model = FOLIAGE_MODEL_BUILDERS[kind]()
  const capacity = CAPACITY[kind]
  const bodyMaterial = createFoliageBodyMaterial(f.foliageFadeStart, fadeEnd)
  const hullMaterial = createFoliageHullMaterial(f.foliageFadeStart, fadeEnd, f)
  const body = new InstancedMesh(model.body, bodyMaterial, capacity)
  const hull = new InstancedMesh(model.hull, hullMaterial, capacity)
  // The hull draws the nearest instances of the same buffers: one upload feeds both meshes.
  body.instanceMatrix.setUsage(DynamicDrawUsage)
  hull.instanceMatrix = body.instanceMatrix
  const keep = new InstancedBufferAttribute(new Float32Array(capacity), 1)
  keep.setUsage(DynamicDrawUsage)
  model.body.setAttribute('foliageKeep', keep)
  model.hull.setAttribute('foliageKeep', keep)
  for (const mesh of [body, hull]) {
    mesh.count = 0
    mesh.visible = false
    // Foliage surrounds the plane, so it's always on screen: skip the bounds pass.
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
  }
  return { body, hull, keep, materials: [bodyMaterial, hullMaterial] }
}

const matrix = new Matrix4()
const position = new Vector3()
const rotation = new Quaternion()
const scale = new Vector3()
const up = new Vector3(0, 1, 0)

/** Writes a selection into a variant's buffers. Runs on rebuilds only, never per frame. */
function upload(variant: Variant, instances: ChunkFoliage[FoliageKind], outlined: number): void {
  const count = Math.min(instances.length, variant.keep.count)
  const keep = variant.keep.array as Float32Array
  for (let i = 0; i < count; i++) {
    const instance = instances[i]
    if (!instance) break
    position.set(instance.x, instance.y, instance.z)
    rotation.setFromAxisAngle(up, instance.yaw)
    scale.setScalar(instance.scale)
    variant.body.setMatrixAt(i, matrix.compose(position, rotation, scale))
    keep[i] = instance.keep
  }
  variant.body.instanceMatrix.clearUpdateRanges()
  variant.body.instanceMatrix.addUpdateRange(0, count * 16)
  variant.body.instanceMatrix.needsUpdate = true
  variant.keep.clearUpdateRanges()
  variant.keep.addUpdateRange(0, count)
  variant.keep.needsUpdate = true
  variant.body.count = count
  variant.hull.count = Math.min(outlined, count)
  variant.body.visible = count > 0
  variant.hull.visible = variant.hull.count > 0
}

/**
 * Trees, bushes and boulders around the plane (#75): one instanced mesh per variant and one per
 * outline hull, so at most eight draw calls. Chunks are scattered a few per frame into a cache
 * (`scatter.ts`); the GPU buffers are rebuilt when the plane crosses into a new foliage chunk, the
 * governor's density changes, or an exclusion is added. Per frame, only uniforms change.
 */
export function Foliage() {
  const group = useMemo(() => new Group(), [])
  const variants = useMemo(() => {
    const map = new Map<FoliageKind, Variant>()
    for (const kind of FOLIAGE_KINDS) map.set(kind, createVariant(kind))
    return map
  }, [])
  const cache = useMemo(
    () =>
      new CellCache<ChunkFoliage>(
        (cell) => scatterChunk(cell.x, cell.z, TERRAIN_CONFIG, foliageExclusions()),
        CACHE_LIMIT,
      ),
    [],
  )
  const state = useRef({
    cellX: Number.NaN,
    cellZ: Number.NaN,
    density: Number.NaN,
    exclusions: -1,
    dirty: true,
    ready: false,
  })

  useEffect(() => {
    for (const variant of variants.values()) group.add(variant.body, variant.hull)
    return () => {
      for (const variant of variants.values()) {
        group.remove(variant.body, variant.hull)
        variant.body.geometry.dispose()
        variant.hull.geometry.dispose()
        for (const material of variant.materials) material.dispose()
      }
    }
  }, [group, variants])

  useFrame((_state, delta) => {
    const f = TERRAIN_CONFIG.foliage
    const s = state.current
    const { x, z } = useFlightStore.getState().state.position
    const density = useQualityStore.getState().foliageDensity

    // Uniforms: the plane, and the density eased toward the governor's (snapped for shots).
    foliageUniforms.foliageFocus.value[0] = x
    foliageUniforms.foliageFocus.value[1] = z
    const reach = foliageUniforms.foliageReach
    const target = densityReach(density)
    reach.value = activeShot()
      ? target
      : reach.value + (target - reach.value) * (1 - Math.exp(-delta / DENSITY_EASE_TIME))

    const cellX = chunkCoord(x, f.foliageChunk)
    const cellZ = chunkCoord(z, f.foliageChunk)
    const exclusions = foliageExclusionVersion()
    if (exclusions !== s.exclusions) {
      s.exclusions = exclusions
      cache.clear()
      s.cellX = Number.NaN
    }
    if (cellX !== s.cellX || cellZ !== s.cellZ) {
      s.cellX = cellX
      s.cellZ = cellZ
      cache.want(cellsInRange(x, z, f.foliageDistance, f.foliageChunk))
      s.dirty = true
    }
    if (density !== s.density) {
      s.density = density
      s.dirty = true
    }

    const ready = cache.work(SCATTER_BUDGET_MS)
    if (ready && s.dirty) {
      // While the density is still easing down, keep what's still shrinking in the buffers.
      const uploadDensity = Math.max(density, reach.value * reach.value)
      const selection = selectFoliage(cache.wantedData(), x, z, uploadDensity, TERRAIN_CONFIG)
      for (const kind of FOLIAGE_KINDS) {
        const variant = variants.get(kind)
        if (variant) upload(variant, selection.instances[kind], selection.outlined[kind])
      }
      s.dirty = false
    }
    if (ready !== s.ready) {
      s.ready = ready
      usePerfStore.setState({ foliageReady: ready })
    }
  })

  return <primitive object={group} />
}
