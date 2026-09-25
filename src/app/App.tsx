import { useEffect } from 'react'
import { Swatches } from '../debug/Swatches'
import { InputSource } from '../input/InputSource'
import {
  setupCameraLifecycle,
  start as startCamera,
  stop as stopCamera,
  useCameraStore,
} from '../pose/cameraService'
import { FlightScene } from './FlightScene'
import { useGameStore } from './gameStore'
import { CalibrateScreen } from './screens/CalibrateScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { PausedOverlay } from './screens/PausedOverlay'
import { TitleScreen } from './screens/TitleScreen'
import { isSwatchesMode } from './urlFlags'
import { setupWakeLockReacquire } from './wakeLock'

export function App() {
  const state = useGameStore((s) => s.state)
  const permissionDenied = useGameStore((s) => s.permissionDenied)

  useEffect(() => setupWakeLockReacquire(), [])
  useEffect(() => setupCameraLifecycle(), [])

  // The camera stays live from calibrate through flying and paused (pose
  // control needs it throughout) and only stops once the player is back at
  // the title screen.
  useEffect(() => {
    if (state === 'calibrate') {
      startCamera().catch(() => {
        const { errorMessage } = useCameraStore.getState()
        permissionDenied(errorMessage ?? 'Could not start the camera. Try again.')
      })
    } else if (state === 'title') {
      stopCamera()
    }
  }, [state, permissionDenied])

  if (isSwatchesMode()) {
    return <Swatches />
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {state === 'title' && <TitleScreen />}
      {state === 'permission' && <TitleScreen />}
      {state === 'calibrate' && <CalibrateScreen />}
      {state === 'error' && <ErrorScreen />}
      {(state === 'flying' || state === 'paused') && <FlightScene />}
      {state === 'paused' && <PausedOverlay />}
      <InputSource enableTouchControls={state === 'flying'} />
    </div>
  )
}
