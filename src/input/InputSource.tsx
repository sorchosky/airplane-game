import { useMemo } from 'react'
import { DebugReadout } from './DebugReadout'
import { useKeyboardSource } from './keyboardSource'
import { usePoseSource } from './poseSource'
import { useReplaySource } from './replaySource'
import { getInputSourceFromUrl, hasDebugFlag } from './source'
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
 * Mounts the input source selected by the `?input=` URL flag and, when relevant, its dev-only
 * companions (touch fallback, debug readout). Mount once near the app root.
 */
export function InputSource({ enableTouchControls }: InputSourceProps) {
  const source = useMemo(() => getInputSourceFromUrl(), [])
  const debug = useMemo(() => hasDebugFlag(), [])

  // Only the selected source writes the input store; two writers would overwrite each other
  // every frame.
  useKeyboardSource(source === 'keyboard')
  usePoseSource(source === 'pose')
  useReplaySource()

  return (
    <>
      {source === 'keyboard' && enableTouchControls && <TouchControls />}
      {debug && <DebugReadout />}
    </>
  )
}
