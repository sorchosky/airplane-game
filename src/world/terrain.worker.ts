import { buildTileBuffers } from './tileGeometry'
import type { TileRequest, TileResult } from './terrainWorkerProtocol'

// Web Worker: a second JavaScript thread. Sampling ~300k heights for a full ring of tiles takes
// long enough to drop frames, so it happens here and the main thread only uploads the result.

// The app's tsconfig uses the DOM lib, not the WebWorker lib (they conflict in one program), so
// describe the two bits of the worker global this file uses.
interface WorkerScope {
  onmessage: ((event: MessageEvent<TileRequest>) => void) | null
  postMessage(message: TileResult, transfer: Transferable[]): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  const { key, originX, originZ, quads, spacing, config } = event.data
  const buffers = buildTileBuffers(originX, originZ, quads, spacing, config)
  scope.postMessage({ key, ...buffers }, [buffers.positions.buffer, buffers.normals.buffer])
}
