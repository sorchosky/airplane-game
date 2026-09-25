import { useMemo } from 'react'
import { DebugReadout } from './DebugReadout'
import { useKeyboardSource } from './keyboardSource'
import { usePoseSource } from './poseSource'
import { useReplaySource } from './replaySource'
import { getInputSourceFromUrl, hasDebugFlag } from './source'
import { TouchControls } from './TouchControls'

/**
 * Mounts the input source selected by the `?input=` URL flag and, when relevant, its dev-only
 * companions (touch fallback, debug readout). Mount once near the app root.
 */
export function InputSource() {
  const source = useMemo(() => getInputSourceFromUrl(), [])
  const debug = useMemo(() => hasDebugFlag(), [])

  useKeyboardSource()
  usePoseSource()
  useReplaySource()

  return (
    <>
      {source === 'keyboard' && <TouchControls />}
      {debug && <DebugReadout />}
    </>
  )
}
