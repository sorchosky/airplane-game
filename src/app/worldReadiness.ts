/** ms the world takes to fade in over the `TitleSky` poster. */
export const WORLD_FADE_MS = 600

/** Rendered frames before the world counts as ready: shaders compiled and a frame on screen. */
export const MIN_READY_FRAMES = 3

export interface WorldReadinessInput {
  /** The terrain streamer's first full layout around the camera is committed. */
  terrainReady: boolean
  /** Tiles drawn. A streamer reports ready with nothing pending, so also require something. */
  terrainTiles: number
  /** Frames the world has rendered since it mounted. */
  framesRendered: number
}

/**
 * Whether the first terrain chunks under the camera are drawn, so the poster can give way to the
 * world without a hole in the ground.
 */
export function isWorldReady({
  terrainReady,
  terrainTiles,
  framesRendered,
}: WorldReadinessInput): boolean {
  return terrainReady && terrainTiles > 0 && framesRendered >= MIN_READY_FRAMES
}
