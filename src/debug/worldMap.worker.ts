import { createGoldenPathRoute } from '../world/goldenPath'
import { findSpawnPoint, heightAt } from '../world/heightfield'
import { placeLandmarks } from '../world/landmarks'
import { TERRAIN_CONFIG } from '../world/terrainConfig'

export interface WorldMapRequest {
  sizeMeters: number
  samples: number
}

export interface WorldMapResult {
  heights: Float32Array
  spawn: ReturnType<typeof findSpawnPoint>
  landmarks: ReturnType<typeof placeLandmarks>
  rings: readonly { x: number; z: number }[]
  gate: { x: number; z: number } | null
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorldMapRequest>) => void) | null
  postMessage(message: WorldMapResult, transfer: Transferable[]): void
}

const scope = self as unknown as WorkerScope
scope.onmessage = ({ data }) => {
  const spawn = findSpawnPoint(TERRAIN_CONFIG)
  const landmarks = placeLandmarks(TERRAIN_CONFIG)
  const arch = landmarks.find((landmark) => landmark.kind === 'arch')
  const route = arch
    ? createGoldenPathRoute({ x: spawn.x, y: spawn.groundHeight + 120, z: spawn.z }, arch)
    : null
  const heights = new Float32Array(data.samples * data.samples)
  const step = data.sizeMeters / (data.samples - 1)
  for (let row = 0; row < data.samples; row++) {
    for (let column = 0; column < data.samples; column++) {
      heights[row * data.samples + column] = heightAt(
        spawn.x - data.sizeMeters / 2 + column * step,
        spawn.z - data.sizeMeters / 2 + row * step,
        TERRAIN_CONFIG,
      )
    }
  }
  scope.postMessage(
    {
      heights,
      spawn,
      landmarks,
      rings: route?.rings ?? [],
      gate: arch ? { x: arch.x, z: arch.z } : null,
    },
    [heights.buffer],
  )
}
