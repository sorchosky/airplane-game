import { useEffect, useRef, useState } from 'react'
import { replayStatus } from '../input/replaySource'
import { LANDMARK } from '../pose/landmarks'
import { usePoseStore, type PoseFrame } from '../pose/poseStore'
import { color, space, type } from '../styles/tokens'
import { copy } from '../ui/copy'
import { recordingToJson, startPoseRecorder, type PoseRecording } from './poseRecorder'

function formatPoint(frame: PoseFrame | null, index: number): string {
  const point = frame?.landmarks[index]
  return point ? `${point.x.toFixed(2)},${point.y.toFixed(2)}` : '-'
}

/**
 * Pose detection readout behind `?debug`: model status and delegate, effective detection Hz,
 * inference ms, and live wrist positions (mirrored space) so you can see landmarks move. Text is
 * written straight into the DOM from an animation frame loop, never as React state. The Record
 * button captures detections into a replay fixture and downloads it (`tests/fixtures/replays/`).
 */
export function PoseDebug() {
  const textRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const { modelStatus, delegate, hz, inferenceMs, frame: pose } = usePoseStore.getState()
      if (textRef.current) {
        textRef.current.textContent =
          `pose ${modelStatus}${delegate ? ` (${delegate})` : ''}\n` +
          `${hz.toFixed(1)} Hz  ${inferenceMs.toFixed(1)} ms\n` +
          `person ${pose ? 'yes' : 'no'}\n` +
          `L wrist ${formatPoint(pose, LANDMARK.LEFT_WRIST)}\n` +
          `R wrist ${formatPoint(pose, LANDMARK.RIGHT_WRIST)}` +
          (replayStatus.phase === 'idle'
            ? ''
            : `\nreplay ${replayStatus.name} ${replayStatus.phase} ${replayStatus.label ?? ''}`)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: space.md,
        right: space.md,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: space.xs,
      }}
    >
      <pre
        ref={textRef}
        data-testid="pose-debug"
        style={{
          margin: 0,
          padding: space.sm,
          background: color.surfaceHud,
          color: color.textPrimary,
          fontSize: type.tvCaption,
          fontFamily: 'monospace',
          borderRadius: space.xs,
          pointerEvents: 'none',
        }}
      />
      <RecordButton />
    </div>
  )
}

function downloadRecording(recording: PoseRecording) {
  const blob = new Blob([recordingToJson(recording)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `pose-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Debug-only, so it may need a tap: the person recording is at the phone, not flying. */
function RecordButton() {
  const stopRef = useRef<(() => PoseRecording) | null>(null)
  const [recording, setRecording] = useState(false)

  // Leaving the screen mid-recording drops the take rather than leaking the subscription.
  useEffect(() => () => void stopRef.current?.(), [])

  const toggle = () => {
    if (stopRef.current) {
      downloadRecording(stopRef.current())
      stopRef.current = null
      setRecording(false)
    } else {
      stopRef.current = startPoseRecorder()
      setRecording(true)
    }
  }

  return (
    <button
      type="button"
      data-testid="pose-record"
      onClick={toggle}
      style={{
        padding: space.sm,
        border: 'none',
        borderRadius: space.xs,
        background: recording ? color.controlActive : color.surfaceHud,
        color: color.textPrimary,
        fontSize: type.tvCaption,
        cursor: 'pointer',
      }}
    >
      {recording ? copy.debug.stopAndSave : copy.debug.record}
    </button>
  )
}
