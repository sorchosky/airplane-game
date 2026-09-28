import { useCallback, useState } from 'react'
import { useControlModeStore } from '../app/controlModeStore'
import { useControlStore } from '../app/controlStore'
import { useInputStore } from '../input/inputStore'
import { color, space } from '../styles/tokens'
import { CameraPreview } from './CameraPreview'
import { ClockReadout } from './ClockReadout'
import { LockInReveal } from './LockInReveal'
import { InputReadout } from './InputReadout'
import { PauseTeaching } from './PauseTeaching'
import { Prompt } from './Prompt'
import { WarmCaption } from './WarmCaption'

/**
 * Flight HUD over the canvas: the control prompt and, when steering by pose, the camera preview
 * whose border (and orientation line, #15) shows whether gestures are steering. Never takes
 * pointer input. The in-game clock (#94) sits top right. Rendered above the paused overlay so the player can still see themselves.
 */
export function Hud() {
  const [teaching, setTeaching] = useState(false)
  const onTeachingChange = useCallback((visible: boolean) => setTeaching(visible), [])
  const prompt = useControlStore((s) => s.view.prompt)
  const active = useInputStore((s) => s.current.active)
  const showPreview = useControlModeStore((s) => s.controlMode === 'camera')
  const showReticle = useControlModeStore(
    (s) => s.controlMode === 'mouse' && s.inputOverride === null,
  )

  return (
    <div data-testid="hud" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <LockInReveal />
      {showPreview && <CameraPreview controlState={active ? 'active' : 'inactive'} />}
      {showReticle && (
        <div
          data-testid="mouse-reticle"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: space.md,
            height: space.md,
            border: `2px solid ${color.line}`,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 0 2px ${color.outline}`,
          }}
        />
      )}
      <InputReadout />
      <Prompt prompt={teaching ? null : prompt} />
      <PauseTeaching onChange={onTeachingChange} />
      <WarmCaption />
      <ClockReadout />
    </div>
  )
}
