import { BufferAttribute, BufferGeometry, Box3, Group, Mesh, Sphere, type Material } from 'three'
import { chunkCoord, selectTiles, type TileSpec } from './chunks'
import type { TerrainConfig } from './terrainConfig'
import type { TileRequest, TileResult } from './terrainWorkerProtocol'
import { buildTileIndices, tileVertexCount } from './tileGeometry'
import { WrapFrame, type WrapShift } from './wrap'

interface Tile {
  spec: TileSpec
  mesh: Mesh
}

/**
 * Keeps the right set of terrain tiles around the plane.
 *
 * - `update` is cheap to call every frame: it only does work when the plane enters a new chunk.
 * - Tile heights are built by Web Workers. Requests are queued nearest-first, and each worker gets
 *   one at a time so a request that goes stale (the plane moved on) can be dropped before it runs.
 * - Finished tiles stay hidden until every tile of the new layout is ready, then the whole layout
 *   swaps in one frame. No holes while loading, and old and new tiles never overlap.
 * - Meshes and their geometries are pooled by grid size and refilled in place, so streaming
 *   doesn't allocate new GPU buffers.
 * - The world wraps (#177): tiles are planned in a `WrapFrame` that runs on smoothly across the
 *   seam, so a wrap (`shift`) only moves the meshes and rebuilds nothing. The 512 m chunk grid
 *   doesn't divide the 24 km period, so the copy of a chunk one period away isn't a chunk of the
 *   same grid; the frame sidesteps that. Its offset only ever grows by whole periods and is held
 *   in doubles, and the meshes are drawn near the plane, so it never costs precision.
 */
export class TerrainStreamer {
  private readonly workers: Worker[] = []
  private readonly busy = new Map<Worker, string>()
  private readonly queue: TileSpec[] = []
  private readonly active = new Map<string, Tile>()
  private readonly staged = new Map<string, Tile>()
  private readonly pending = new Map<string, TileSpec>()
  private desired = new Map<string, TileSpec>()
  private readonly pool = new Map<number, Mesh[]>()
  private readonly indices = new Map<number, BufferAttribute>()
  private readonly frame = new WrapFrame()
  private chunkX = Number.NaN
  private chunkZ = Number.NaN
  /** View distance the governor asked for; taken up on the next chunk crossing. */
  private requestedViewDistance: number
  /** View distance of the layout being built, and of the layout on screen. */
  private plannedViewDistance: number
  private committedViewDistance: number

  constructor(
    readonly group: Group,
    private readonly material: Material,
    private readonly config: TerrainConfig,
    createWorker: () => Worker,
    workerCount: number,
  ) {
    this.requestedViewDistance = config.viewDistance
    this.plannedViewDistance = config.viewDistance
    this.committedViewDistance = config.viewDistance
    for (let i = 0; i < workerCount; i++) {
      const worker = createWorker()
      worker.onmessage = (event: MessageEvent<TileResult>) => this.onResult(worker, event.data)
      this.workers.push(worker)
    }
  }

  /** Call every frame with the plane's position. Only re-plans on a chunk boundary crossing. */
  update(x: number, z: number): void {
    const cx = chunkCoord(this.frame.localX(x), this.config.chunkSize)
    const cz = chunkCoord(this.frame.localZ(z), this.config.chunkSize)
    if (cx === this.chunkX && cz === this.chunkZ) return
    this.chunkX = cx
    this.chunkZ = cz

    this.plannedViewDistance = this.requestedViewDistance
    const config =
      this.plannedViewDistance === this.config.viewDistance
        ? this.config
        : { ...this.config, viewDistance: this.plannedViewDistance }
    this.desired = new Map(selectTiles(cx, cz, config).map((spec) => [spec.key, spec]))

    for (const [key, tile] of this.staged) {
      if (!this.desired.has(key)) {
        this.release(tile)
        this.staged.delete(key)
      }
    }
    for (const key of this.pending.keys()) {
      if (!this.desired.has(key)) this.pending.delete(key)
    }

    for (const [key, spec] of this.desired) {
      if (!this.active.has(key) && !this.staged.has(key) && !this.pending.has(key)) {
        this.pending.set(key, spec)
      }
    }

    // Nearest ring first, so the terrain under the plane is never the thing still loading.
    this.queue.length = 0
    const inFlight = new Set(this.busy.values())
    this.queue.push(
      ...[...this.pending.values()]
        .filter((spec) => !inFlight.has(spec.key))
        .sort((a, b) => a.ring - b.ring),
    )
    this.pump()
    this.commitIfReady()
  }

  /**
   * The plane wrapped round the world by `shift` (#177). Every tile, drawn or still building, moves
   * with it; the layout stays as it was, so nothing is rebuilt.
   */
  shift(shift: WrapShift): void {
    this.frame.shift(shift)
    for (const tile of this.active.values()) this.place(tile)
    for (const tile of this.staged.values()) this.place(tile)
  }

  /**
   * Asks for a different build distance (the quality governor's last rung). It's taken up on the
   * next chunk crossing, never mid-chunk, and shows once that layout has fully loaded.
   */
  setViewDistance(viewDistance: number): void {
    this.requestedViewDistance = viewDistance
  }

  /** View distance of the layout on screen. The far haze follows this. */
  get viewDistance(): number {
    return this.committedViewDistance
  }

  /** Tiles currently drawn. For the debug HUD. */
  get tileCount(): number {
    return this.active.size
  }

  /** Whether the layout around the plane is complete: something drawn and nothing still building. */
  get ready(): boolean {
    return this.pending.size === 0 && this.active.size > 0
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate()
    this.workers.length = 0
    for (const tile of [...this.active.values(), ...this.staged.values()]) {
      this.group.remove(tile.mesh)
      tile.mesh.geometry.dispose()
    }
    for (const meshes of this.pool.values()) {
      for (const mesh of meshes) mesh.geometry.dispose()
    }
    this.active.clear()
    this.staged.clear()
    this.pending.clear()
    this.pool.clear()
  }

  private pump(): void {
    for (const worker of this.workers) {
      if (this.busy.has(worker)) continue
      let spec = this.queue.shift()
      while (spec && !this.pending.has(spec.key)) spec = this.queue.shift()
      if (!spec) return
      this.busy.set(worker, spec.key)
      const request: TileRequest = {
        key: spec.key,
        originX: spec.originX,
        originZ: spec.originZ,
        quads: spec.quads,
        spacing: spec.spacing,
        config: this.config,
      }
      worker.postMessage(request)
    }
  }

  private onResult(worker: Worker, result: TileResult): void {
    this.busy.delete(worker)
    const spec = this.pending.get(result.key)
    if (spec) {
      this.pending.delete(result.key)
      const mesh = this.acquire(spec.quads)
      const tile = { spec, mesh }
      fillMesh(mesh, spec, result)
      this.place(tile)
      mesh.visible = false
      this.group.add(mesh)
      this.staged.set(spec.key, tile)
    }
    this.pump()
    this.commitIfReady()
  }

  private commitIfReady(): void {
    if (this.pending.size > 0) return
    for (const [key, tile] of this.active) {
      if (!this.desired.has(key)) {
        this.release(tile)
        this.active.delete(key)
      }
    }
    for (const [key, tile] of this.staged) {
      tile.mesh.visible = true
      this.active.set(key, tile)
    }
    this.staged.clear()
    this.committedViewDistance = this.plannedViewDistance
  }

  /** Draws a tile where the plane sees it: its frame origin moved by the frame's offset. */
  private place(tile: Tile): void {
    tile.mesh.position.set(
      tile.spec.originX + this.frame.offsetX,
      0,
      tile.spec.originZ + this.frame.offsetZ,
    )
    tile.mesh.updateMatrix()
  }

  private acquire(quads: number): Mesh {
    const pooled = this.pool.get(quads)?.pop()
    if (pooled) return pooled

    let index = this.indices.get(quads)
    if (!index) {
      index = new BufferAttribute(buildTileIndices(quads), 1)
      this.indices.set(quads, index)
    }
    const vertexCount = tileVertexCount(quads)
    const geometry = new BufferGeometry()
    geometry.setIndex(index)
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexCount * 3), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(vertexCount * 3), 3))
    geometry.boundingBox = new Box3()
    geometry.boundingSphere = new Sphere()
    const mesh = new Mesh(geometry, this.material)
    mesh.matrixAutoUpdate = false
    return mesh
  }

  private release(tile: Tile): void {
    this.group.remove(tile.mesh)
    const list = this.pool.get(tile.spec.quads) ?? []
    list.push(tile.mesh)
    this.pool.set(tile.spec.quads, list)
  }
}

function fillMesh(mesh: Mesh, spec: TileSpec, result: TileResult): void {
  const { geometry } = mesh
  const position = geometry.getAttribute('position') as BufferAttribute
  const normal = geometry.getAttribute('normal') as BufferAttribute
  ;(position.array as Float32Array).set(result.positions)
  ;(normal.array as Float32Array).set(result.normals)
  position.needsUpdate = true
  normal.needsUpdate = true

  // Set bounds by hand (the tile is a known box) instead of scanning every vertex.
  geometry.boundingBox?.min.set(0, result.minHeight, 0)
  geometry.boundingBox?.max.set(spec.size, result.maxHeight, spec.size)
  if (geometry.boundingBox && geometry.boundingSphere) {
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere)
  }
}
