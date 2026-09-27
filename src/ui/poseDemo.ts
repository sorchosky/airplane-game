import type { Point2 } from './poseOverlayMath'

/**
 * The title screen's pose demonstration (#63, storyboard frame 00): a stick figure that loops
 * through the three things the body does (arms out, tilt, arms up), so the player sees the whole
 * control scheme before touching anything. Pure geometry in a 160 × 160 viewBox, y down.
 */

export interface DemoPose {
  /** Upper-body lean about the hips, radians, clockwise on screen (a bank). */
  lean: number
  /** Both arms raised above horizontal, radians (a climb). */
  armRaise: number
}

/** The three frames, in loop order. */
export const DEMO_KEYS: readonly DemoPose[] = [
  { lean: 0, armRaise: 0 },
  { lean: 0.32, armRaise: 0 },
  { lean: 0, armRaise: 0.6 },
]

/** The figure steps at film rate rather than the display's, which reads as drawn, not tweened. */
export const DEMO_FPS = 24
/**
 * Each key holds, then eases into the next, counted in 24 fps frames so the loop is a whole number
 * of frames (about 0.7 s hold and 0.33 s move; one loop is about 3.1 s).
 */
export const DEMO_HOLD_FRAMES = 17
export const DEMO_MOVE_FRAMES = 8
const SLOT_FRAMES = DEMO_HOLD_FRAMES + DEMO_MOVE_FRAMES
export const DEMO_LOOP_FRAMES = DEMO_KEYS.length * SLOT_FRAMES
export const DEMO_HOLD_MS = (DEMO_HOLD_FRAMES * 1000) / DEMO_FPS
export const DEMO_MOVE_MS = (DEMO_MOVE_FRAMES * 1000) / DEMO_FPS
export const DEMO_LOOP_MS = (DEMO_LOOP_FRAMES * 1000) / DEMO_FPS

/** Which 24 fps frame `tMs` falls in. The component redraws only when this changes. */
export function demoFrameIndex(tMs: number): number {
  return Math.floor((Math.max(0, tMs) * DEMO_FPS) / 1000)
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

const FIRST_KEY: DemoPose = { lean: 0, armRaise: 0 }

/** The pose at `tMs`, sampled on the 24 fps grid. Writes into `out` and returns it. */
export function demoPose(tMs: number, out: DemoPose = { lean: 0, armRaise: 0 }): DemoPose {
  const inLoop = demoFrameIndex(tMs) % DEMO_LOOP_FRAMES
  const index = Math.floor(inLoop / SLOT_FRAMES)
  const from = DEMO_KEYS[index] ?? FIRST_KEY
  const to = DEMO_KEYS[(index + 1) % DEMO_KEYS.length] ?? FIRST_KEY
  const k = smoothstep((inLoop - index * SLOT_FRAMES - DEMO_HOLD_FRAMES) / DEMO_MOVE_FRAMES)
  out.lean = from.lean + (to.lean - from.lean) * k
  out.armRaise = from.armRaise + (to.armRaise - from.armRaise) * k
  return out
}

export interface DemoFigure {
  head: Point2
  neck: Point2
  hip: Point2
  leftWrist: Point2
  rightWrist: Point2
  leftFoot: Point2
  rightFoot: Point2
}

/** Head radius in viewBox units, for the component. */
export const DEMO_HEAD_RADIUS = 12
const HIP: Point2 = { x: 80, y: 102 }
const TORSO = 40
const HEAD_ABOVE_HIP = 60
const ARM = 50
const FOOT_SPREAD = 13
const LEG = 32

export function createDemoFigure(): DemoFigure {
  const p = () => ({ x: 0, y: 0 })
  return {
    head: p(),
    neck: p(),
    hip: p(),
    leftWrist: p(),
    rightWrist: p(),
    leftFoot: p(),
    rightFoot: p(),
  }
}

/** Joint positions for a pose. The legs stay planted; everything above the hips leans. */
export function demoFigure(pose: DemoPose, out: DemoFigure = createDemoFigure()): DemoFigure {
  const cos = Math.cos(pose.lean)
  const sin = Math.sin(pose.lean)
  // Rotates a hip-relative offset by the lean (clockwise on screen with y down) and places it.
  const place = (target: Point2, dx: number, dy: number) => {
    target.x = HIP.x + dx * cos - dy * sin
    target.y = HIP.y + dx * sin + dy * cos
  }
  out.hip.x = HIP.x
  out.hip.y = HIP.y
  place(out.neck, 0, -TORSO)
  place(out.head, 0, -HEAD_ABOVE_HIP)
  const armX = ARM * Math.cos(pose.armRaise)
  const armY = -TORSO - ARM * Math.sin(pose.armRaise)
  place(out.leftWrist, -armX, armY)
  place(out.rightWrist, armX, armY)
  out.leftFoot.x = HIP.x - FOOT_SPREAD
  out.leftFoot.y = HIP.y + LEG
  out.rightFoot.x = HIP.x + FOOT_SPREAD
  out.rightFoot.y = HIP.y + LEG
  return out
}
