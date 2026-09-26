import { type RefObject, useEffect, useRef } from 'react'
import { getVideo } from '../pose/cameraService'
import { usePoseStore } from '../pose/poseStore'
import { color } from '../styles/tokens'
import {
  armLine,
  createArmLinePoints,
  createSkeleton,
  FALLBACK_VIDEO_SIZE,
  HEAD_RADIUS_PER_SHOULDER,
  JOINT,
  type OverlayCheck,
  type Size2,
  type Skeleton,
  SKELETON_SEGMENTS,
  type SkeletonLimb,
  skeletonPoints,
  TARGET_ALPHA,
  targetSkeleton,
  targetStyle,
  type TargetStyle,
} from './poseOverlayMath'

export type ControlPreviewState = 'inactive' | 'active'

/** Stroke width and wrist dot radius in CSS pixels, at preview size. */
const LINE_WIDTH_PX = 2.5
const WRIST_RADIUS_PX = 4
/** The calibration skeleton is read from ~2 m, so it's drawn heavier than the in-flight line. */
const SKELETON_WIDTH_PX = 6
const SKELETON_JOINT_RADIUS_PX = 6
/** Target limb thickness as a share of its shoulder span: a soft silhouette, not a stick. */
const TARGET_THICKNESS_PER_SHOULDER = 0.45

interface CanvasFrame {
  ctx: CanvasRenderingContext2D
  canvas: Size2
  video: Size2
  dpr: number
}

/**
 * Runs `draw` every animation frame on a canvas sized to its CSS box at device pixel ratio, with
 * the shared camera `<video>`'s size. Never re-renders React.
 */
function useCanvasLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: (frame: CanvasFrame) => void,
): void {
  // The loop calls the latest `draw` through a ref, so a new closure doesn't restart it.
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const video = getVideo()
    const frameData: CanvasFrame = {
      ctx,
      canvas: { width: 0, height: 0 },
      video: { width: 0, height: 0 },
      dpr: 1,
    }
    let frame = 0

    const tick = () => {
      const dpr = window.devicePixelRatio || 1
      const width = Math.round(canvas.clientWidth * dpr)
      const height = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      ctx.clearRect(0, 0, width, height)
      frameData.dpr = dpr
      frameData.canvas.width = width
      frameData.canvas.height = height
      frameData.video.width = video.videoWidth
      frameData.video.height = video.videoHeight
      drawRef.current(frameData)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [canvasRef])
}

function OverlayCanvas({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  return (
    <canvas
      ref={canvasRef}
      data-testid="pose-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

interface PoseOverlayProps {
  /** Line color role. Wired to the real gesture-active signal in #18. */
  controlState: ControlPreviewState
}

/**
 * Thin orientation line through the player's arms and shoulders, drawn over the mirrored camera
 * preview. Reads `poseStore` with `getState()` every animation frame and draws straight to the
 * canvas, so it never re-renders React. Draws nothing when no person is detected.
 */
export function PoseOverlay({ controlState }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Reused every frame; `armLine` fills it in place.
  const linePoints = useRef(createArmLinePoints()).current

  useCanvasLoop(canvasRef, ({ ctx, canvas, video, dpr }) => {
    const points = armLine(
      usePoseStore.getState().frame?.landmarks ?? null,
      video,
      canvas,
      linePoints,
    )
    const first = points?.[0]
    const last = points?.[points.length - 1]
    if (!points || !first || !last) return

    const stroke = controlState === 'active' ? color.controlActive : color.controlInactive
    ctx.strokeStyle = stroke
    ctx.fillStyle = stroke
    ctx.lineWidth = LINE_WIDTH_PX * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < points.length; i++) {
      const p = points[i]
      if (p) ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(first.x, first.y, WRIST_RADIUS_PX * dpr, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(last.x, last.y, WRIST_RADIUS_PX * dpr, 0, Math.PI * 2)
    ctx.fill()
  })

  return <OverlayCanvas canvasRef={canvasRef} />
}

/** What the calibration overlay shows, written by the calibrate screen's loop every frame. */
export interface CalibrationOverlayView {
  check: OverlayCheck
  /** The lock-in flash: the skeleton draws white. */
  flashing: boolean
}

const ARM_JOINTS: ReadonlySet<number> = new Set([
  JOINT.leftElbow,
  JOINT.rightElbow,
  JOINT.leftWrist,
  JOINT.rightWrist,
])

/** Strokes the chosen limbs' bones as one path, so overlapping strokes don't stack alpha. */
function traceBones(ctx: CanvasRenderingContext2D, skeleton: Skeleton, limb: SkeletonLimb): void {
  ctx.beginPath()
  for (const segment of SKELETON_SEGMENTS) {
    if (segment.limb !== limb) continue
    const a = skeleton.joints[segment.from]
    const b = skeleton.joints[segment.to]
    if (!a?.visible || !b?.visible) continue
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()
}

function shoulderSpan(skeleton: Skeleton): number {
  return skeleton.headRadius / HEAD_RADIUS_PER_SHOULDER
}

/** Traces the target's torso as one closed shape: shoulders to hips. */
function traceTorso(ctx: CanvasRenderingContext2D, target: Skeleton): void {
  const ls = target.joints[JOINT.leftShoulder]
  const rs = target.joints[JOINT.rightShoulder]
  const rh = target.joints[JOINT.rightHip]
  const lh = target.joints[JOINT.leftHip]
  if (!ls || !rs || !rh || !lh) return
  ctx.beginPath()
  ctx.moveTo(ls.x, ls.y)
  ctx.lineTo(rs.x, rs.y)
  ctx.lineTo(rh.x, rh.y)
  ctx.lineTo(lh.x, lh.y)
  ctx.closePath()
}

/** Draws one part of the target opaque, in `fill`, onto an offscreen layer. */
function drawTargetPart(
  layer: CanvasRenderingContext2D,
  target: Skeleton,
  part: 'body' | 'arms',
  fill: string,
): void {
  layer.lineCap = 'round'
  layer.lineJoin = 'round'
  layer.lineWidth = shoulderSpan(target) * TARGET_THICKNESS_PER_SHOULDER
  layer.strokeStyle = fill
  layer.fillStyle = fill
  if (part === 'arms') {
    traceBones(layer, target, 'arm')
    return
  }
  traceTorso(layer, target)
  layer.fill()
  layer.stroke()
  const head = target.joints[JOINT.head]
  if (head) {
    layer.beginPath()
    layer.arc(head.x, head.y, target.headRadius, 0, Math.PI * 2)
    layer.fill()
  }
}

/**
 * The target silhouette: each part is drawn opaque to its own offscreen layer and composited at its
 * opacity, so overlapping limbs read as one flat shape instead of stacking alpha at the joints.
 */
function drawTarget(
  ctx: CanvasRenderingContext2D,
  layers: readonly [CanvasRenderingContext2D, CanvasRenderingContext2D],
  target: Skeleton,
  style: TargetStyle,
): void {
  const [base, highlight] = layers
  for (const layer of layers) {
    if (layer.canvas.width !== ctx.canvas.width || layer.canvas.height !== ctx.canvas.height) {
      layer.canvas.width = ctx.canvas.width
      layer.canvas.height = ctx.canvas.height
    }
    layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
  }
  const partLayer = (highlighted: boolean) => (highlighted ? highlight : base)
  const partFill = (highlighted: boolean) => (highlighted ? color.controlInactive : color.line)
  drawTargetPart(partLayer(style.bodyHighlight), target, 'body', partFill(style.bodyHighlight))
  drawTargetPart(partLayer(style.armHighlight), target, 'arms', partFill(style.armHighlight))

  ctx.globalAlpha = TARGET_ALPHA
  ctx.drawImage(base.canvas, 0, 0)
  ctx.globalAlpha = style.highlightAlpha
  ctx.drawImage(highlight.canvas, 0, 0)
  ctx.globalAlpha = 1
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  skeleton: Skeleton,
  view: CalibrationOverlayView,
  dpr: number,
): void {
  const body = view.flashing ? color.lockFlash : color.accent
  const arms = view.flashing
    ? color.lockFlash
    : view.check === 'armsNotOut'
      ? color.controlInactive
      : color.accent
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = SKELETON_WIDTH_PX * dpr

  ctx.strokeStyle = body
  traceBones(ctx, skeleton, 'torso')
  const head = skeleton.joints[JOINT.head]
  if (head?.visible && skeleton.headRadius > 0) {
    ctx.beginPath()
    ctx.arc(head.x, head.y, skeleton.headRadius, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.strokeStyle = arms
  traceBones(ctx, skeleton, 'arm')

  // Joint dots, in their limb's color.
  for (let i = 0; i < skeleton.joints.length; i++) {
    const joint = skeleton.joints[i]
    if (i === JOINT.head || !joint?.visible) continue
    ctx.fillStyle = ARM_JOINTS.has(i) ? arms : body
    ctx.beginPath()
    ctx.arc(joint.x, joint.y, SKELETON_JOINT_RADIUS_PX * dpr, 0, Math.PI * 2)
    ctx.fill()
  }
}

function createLayers(): [CanvasRenderingContext2D, CanvasRenderingContext2D] | null {
  const a = document.createElement('canvas').getContext('2d')
  const b = document.createElement('canvas').getContext('2d')
  return a && b ? [a, b] : null
}

/**
 * Calibration overlay (#63, storyboard frame 02): the target T-pose to fill, pulsing or scaling to
 * show which check is failing, with the player's detected skeleton drawn over it. Like
 * `PoseOverlay`, it draws straight to the canvas every frame from `poseStore` and `viewRef`.
 */
export function CalibrationOverlay({ viewRef }: { viewRef: RefObject<CalibrationOverlayView> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const target = useRef(createSkeleton()).current
  const skeleton = useRef(createSkeleton()).current
  const layers = useRef<[CanvasRenderingContext2D, CanvasRenderingContext2D] | null>(null)
  const reducedMotion = useRef(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current

  useCanvasLoop(canvasRef, ({ ctx, canvas, video, dpr }) => {
    // With no camera frame yet (or a replay, with no camera at all) assume the requested size, so
    // the target is there from the first frame.
    const source = video.width > 0 && video.height > 0 ? video : FALLBACK_VIDEO_SIZE
    const view = viewRef.current
    const tMs = performance.now()
    const style = targetStyle(view.check, tMs, reducedMotion)

    layers.current ??= createLayers()
    if (layers.current && !view.flashing && targetSkeleton(source, canvas, style.scale, target)) {
      drawTarget(ctx, layers.current, target, style)
    }
    const landmarks = usePoseStore.getState().frame?.landmarks ?? null
    if (skeletonPoints(landmarks, source, canvas, skeleton)) {
      drawSkeleton(ctx, skeleton, view, dpr)
    }
  })

  return <OverlayCanvas canvasRef={canvasRef} />
}
