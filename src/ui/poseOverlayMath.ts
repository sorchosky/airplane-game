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
export function coverTransform(
  video: Size2,
  canvas: Size2,
  out: CoverTransform = { scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0 },
): CoverTransform | null {
  if (video.width <= 0 || video.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null
  const scale = Math.max(canvas.width / video.width, canvas.height / video.height)
  const width = video.width * scale
  const height = video.height * scale
  out.scale = scale
  out.offsetX = (canvas.width - width) / 2
  out.offsetY = (canvas.height - height) / 2
  out.width = width
  out.height = height
  return out
}

/**
 * Normalized landmark → canvas pixel. Landmarks from the pose service are already mirrored into
 * selfie space (`poseFrame.ts`), and the preview mirrors the video with `scaleX(-1)` about its
 * center. Cover cropping is symmetric, so mirroring commutes with it and no further flip is needed.
 */
export function toCanvasPoint(
  point: Point2,
  transform: CoverTransform,
  out: Point2 = { x: 0, y: 0 },
): Point2 {
  out.x = transform.offsetX + point.x * transform.width
  out.y = transform.offsetY + point.y * transform.height
  return out
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

/** Six reusable points for `armLine`, one per `ARM_LINE_LANDMARKS` entry. */
export function createArmLinePoints(): Point2[] {
  return ARM_LINE_LANDMARKS.map(() => ({ x: 0, y: 0 }))
}

const transformScratch: CoverTransform = { scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0 }

/**
 * Canvas-space polyline through both arms and shoulders, or null when there is nothing to draw
 * (no person, missing landmarks, or no video size yet). Wrists are the first and last points.
 * Writes into `out` (from `createArmLinePoints`; a fresh array by default) and returns it.
 */
export function armLine(
  landmarks: PoseLandmarks | null,
  video: Size2,
  canvas: Size2,
  out: Point2[] = createArmLinePoints(),
): Point2[] | null {
  if (!landmarks) return null
  const transform = coverTransform(video, canvas, transformScratch)
  if (!transform) return null

  for (let i = 0; i < ARM_LINE_LANDMARKS.length; i++) {
    const landmark = landmarks[ARM_LINE_LANDMARKS[i] ?? 0]
    const point = out[i]
    if (!landmark || !point) return null
    toCanvasPoint(landmark, transform, point)
  }
  return out
}

/**
 * Calibration skeleton (#63). The joints drawn over the player and in the target silhouette, in one
 * shared order so both are drawn from the same segment list.
 */
export const SKELETON_JOINTS = [
  LANDMARK.NOSE,
  LANDMARK.LEFT_SHOULDER,
  LANDMARK.RIGHT_SHOULDER,
  LANDMARK.LEFT_ELBOW,
  LANDMARK.RIGHT_ELBOW,
  LANDMARK.LEFT_WRIST,
  LANDMARK.RIGHT_WRIST,
  LANDMARK.LEFT_HIP,
  LANDMARK.RIGHT_HIP,
] as const

/** Positions in `SKELETON_JOINTS`, by name, for readable segment definitions. */
export const JOINT = {
  head: 0,
  leftShoulder: 1,
  rightShoulder: 2,
  leftElbow: 3,
  rightElbow: 4,
  leftWrist: 5,
  rightWrist: 6,
  leftHip: 7,
  rightHip: 8,
} as const

export type SkeletonLimb = 'arm' | 'torso'

export interface SkeletonSegment {
  from: number
  to: number
  limb: SkeletonLimb
}

/** Bones between joints. The head is drawn as a circle, not a bone. */
export const SKELETON_SEGMENTS: readonly SkeletonSegment[] = [
  { from: JOINT.leftWrist, to: JOINT.leftElbow, limb: 'arm' },
  { from: JOINT.leftElbow, to: JOINT.leftShoulder, limb: 'arm' },
  { from: JOINT.rightWrist, to: JOINT.rightElbow, limb: 'arm' },
  { from: JOINT.rightElbow, to: JOINT.rightShoulder, limb: 'arm' },
  { from: JOINT.leftShoulder, to: JOINT.rightShoulder, limb: 'torso' },
  { from: JOINT.leftShoulder, to: JOINT.leftHip, limb: 'torso' },
  { from: JOINT.rightShoulder, to: JOINT.rightHip, limb: 'torso' },
  { from: JOINT.leftHip, to: JOINT.rightHip, limb: 'torso' },
]

export interface SkeletonJoint extends Point2 {
  /** Whether the pose model saw this joint well enough to draw. */
  visible: boolean
}

export interface Skeleton {
  joints: SkeletonJoint[]
  /** Head circle radius in canvas pixels, from the shoulder span. */
  headRadius: number
}

/** A reusable skeleton for `skeletonPoints` / `targetSkeleton`. */
export function createSkeleton(): Skeleton {
  return { joints: SKELETON_JOINTS.map(() => ({ x: 0, y: 0, visible: false })), headRadius: 0 }
}

/** Joints below this visibility are left out of the drawn skeleton. */
export const MIN_JOINT_VISIBILITY = 0.5
/** Head radius as a share of the shoulder span. */
export const HEAD_RADIUS_PER_SHOULDER = 0.35

/** Video size assumed before the first frame arrives (or under `?input=replay`, with no camera). */
export const FALLBACK_VIDEO_SIZE: Size2 = { width: 640, height: 480 }

function setHeadRadius(skeleton: Skeleton): void {
  const left = skeleton.joints[JOINT.leftShoulder]
  const right = skeleton.joints[JOINT.rightShoulder]
  skeleton.headRadius =
    left && right ? Math.hypot(left.x - right.x, left.y - right.y) * HEAD_RADIUS_PER_SHOULDER : 0
}

/**
 * The player's skeleton in canvas pixels, or null when there is nothing to draw (no person, or no
 * canvas size yet). Joints the model can't see are marked invisible rather than dropped, so a
 * missing hip still leaves the arms drawn. Writes into `out` and returns it.
 */
export function skeletonPoints(
  landmarks: PoseLandmarks | null,
  video: Size2,
  canvas: Size2,
  out: Skeleton = createSkeleton(),
): Skeleton | null {
  if (!landmarks) return null
  const transform = coverTransform(video, canvas, transformScratch)
  if (!transform) return null

  for (let i = 0; i < SKELETON_JOINTS.length; i++) {
    const landmark = landmarks[SKELETON_JOINTS[i] ?? 0]
    const joint = out.joints[i]
    if (!joint) continue
    joint.visible = landmark !== undefined && landmark.visibility >= MIN_JOINT_VISIBILITY
    if (landmark) toCanvasPoint(landmark, transform, joint)
  }
  setHeadRadius(out)
  return out
}

/**
 * The T-pose the player should fill, in normalized image space for a player about two metres from
 * a propped phone. `shoulderWidth` sits mid-range of the calibration distance check
 * (`DEFAULT_CALIBRATION_PARAMS`, 0.07–0.2), which is roughly where a 0.38 m shoulder span lands at
 * 2 m on a ~70° front camera. The other lengths are body proportions as multiples of it.
 */
export const TARGET_POSE = {
  centerX: 0.5,
  shoulderY: 0.38,
  shoulderWidth: 0.135,
  upperArm: 0.8,
  forearm: 0.75,
  headAboveShoulders: 0.6,
  shoulderToHip: 1.3,
  hipWidth: 0.65,
} as const

/**
 * The target silhouette in canvas pixels, scaled by `scale` about the middle of the torso (the
 * too-close / too-far cue). Lengths are in video pixels before the cover transform, so the target
 * keeps human proportions whatever the video's aspect. Writes into `out` and returns it.
 */
export function targetSkeleton(
  video: Size2,
  canvas: Size2,
  scale = 1,
  out: Skeleton = createSkeleton(),
): Skeleton | null {
  const transform = coverTransform(video, canvas, transformScratch)
  if (!transform) return null

  const t = TARGET_POSE
  // Everything in video pixels first.
  const unit = t.shoulderWidth * video.width * scale
  const cx = t.centerX * video.width
  const shoulderY = t.shoulderY * video.height
  const hipY = shoulderY + t.shoulderToHip * t.shoulderWidth * video.width
  const pivotY = (shoulderY + hipY) / 2
  const sy = pivotY + (shoulderY - pivotY) * scale
  const hy = pivotY + (hipY - pivotY) * scale
  const half = unit / 2

  const place = (index: number, x: number, y: number) => {
    const joint = out.joints[index]
    if (!joint) return
    joint.x = transform.offsetX + x * transform.scale
    joint.y = transform.offsetY + y * transform.scale
    joint.visible = true
  }
  place(JOINT.head, cx, sy - t.headAboveShoulders * unit)
  place(JOINT.leftShoulder, cx - half, sy)
  place(JOINT.rightShoulder, cx + half, sy)
  place(JOINT.leftElbow, cx - half - t.upperArm * unit, sy)
  place(JOINT.rightElbow, cx + half + t.upperArm * unit, sy)
  place(JOINT.leftWrist, cx - half - (t.upperArm + t.forearm) * unit, sy)
  place(JOINT.rightWrist, cx + half + (t.upperArm + t.forearm) * unit, sy)
  place(JOINT.leftHip, cx - (t.hipWidth * unit) / 2, hy)
  place(JOINT.rightHip, cx + (t.hipWidth * unit) / 2, hy)
  setHeadRadius(out)
  return out
}

/** The calibration check the overlay is showing. Mirrors the flow's phases, minus `done`. */
export type OverlayCheck = 'noPerson' | 'tooClose' | 'tooFar' | 'armsNotOut' | 'holding'

/** One pulse, ms: slow enough to read as breathing from the couch rather than as a blink. */
export const PULSE_PERIOD_MS = 1200
/** How far the target shrinks (too close) or grows (too far) at the peak of a pulse. */
export const TARGET_SCALE_SWING = 0.15
/** The target's resting opacity (`line` at 40 %). */
export const TARGET_ALPHA = 0.4

/** 0..1..0 over `PULSE_PERIOD_MS`, starting at 0. A raised cosine, so it eases at both ends. */
export function pulse(tMs: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * tMs) / PULSE_PERIOD_MS)
}

export interface TargetStyle {
  /** Scale about the torso middle. */
  scale: number
  /** Whether the torso and head / the arms are drawn as the failing part. */
  bodyHighlight: boolean
  armHighlight: boolean
  /** Opacity of the highlighted parts; the rest stay at `TARGET_ALPHA`. */
  highlightAlpha: number
}

/**
 * How the target shows the failing check: the whole target pulses when nobody is in view, the arm
 * segments pulse for arms-not-out, and the target shrinks or grows for too close / too far. Under
 * reduced motion the cue holds at its peak instead of pulsing.
 */
export function targetStyle(
  check: OverlayCheck,
  tMs: number,
  reducedMotion: boolean,
  out: TargetStyle = { scale: 1, bodyHighlight: false, armHighlight: false, highlightAlpha: 1 },
): TargetStyle {
  const p = reducedMotion ? 1 : pulse(tMs)
  out.scale = 1
  out.bodyHighlight = check === 'noPerson'
  out.armHighlight = check === 'noPerson' || check === 'armsNotOut'
  out.highlightAlpha = TARGET_ALPHA + (1 - TARGET_ALPHA) * p
  if (check === 'tooClose') out.scale = 1 - TARGET_SCALE_SWING * p
  if (check === 'tooFar') out.scale = 1 + TARGET_SCALE_SWING * p
  return out
}
