import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group } from 'three'
import { usePerfStore } from '../debug/perfStore'
import { useFlightStore } from '../flight/flightStore'
import { TERRAIN_CONFIG } from './terrainConfig'
import { createTerrainMaterial } from './terrainMaterial'
import { TerrainStreamer } from './terrainStreamer'

function createTerrainWorker(): Worker {
  return new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
}

/** Leave a core for the main thread; two workers are plenty to keep up with a boundary crossing. */
function workerCount(): number {
  const cores = typeof navigator === 'undefined' ? 2 : (navigator.hardwareConcurrency ?? 2)
  return Math.max(1, Math.min(2, cores - 1))
}

/**
 * Streams terrain tiles around the plane. Toon-shaded and colored per pixel by height and slope
 * (`terrainMaterial.ts`), no outlines.
 */
export function Terrain() {
  // The group and material hold no workers, so they're safe to create during render. The
  // streamer owns workers and is created in an effect so StrictMode's mount/unmount/mount in dev
  // can't leave a disposed streamer behind.
  const group = useMemo(() => new Group(), [])
  const material = useMemo(() => createTerrainMaterial(TERRAIN_CONFIG), [])
  const streamerRef = useRef<TerrainStreamer | null>(null)

  useEffect(() => {
    const streamer = new TerrainStreamer(
      group,
      material,
      TERRAIN_CONFIG,
      createTerrainWorker,
      workerCount(),
    )
    streamerRef.current = streamer
    return () => {
      streamer.dispose()
      streamerRef.current = null
    }
  }, [group, material])

  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const streamer = streamerRef.current
    if (!streamer) return
    const { position } = useFlightStore.getState().state
    streamer.update(position.x, position.z)
    if (usePerfStore.getState().terrainTiles !== streamer.tileCount) {
      usePerfStore.setState({ terrainTiles: streamer.tileCount })
    }
  })

  return <primitive object={group} />
}
