import { useEffect, useState } from 'react'
import { playCue } from '../../audio/audioEngine'
import { FRAME_PRIORITY, frameLoop } from '../frameLoop'
import { useControlModeStore } from '../controlModeStore'
import { CAMERA_HANDOFF_S } from '../../flight/cameraMath'
import { useFlightStore } from '../../flight/flightStore'
import { useInputStore } from '../../input/inputStore'
import { color, effect, space, type } from '../../styles/tokens'
import { CameraPreview } from '../../ui/CameraPreview'
import { copy } from '../../ui/copy'
import { HairlineRule } from '../../ui/HairlineRule'
import { useGameStore } from '../gameStore'
import { createWingsFlow, stepWingsFlow, wingsSpeedProgress, type WingsStep } from '../wingsFlow'

const ICON: Record<Exclude<WingsStep, 'done' | 'finished'>, string> = {
  left: '↶',
  right: '↷',
  climb: '↑',
  dive: '↓',
}

/**
 * The world keeps moving during practice; only this one line re-renders on a step change. Practice
 * starts once the camera has glided in from the title framing (#161): the plane keeps its cruise
 * through the glide, and a bank the flyby handed over can't count as a step.
 */
export function WingsPrompts() {
  const [step, setStep] = useState<WingsStep>('left')
  const [gliding, setGliding] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const showPreview = useControlModeStore((s) => s.controlMode === 'camera')
  const active = useInputStore((s) => s.current.active)

  useEffect(() => {
    if (!gliding) return
    const timer = window.setTimeout(() => setGliding(false), CAMERA_HANDOFF_S * 1000)
    return () => window.clearTimeout(timer)
  }, [gliding])

  useEffect(() => {
    if (gliding) return
    let flow = createWingsFlow(performance.now())
    useFlightStore.getState().setPracticeProgress(0)
    const remove = frameLoop.add((nowMs) => {
      const { bank, pitchAngle } = useFlightStore.getState().state
      const next = stepWingsFlow(flow, bank, pitchAngle, nowMs)
      useFlightStore.getState().setPracticeProgress(wingsSpeedProgress(next, nowMs))
      if (next.step !== flow.step) {
        if (next.step !== 'done') playCue('engaged')
        setStep(next.step)
      }
      flow = next
      if (flow.step === 'done') useGameStore.getState().wingsComplete()
    }, FRAME_PRIORITY.control)
    return () => {
      remove()
      useFlightStore.getState().setPracticeProgress(null)
    }
  }, [gliding])

  if (step === 'done') return null
  return (
    <>
      {showPreview && <CameraPreview controlState={active ? 'active' : 'inactive'} />}
      {!gliding && (
        <div
          role="status"
          aria-live="polite"
          data-testid="wings-prompt"
          data-step={step}
          style={{
            position: 'absolute',
            left: '50%',
            top: '70%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: space.md,
            padding: `${space.sm} ${space.lg}`,
            color: color.textPrimary,
            textShadow: effect.textGlow,
            fontFamily: type.fontDisplay,
            fontSize: type.tvTitle,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {step === 'finished' ? (
            <>
              <HairlineRule />
              {copy.wings.finished}
            </>
          ) : (
            <>
              <span aria-hidden="true">{ICON[step]}</span>
              <HairlineRule />
              {copy.wings[step]}
            </>
          )}
        </div>
      )}
    </>
  )
}
