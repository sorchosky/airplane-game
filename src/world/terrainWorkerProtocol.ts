import type { TerrainConfig } from './terrainConfig'

/** Main thread → worker: build one tile. */
export interface TileRequest {
  key: string
  originX: number
  originZ: number
  quads: number
  spacing: number
  config: TerrainConfig
}

/** Worker → main thread: a finished tile. The typed arrays are transferred, not copied. */
export interface TileResult {
  key: string
  positions: Float32Array
  normals: Float32Array
  minHeight: number
  maxHeight: number
}
