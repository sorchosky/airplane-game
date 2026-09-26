import { useEffect, useRef, useState } from 'react'
import { playLockInChime } from '../../audio/audioEngine'
import {
  holdProgress,
  INITIAL_CALIBRATION_FLOW,
  stepCalibration,
  type CalibrationPhase,
} from '../../pose/calibrationFlow'
import { useCalibrationStore } from '../../pose/calibrationStore'
import { getVideo, useCameraStore } from '../../pose/cameraService'
import { startPoseService } from '../../pose/poseService'
import { usePoseStore, type PoseModelStatus } from '../../pose/poseStore'
import { color, radius, space, type } from '../../styles/tokens'
import { CameraAsk } from '../../ui/CameraAsk'
import { CameraPreview } from '../../ui/CameraPreview'
import { copy } from '../../ui/copy'
import { HoldRing, RING_CIRCUMFERENCE } from '../../ui/HoldRing'
import { LOCK_IN_FLASH_MS, recordLockIn } from '../../ui/lockIn'
import { CalibrationOverlay, type CalibrationOverlayView } from '../../ui/PoseOverlay'
import type { OverlayCheck } from '../../ui/poseOverlayMath'
import { useGameStore } from '../gameStore'
import { isReplayInputMode } from '../urlFlags'

const MODEL_STATUS_COPY: Partial<Record<PoseModelStatus, string>> = {
  loading: copy.calibrate.modelLoading,
}

/** A mouse or trackpad: a computer, where the keyboard is a real way to fly. */
function hasFinePointer(): boolean {
  return window.matchMedia('(pointer: fine)').matches
}

/**
 * The model failed to download or initialize. The player is usually still near the phone (the
 * model loads right after Start), so this one state may take a tap: Try again re-runs the load on
 * the live camera; on a computer, a link offers the keyboard instead.
 */
function ModelErrorState() {
  const [retrying, setRetrying] = useState(false)
  const keyboardFallback = useState(hasFinePointer)[0]

  const retry = () => {
    setRetrying(true)
    startPoseService(getVideo()).then(
      () => setRetrying(false),
      () => setRetrying(false),
    )
  }

  const buttonStyle = {
    padding: `${space.md} ${space.xl}`,
    border: `2px solid ${color.textPrimary}`,
    borderRadius: radius.sharp,
    background: 'transparent',
    color: color.textPrimary,
    fontFamily: type.fontBody,
    fontSize: type.tvBody,
    cursor: 'pointer',
  } as const

  return (
    <div
      role="alert"
      data-testid="pose-model-error"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: space.lg,
        width: '18ch',
        padding: space.xl,
        borderRadius: space.md,
        background: color.surfaceHud,
        fontSize: type.tvTitle,
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'normal' }}>
        {copy.calibrate.modelErrorTitle}
      </h2>
      <p style={{ margin: 0, fontSize: type.tvBody, color: color.textMuted }}>
        {copy.calibrate.modelErrorBody}
      </p>
      <button type="button" onClick={retry} disabled={retrying} style={buttonStyle}>
        {copy.calibrate.modelRetry}
      </button>
      {keyboardFallback && (
        <a href="?input=keyboard" style={{ fontSize: type.tvBody, color: color.textMuted }}>
          {copy.calibrate.keyboardFallback}
        </a>
      )}
    </div>
  )
}

const GUIDANCE_COPY: Record<CalibrationPhase, string> = {
  noPerson: copy.calibrate.stepIntoView,
  tooClose: copy.calibrate.stepBack,
  tooFar: copy.calibrate.comeCloser,
  armsNotOut: copy.calibrate.spreadArms,
  holding: copy.calibrate.holdSteady,
  done: copy.calibrate.holdSteady,
}

function overlayCheck(phase: CalibrationPhase): OverlayCheck {
  return phase === 'done' ? 'holding' : phase
}

/**
 * Hands-free calibration (storyboard frame 02). The mirrored preview fills the screen with the
 * target T-pose and the player's skeleton over it, and one line of guidance for the failing check.
 * Steps the pure calibration flow once per pose detection; guidance only re-renders React when the
 * phase changes, while the overlay and the hold ring are written straight to the canvas and SVG
 * every animation frame. On lock-in (frame 03) it chimes, flashes the skeleton white, and hands the
 * preview's rectangle to the flight HUD, which contracts it into the corner.
 */
function CalibrationView() {
  const modelStatus = usePoseStore((s) => s.modelStatus)
  const cameraLost = useCameraStore((s) => s.status === 'lost')
  const statusCopy = MODEL_STATUS_COPY[modelStatus]
  const [phase, setPhase] = useState<CalibrationPhase>(INITIAL_CALIBRATION_FLOW.phase)
  const ringRef = useRef<SVGCircleElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CalibrationOverlayView>({
    check: overlayCheck(INITIAL_CALIBRATION_FLOW.phase),
    flashing: false,
  })

  useEffect(() => {
    const saved = useCalibrationStore.getState().calibration
    let flow = INITIAL_CALIBRATION_FLOW
    let lastDetectedAtMs = -1
    let lockedAtMs: number | null = null
    let frame = 0

    const tick = () => {
      const now = performance.now()
      const { frame: poseFrame, detectedAtMs } = usePoseStore.getState()
      if (lockedAtMs === null && detectedAtMs > 0 && detectedAtMs !== lastDetectedAtMs) {
        lastDetectedAtMs = detectedAtMs
        flow = stepCalibration(flow, poseFrame?.landmarks ?? null, detectedAtMs, saved)
        viewRef.current.check = overlayCheck(flow.phase)
        setPhase(flow.phase)
      }

      if (flow.phase === 'done' && flow.result) {
        if (lockedAtMs === null) {
          lockedAtMs = now
          useCalibrationStore.getState().setCalibration(flow.result)
          playLockInChime()
          viewRef.current.flashing = true
        } else if (now - lockedAtMs >= LOCK_IN_FLASH_MS) {
          const rect = frameRef.current?.getBoundingClientRect()
          if (rect) recordLockIn(rect, now)
          useGameStore.getState().calibrationComplete()
          return
        }
      }

      const ring = ringRef.current
      if (ring) {
        const progress = holdProgress(flow, now, saved)
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress))
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const holding = phase === 'holding' || phase === 'done'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        padding: space.lg,
        color: color.textPrimary,
        background: color.surfaceScrim,
      }}
    >
      <CameraPreview
        variant="calibrate"
        controlState={holding ? 'active' : 'inactive'}
        overlay={<CalibrationOverlay viewRef={viewRef} />}
        frameRef={frameRef}
      >
        {modelStatus === 'error' ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ModelErrorState />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: space.lg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: space.sm,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space.md,
                padding: `${space.sm} ${space.lg}`,
                borderRadius: space.md,
                background: color.surfaceHud,
                fontSize: type.tvTitle,
                whiteSpace: 'nowrap',
              }}
            >
              {holding && !cameraLost && <HoldRing ringRef={ringRef} />}
              <p
                role="status"
                aria-live="polite"
                data-testid="calibration-guidance"
                data-phase={cameraLost ? 'cameraLost' : phase}
                style={{ margin: 0 }}
              >
                {cameraLost ? copy.calibrate.cameraLost : GUIDANCE_COPY[phase]}
              </p>
            </div>
            {statusCopy && (
              <p
                role="status"
                data-testid="pose-model-status"
                style={{
                  margin: 0,
                  padding: `${space.xs} ${space.md}`,
                  borderRadius: space.sm,
                  background: color.surfaceHud,
                  fontSize: type.tvBody,
                  color: color.textMuted,
                }}
              >
                {statusCopy}
              </p>
            )}
          </div>
        )}
      </CameraPreview>
    </div>
  )
}

/**
 * Calibrate state. Until the camera is live the player sees the camera-ask frame (storyboard frame
 * 01) under the browser's prompt; a replay has no camera, so it goes straight to calibration.
 */
export function CalibrateScreen() {
  const asking = useCameraStore((s) => s.status === 'idle' || s.status === 'starting')
  if (asking && !isReplayInputMode()) return <CameraAsk />
  return <CalibrationView />
}
