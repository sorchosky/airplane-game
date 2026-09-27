import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh } from 'three'
import { activeShot } from '../debug/shots'
import { usePerfStore } from '../debug/perfStore'
import { useFlightStore } from '../flight/flightStore'
import { useQualityStore } from '../render/qualityStore'
import { CellCache } from './cellCache'
import { chunkCoord } from './chunks'
import { foliageExclusions, foliageExclusionVersion } from './foliageExclusions'
import { createGrassMaterial, foliageUniforms, grassUniforms } from './foliageMaterial'
import { surfaceHeightAt } from './heightfield'
import { buildGrassCard, buildGrassMask } from './models/tree'
import { altitudeFalloff, cellsInRange, scatterGrassTile, selectGrass } from './scatter'
import { TERRAIN_CONFIG } from './terrainConfig'

/** Cards the buffer holds. `selectGrass` fills it nearest tile first, so overflow is the far edge. */
const CAPACITY = 9000

/** ms per frame spent scattering new grass tiles. */
const SCATTER_BUDGET_MS = 2

/** Grass tiles kept cached. */
const CACHE_LIMIT = 600

/** Sway multiplier range as airspeed goes from stalled to a fast dive, relative to cruise. */
const SWAY_MIN = 0.4
const SWAY_MAX = 1.8

/** m of push at the centre of the downwash when the plane is right on the grass. */
const DOWNWASH_PUSH = 0.9

/**
 * Wind-animated grass cards within `grassDistance` of the plane (#75). One draw call: every card
 * is an instance of one two-quad card. Hidden entirely above `grassAltitudeMax` over the ground.
 * The instance buffer is rebuilt when the plane crosses into a new grass tile.
 */
export function Grass() {
  const f = TERRAIN_CONFIG.foliage
  const { mesh, attribute, mask } = useMemo(() => {
    const card = buildGrassCard()
    const geometry = new InstancedBufferGeometry()
    geometry.index = card.index
    for (const [name, value] of Object.entries(card.attributes)) geometry.setAttribute(name, value)
    const attribute = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4)
    attribute.setUsage(DynamicDrawUsage)
    geometry.setAttribute('grassCard', attribute)
    geometry.instanceCount = 0
    const mask = buildGrassMask()
    const mesh = new Mesh(geometry, createGrassMaterial(mask, TERRAIN_CONFIG.foliage))
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.visible = false
    return { mesh, attribute, mask }
  }, [])
  const cache = useMemo(
    () =>
      new CellCache<Float32Array>(
        (cell) => scatterGrassTile(cell.x, cell.z, TERRAIN_CONFIG, foliageExclusions()),
        CACHE_LIMIT,
      ),
    [],
  )
  const state = useRef({
    tileX: Number.NaN,
    tileZ: Number.NaN,
    density: Number.NaN,
    exclusions: -1,
    dirty: true,
    ready: false,
  })

  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as { dispose(): void }).dispose()
      mask.dispose()
    },
    [mesh, mask],
  )

  useFrame((_state, delta) => {
    const s = state.current
    const { state: flight, params } = useFlightStore.getState()
    const { x, y, z } = flight.position
    const density = useQualityStore.getState().foliageDensity

    // Per-frame uniforms: time, altitude share, sway and downwash.
    if (!activeShot()) foliageUniforms.foliageTime.value += delta
    const agl = y - surfaceHeightAt(x, z, TERRAIN_CONFIG)
    const altitude = altitudeFalloff(agl, TERRAIN_CONFIG)
    grassUniforms.grassAltitude.value = altitude
    const speedScale = Math.min(SWAY_MAX, Math.max(SWAY_MIN, flight.speed / params.cruiseSpeed))
    grassUniforms.grassSway.value = f.grassSway * speedScale
    const downwash = grassUniforms.grassDownwash.value
    downwash[0] = x
    downwash[1] = z
    downwash[2] = DOWNWASH_PUSH * (1 - Math.min(1, Math.max(0, agl / f.downwashHeight)))
    downwash[3] = f.downwashRadius

    const tileX = chunkCoord(x, f.grassTile)
    const tileZ = chunkCoord(z, f.grassTile)
    const exclusions = foliageExclusionVersion()
    if (exclusions !== s.exclusions) {
      s.exclusions = exclusions
      cache.clear()
      s.tileX = Number.NaN
    }
    if (tileX !== s.tileX || tileZ !== s.tileZ) {
      s.tileX = tileX
      s.tileZ = tileZ
      cache.want(cellsInRange(x, z, f.grassDistance, f.grassTile))
      s.dirty = true
    }
    if (density !== s.density) {
      s.density = density
      s.dirty = true
    }

    const ready = cache.work(SCATTER_BUDGET_MS)
    if (ready && s.dirty) {
      const reach = foliageUniforms.foliageReach.value
      const uploadDensity = Math.max(density, reach * reach)
      const cards = attribute.array as Float32Array
      const count = selectGrass(cache.wantedData(), x, z, uploadDensity, TERRAIN_CONFIG, cards)
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(0, count * 4)
      attribute.needsUpdate = true
      ;(mesh.geometry as InstancedBufferGeometry).instanceCount = count
      s.dirty = false
    }
    mesh.visible = altitude > 0 && (mesh.geometry as InstancedBufferGeometry).instanceCount > 0

    if (ready !== s.ready) {
      s.ready = ready
      usePerfStore.setState({ grassReady: ready })
    }
  })

  return <primitive object={mesh} />
}
