import { useEffect, useState } from 'react'
import { playCue } from '../../audio/audioEngine'
import { FRAME_PRIORITY, frameLoop } from '../frameLoop'
import { useControlModeStore } from '../controlModeStore'
import { useFlightStore } from '../../flight/flightStore'
import { useInputStore } from '../../input/inputStore'
import { color, effect, space, type } from '../../styles/tokens'
import { CameraPreview } from '../../ui/CameraPreview'
import { copy } from '../../ui/copy'
import { useGameStore } from '../gameStore'
import { createWingsFlow, stepWingsFlow, wingsSpeedProgress, type WingsStep } from '../wingsFlow'

const ICON: Record<Exclude<WingsStep, 'done' | 'finished'>, string> = {
  left: '↶',
  right: '↷',
  climb: '↑',
  dive: '↓',
}

/** The world keeps moving during practice; only this one line re-renders on a step change. */
export function WingsPrompts() {
  const [step, setStep] = useState<WingsStep>('left')
  const showPreview = useControlModeStore((s) => s.controlMode === 'camera')
  const active = useInputStore((s) => s.current.active)

  useEffect(() => {
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
  }, [])

  if (step === 'done') return null
  return (
    <>
      {showPreview && <CameraPreview controlState={active ? 'active' : 'inactive'} />}
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
          copy.wings.finished
        ) : (
          <>
            <span aria-hidden="true">{ICON[step]}</span>
            {copy.wings[step]}
          </>
        )}
      </div>
    </>
  )
}
