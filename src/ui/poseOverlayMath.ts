import { LANDMARK } from '../pose/landmarks'
import type { PoseLandmarks } from '../pose/types'

export interface Point2 {
  x: number
  y: number
}

export interface Size2 {
  width: number
  height: number
}

/** Maps a normalized (0..1) point in the video image to a canvas pixel. */
export interface CoverTransform {
  scale: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

/**
 * The transform CSS `object-fit: cover` applies: the video is scaled uniformly until it fills the
 * canvas, then centered, so the overflowing axis is cropped equally on both sides. `drawn` is the
 * size of the whole scaled video, which is at least as large as the canvas on both axes.
 */
export function coverTransform(video: Size2, canvas: Size2): CoverTransform | null {
  if (video.width <= 0 || video.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null
  const scale = Math.max(canvas.width / video.width, canvas.height / video.height)
  const width = video.width * scale
  const height = video.height * scale
  return {
    scale,
    offsetX: (canvas.width - width) / 2,
    offsetY: (canvas.height - height) / 2,
    width,
    height,
  }
}

/**
 * Normalized landmark → canvas pixel. Landmarks from the pose service are already mirrored into
 * selfie space (`poseFrame.ts`), and the preview mirrors the video with `scaleX(-1)` about its
 * center. Cover cropping is symmetric, so mirroring commutes with it and no further flip is needed.
 */
export function toCanvasPoint(point: Point2, transform: CoverTransform): Point2 {
  return {
    x: transform.offsetX + point.x * transform.width,
    y: transform.offsetY + point.y * transform.height,
  }
}

/** Wrist → elbow → shoulder → shoulder → elbow → wrist, in the player's left-to-right order. */
export const ARM_LINE_LANDMARKS = [
  LANDMARK.LEFT_WRIST,
  LANDMARK.LEFT_ELBOW,
  LANDMARK.LEFT_SHOULDER,
  LANDMARK.RIGHT_SHOULDER,
  LANDMARK.RIGHT_ELBOW,
  LANDMARK.RIGHT_WRIST,
] as const

/**
 * Canvas-space polyline through both arms and shoulders, or null when there is nothing to draw
 * (no person, missing landmarks, or no video size yet). Wrists are the first and last points.
 */
export function armLine(
  landmarks: PoseLandmarks | null,
  video: Size2,
  canvas: Size2,
): Point2[] | null {
  if (!landmarks) return null
  const transform = coverTransform(video, canvas)
  if (!transform) return null

  const points: Point2[] = []
  for (const index of ARM_LINE_LANDMARKS) {
    const landmark = landmarks[index]
    if (!landmark) return null
    points.push(toCanvasPoint(landmark, transform))
  }
  return points
}
