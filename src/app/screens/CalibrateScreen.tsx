import { useEffect, useRef, useState } from 'react'
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
import { CalibrationFigure, RING_CIRCUMFERENCE } from '../../ui/CalibrationFigure'
import { CameraPreview } from '../../ui/CameraPreview'
import { copy } from '../../ui/copy'
import { useGameStore } from '../gameStore'

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
        // Same column as the calibration guidance, so the preview doesn't jump.
        width: '18ch',
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
  noPerson: copy.calibrate.stepBack,
  tooClose: copy.calibrate.stepBack,
  tooFar: copy.calibrate.comeCloser,
  armsNotOut: copy.calibrate.spreadArms,
  holding: copy.calibrate.holdSteady,
  done: copy.calibrate.holdSteady,
}

/**
 * Hands-free calibration. Steps the pure calibration flow once per pose detection, shows the
 * matching guidance, and moves to `flying` once a steady T-pose has been captured (or a saved
 * calibration still matches). Guidance only re-renders React when the phase changes; the hold
 * ring is written straight to the SVG every animation frame.
 */
export function CalibrateScreen() {
  const modelStatus = usePoseStore((s) => s.modelStatus)
  const cameraLost = useCameraStore((s) => s.status === 'lost')
  const statusCopy = MODEL_STATUS_COPY[modelStatus]
  const [phase, setPhase] = useState<CalibrationPhase>(INITIAL_CALIBRATION_FLOW.phase)
  const ringRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const saved = useCalibrationStore.getState().calibration
    let flow = INITIAL_CALIBRATION_FLOW
    let lastDetectedAtMs = -1
    let frame = 0

    const tick = () => {
      const { frame: poseFrame, detectedAtMs } = usePoseStore.getState()
      if (detectedAtMs > 0 && detectedAtMs !== lastDetectedAtMs) {
        lastDetectedAtMs = detectedAtMs
        flow = stepCalibration(flow, poseFrame?.landmarks ?? null, detectedAtMs, saved)
        setPhase(flow.phase)
      }

      if (flow.phase === 'done' && flow.result) {
        useCalibrationStore.getState().setCalibration(flow.result)
        useGameStore.getState().calibrationComplete()
        return
      }

      const ring = ringRef.current
      if (ring) {
        const progress = holdProgress(flow, performance.now(), saved)
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress))
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const armsOut = phase === 'holding' || phase === 'done'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xxl,
        height: '100%',
        width: '100%',
        padding: space.xl,
        color: color.textPrimary,
        background: color.surfaceHud,
      }}
    >
      <CameraPreview variant="calibrate" controlState={armsOut ? 'active' : 'inactive'} />
      {modelStatus === 'error' ? (
        <ModelErrorState />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: space.lg,
            textAlign: 'center',
            // Fixed width so the preview doesn't shift as the guidance copy changes length.
            fontSize: type.tvTitle,
            width: '18ch',
          }}
        >
          <CalibrationFigure
            armsOut={armsOut || phase === 'armsNotOut'}
            holding={armsOut}
            ringRef={ringRef}
          />
          <p
            role="status"
            aria-live="polite"
            data-testid="calibration-guidance"
            data-phase={cameraLost ? 'cameraLost' : phase}
            style={{ margin: 0 }}
          >
            {cameraLost ? copy.calibrate.cameraLost : GUIDANCE_COPY[phase]}
          </p>
          {statusCopy && (
            <p
              role="status"
              data-testid="pose-model-status"
              style={{ fontSize: type.tvBody, margin: 0, color: color.textMuted }}
            >
              {statusCopy}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
