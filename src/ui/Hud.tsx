import { useMemo } from 'react'
import { useControlStore } from '../app/controlStore'
import { useInputStore } from '../input/inputStore'
import { getInputSourceFromUrl } from '../input/source'
import { CameraPreview } from './CameraPreview'
import { Prompt } from './Prompt'

/**
 * Flight HUD over the canvas: the control prompt and, when steering by pose, the camera preview
 * whose border (and orientation line, #15) shows whether gestures are steering. Never takes
 * pointer input. Rendered above the paused overlay so the player can still see themselves.
 */
export function Hud() {
  const prompt = useControlStore((s) => s.view.prompt)
  const active = useInputStore((s) => s.current.active)
  const showPreview = useMemo(() => getInputSourceFromUrl() === 'pose', [])

  return (
    <div data-testid="hud" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {showPreview && <CameraPreview controlState={active ? 'active' : 'inactive'} />}
      <Prompt prompt={prompt} />
    </div>
  )
}
