import { useMemo } from 'react'
import { isTouchDevice, useControlModeStore } from '../app/controlModeStore'
import { useControlStore } from '../app/controlStore'
import { color, space, type } from '../styles/tokens'
import { copy } from '../ui/copy'
import { useGameStore } from '../app/gameStore'
import { DebugReadout } from './DebugReadout'
import { useKeyboardSource } from './keyboardSource'
import { useMouseSource } from './mouseSource'
import { usePoseSource } from './poseSource'
import { useReplaySource } from './replaySource'
import { hasDebugFlag } from './source'
import { TouchControls } from './TouchControls'

interface InputSourceProps {
  /**
   * Whether the touch drag-fallback should render. It's a full-viewport overlay, so callers must
   * keep it off screens with their own buttons (title, calibrate, paused) or it silently eats
   * every tap/click on them.
   */
  enableTouchControls: boolean
}

/**
 * Mounts the source for the selected mode (or explicit dev preset). The floating touch joystick
 * feeds keyboardSource's single writer so keyboard and touch never race to update the store.
 */
export function InputSource({ enableTouchControls }: InputSourceProps) {
  const mode = useControlModeStore((s) => s.controlMode)
  const override = useControlModeStore((s) => s.inputOverride)
  const source = override ?? (mode === 'camera' ? 'pose' : 'keyboard')
  const touchFallback = mode === 'touch' || (override === 'keyboard' && isTouchDevice())
  const debug = useMemo(() => hasDebugFlag(), [])
  // A replay stands in for the player, so it starts when a real player would step in: on leaving
  // the title screen. Back at the title it stops, and the next Start plays it from the top.
  const replaying = useGameStore(
    (s) => source === 'replay' && s.state !== 'title' && s.state !== 'error',
  )

  // Only the selected source writes the input store; two writers would overwrite each other
  // every frame.
  const mouseMode = mode === 'mouse' && override === null
  useMouseSource(source === 'keyboard' && mouseMode && enableTouchControls)
  useKeyboardSource(source === 'keyboard', mouseMode)
  usePoseSource(source === 'pose')
  useReplaySource(replaying)

  return (
    <>
      {touchFallback && source === 'keyboard' && enableTouchControls && (
        <>
          <TouchControls />
          {mode === 'touch' && (
            <button
              type="button"
              aria-label={copy.pause.title}
              onClick={() => useControlStore.getState().togglePause()}
              style={{
                position: 'absolute',
                top: space.md,
                right: space.md,
                zIndex: 1,
                minWidth: space.xxl,
                minHeight: space.xxl,
                padding: space.sm,
                border: `2px solid ${color.line}`,
                background: color.surfaceHud,
                color: color.textPrimary,
                fontSize: type.tvBody,
                fontFamily: type.fontBody,
                cursor: 'pointer',
              }}
            >
              {copy.pause.title}
            </button>
          )}
        </>
      )}
      {debug && <DebugReadout />}
    </>
  )
}
