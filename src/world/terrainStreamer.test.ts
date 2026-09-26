import { Group, MeshBasicMaterial, type Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { TERRAIN_CONFIG, type TerrainConfig } from './terrainConfig'
import type { TileRequest, TileResult } from './terrainWorkerProtocol'
import { TerrainStreamer } from './terrainStreamer'
import { buildTileBuffers } from './tileGeometry'

// A small world keeps these fast: two rings out to 1.5 km.
const config: TerrainConfig = {
  ...TERRAIN_CONFIG,
  lodRings: [
    { maxDistance: 600, spacing: 64, tileChunks: 1 },
    { maxDistance: 1500, spacing: 128, tileChunks: 2 },
  ],
  viewDistance: 1500,
}

/** Stands in for a Web Worker. Requests queue up until the test calls `respond`. */
class FakeWorker {
  onmessage: ((event: MessageEvent<TileResult>) => void) | null = null
  requests: TileRequest[] = []
  postMessage(request: TileRequest) {
    this.requests.push(request)
  }
  terminate() {}
  respond(): boolean {
    const request = this.requests.shift()
    if (!request) return false
    const buffers = buildTileBuffers(
      request.originX,
      request.originZ,
      request.quads,
      request.spacing,
      request.config,
    )
    this.onmessage?.({ data: { key: request.key, ...buffers } } as MessageEvent<TileResult>)
    return true
  }
}

function setup() {
  const group = new Group()
  const workers: FakeWorker[] = []
  const streamer = new TerrainStreamer(
    group,
    new MeshBasicMaterial(),
    config,
    () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    },
    2,
  )
  const flush = () => {
    while (workers.some((worker) => worker.respond())) {
      // keep answering until every queued request is done
    }
  }
  const visible = () => group.children.filter((child) => child.visible) as Mesh[]
  return { group, streamer, workers, flush, visible }
}

describe('TerrainStreamer', () => {
  it('shows nothing until the whole first layout is ready, then shows it all at once', () => {
    const { streamer, workers, flush, visible } = setup()
    streamer.update(100, 100)
    expect(visible()).toHaveLength(0)

    workers[0]?.respond()
    expect(visible()).toHaveLength(0)

    flush()
    expect(visible().length).toBeGreaterThan(0)
    expect(streamer.tileCount).toBe(visible().length)
  })

  it('keeps one worker request in flight per worker', () => {
    const { streamer, workers } = setup()
    streamer.update(100, 100)
    for (const worker of workers) expect(worker.requests).toHaveLength(1)
  })

  it('does nothing while the plane stays inside the same chunk', () => {
    const { streamer, workers, flush } = setup()
    streamer.update(100, 100)
    flush()
    streamer.update(400, 50)
    for (const worker of workers) expect(worker.requests).toHaveLength(0)
  })

  it('keeps the old layout on screen until the new one is complete', () => {
    const { streamer, workers, flush, visible } = setup()
    streamer.update(100, 100)
    flush()
    const before = visible().length

    streamer.update(100 + config.chunkSize, 100)
    workers[0]?.respond()
    expect(visible()).toHaveLength(before)

    flush()
    expect(streamer.tileCount).toBe(visible().length)
    const xs = visible().map((mesh) => mesh.position.x)
    expect(Math.max(...xs)).toBeGreaterThan(0)
  })

  it('reuses pooled meshes instead of creating new ones', () => {
    const { group, streamer, flush } = setup()
    streamer.update(100, 100)
    flush()
    const firstMeshes = new Set(group.children)

    // Move away and back: the tiles for the original layout should come out of the pool.
    streamer.update(100 + config.chunkSize, 100)
    flush()
    streamer.update(100, 100)
    flush()
    const reused = group.children.filter((mesh) => firstMeshes.has(mesh))
    expect(reused.length).toBeGreaterThan(0)
  })

  it('drops stale requests when the plane moves on before they run', () => {
    const { streamer, workers, flush, visible } = setup()
    streamer.update(100, 100)
    streamer.update(100 + 10 * config.chunkSize, 100)
    flush()
    const minX = Math.min(...visible().map((mesh) => mesh.position.x))
    // Nothing left over from the first layout around x = 0 (it's > 1.5 km behind).
    expect(minX).toBeGreaterThan(10 * config.chunkSize - config.viewDistance - 2 * config.chunkSize)
    expect(workers.every((worker) => worker.requests.length === 0)).toBe(true)
  })

  it('takes a new view distance only on the next chunk crossing, and reports it once shown', () => {
    const { streamer, flush } = setup()
    streamer.update(100, 100)
    flush()
    const fullCount = streamer.tileCount

    streamer.setViewDistance(700)
    streamer.update(200, 200) // same chunk: nothing happens
    flush()
    expect(streamer.tileCount).toBe(fullCount)
    expect(streamer.viewDistance).toBe(1500)

    streamer.update(100 + config.chunkSize, 100) // crossing
    flush()
    expect(streamer.tileCount).toBeLessThan(fullCount)
    expect(streamer.viewDistance).toBe(700)
  })

  it('keeps the old distance on screen until the larger layout has loaded', () => {
    const { streamer, workers, flush } = setup()
    streamer.setViewDistance(700)
    streamer.update(100, 100)
    flush()
    expect(streamer.viewDistance).toBe(700)

    streamer.setViewDistance(1500)
    streamer.update(100 + config.chunkSize, 100)
    workers[0]?.respond()
    expect(streamer.viewDistance).toBe(700)
    flush()
    expect(streamer.viewDistance).toBe(1500)
  })
})
