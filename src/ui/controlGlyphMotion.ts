/**
 * Keyframes for the control choice glyphs (#154): the Motion figure's tilt and the Touch and Mouse
 * tap-and-drag loops. Pure functions of time in user units of the glyphs' 160 × 128 viewBox, so the
 * beats are unit tested and the components only project a frame onto transforms and opacity.
 */

export interface SampledKeyframe {
  offset: number
  [property: string]: string | number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const mod = (value: number, period: number) => ((value % period) + period) % period
const lerp = (from: number, to: number, p: number) => from + (to - from) * p

/** Sine ease in-out, 0..1 to 0..1. */
export function easeSine(p: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(p))
}

// Motion: torso, head and arms rotate together about the waist.
export const MOTION_LOOP_MS = 3600
export const MOTION_MAX_DEG = 10
export const MOTION_HEAD_COUNTER_RATIO = 0.3
const MOTION_HOLD_MS = 400
const MOTION_MOVE_MS = (MOTION_LOOP_MS - 2 * MOTION_HOLD_MS) / 4

// 0 → -10 → 0 → +10 → 0, holding at each extreme.
const MOTION_SEGMENTS: ReadonlyArray<{ ms: number; from: number; to: number }> = [
  { ms: MOTION_MOVE_MS, from: 0, to: -1 },
  { ms: MOTION_HOLD_MS, from: -1, to: -1 },
  { ms: MOTION_MOVE_MS, from: -1, to: 0 },
  { ms: MOTION_MOVE_MS, from: 0, to: 1 },
  { ms: MOTION_HOLD_MS, from: 1, to: 1 },
  { ms: MOTION_MOVE_MS, from: 1, to: 0 },
]

/** Body rotation about the waist in degrees, positive clockwise on screen. */
export function motionTiltDeg(tMs: number): number {
  let remaining = mod(tMs, MOTION_LOOP_MS)
  for (const { ms, from, to } of MOTION_SEGMENTS) {
    if (remaining < ms) return lerp(from, to, easeSine(remaining / ms)) * MOTION_MAX_DEG
    remaining -= ms
  }
  return 0
}

/** The head's extra rotation against the body, so it leans a little less than the shoulders. */
export function motionHeadDeg(bodyDeg: number): number {
  return -bodyDeg * MOTION_HEAD_COUNTER_RATIO
}

// Touch and Mouse: press, ring, drag, dwell, lift, rest.
export const TOUCH_LOOP_MS = 3200
/** Direction alternates each loop, so the full pattern repeats every two. */
export const TOUCH_CYCLE_MS = TOUCH_LOOP_MS * 2
export const TOUCH_PRESS_PX = 6
export const TOUCH_PRESS_SCALE = 0.97
export const TOUCH_RING_RADIUS = 28
export const TOUCH_DRAG_PX = 40
export const TOUCH_ARC_PX = 6
const TOUCH_REST_MS = 600
const TOUCH_PRESS_MS = 160
const TOUCH_RING_MS = 500
const TOUCH_DRAG_MS = 900
const TOUCH_DWELL_MS = 240
const TOUCH_LIFT_MS = 200
const TOUCH_TRAIL_FADE_MS = 400

const PRESS_END = TOUCH_REST_MS + TOUCH_PRESS_MS
const RING_END = PRESS_END + TOUCH_RING_MS
const DRAG_END = RING_END + TOUCH_DRAG_MS
const LIFT_START = DRAG_END + TOUCH_DWELL_MS

/** Each glyph runs on its own offset so the two never move in sync. */
export const MOTION_PHASE_MS = 0
export const TOUCH_PHASE_MS = 1300
/** The reduced-motion key pose: halfway through the first drag. */
export const TOUCH_STATIC_MS = RING_END + TOUCH_DRAG_MS / 2

/** All offsets are relative to the contact point, in user units. */
export interface TouchFrame {
  handX: number
  handY: number
  handScale: number
  dotX: number
  dotY: number
  dotOpacity: number
  /** Where the contact ring is centred; it stays where the touch began. */
  ringX: number
  /** 0..1 of `TOUCH_RING_RADIUS`. */
  ringScale: number
  ringOpacity: number
  trailX: number
  trailAngleDeg: number
  trailLength: number
  trailOpacity: number
}

export function touchFrame(tMs: number): TouchFrame {
  const cycle = mod(tMs, TOUCH_CYCLE_MS)
  const loop = Math.floor(cycle / TOUCH_LOOP_MS)
  const t = cycle - loop * TOUCH_LOOP_MS
  const dir = loop % 2 === 0 ? 1 : -1
  const startX = (-TOUCH_DRAG_PX / 2) * dir

  const dragP = easeSine((t - RING_END) / TOUCH_DRAG_MS)
  const x = startX + TOUCH_DRAG_PX * dir * dragP
  const arcY = -TOUCH_ARC_PX * Math.sin(Math.PI * dragP)

  const pressP = easeSine((t - TOUCH_REST_MS) / TOUCH_PRESS_MS)
  const liftP = easeSine((t - LIFT_START) / TOUCH_LIFT_MS)
  const down = pressP * (1 - liftP)

  const ringP = clamp01((t - PRESS_END) / TOUCH_RING_MS)
  const ringActive = t >= PRESS_END && t < RING_END

  const trailFade = clamp01((t - DRAG_END) / TOUCH_TRAIL_FADE_MS)
  const trailDx = x - startX

  return {
    handX: x,
    handY: arcY + TOUCH_PRESS_PX * down,
    handScale: lerp(1, TOUCH_PRESS_SCALE, down),
    dotX: x,
    dotY: arcY,
    dotOpacity: down,
    ringX: startX,
    ringScale: ringActive ? easeSine(ringP) : 0,
    ringOpacity: ringActive ? 1 - ringP : 0,
    trailX: startX,
    trailAngleDeg: (Math.atan2(arcY, trailDx) * 180) / Math.PI,
    trailLength: Math.hypot(trailDx, arcY),
    trailOpacity: t >= RING_END ? 1 - trailFade : 0,
  }
}

/** Samples `frame` across one period into keyframes, the last matching the first for a clean loop. */
export function sampleKeyframes<T>(
  periodMs: number,
  stepMs: number,
  frame: (tMs: number) => T,
  project: (frame: T) => Record<string, string | number>,
): SampledKeyframe[] {
  const count = Math.ceil(periodMs / stepMs)
  const keyframes: SampledKeyframe[] = []
  for (let i = 0; i <= count; i++) {
    const t = Math.min(periodMs, i * stepMs)
    keyframes.push({ offset: t / periodMs, ...project(frame(t)) })
  }
  return keyframes
}
