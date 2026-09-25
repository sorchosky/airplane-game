import { useEffect } from 'react'
import { useAudioEngine } from '../audio/useAudioEngine'
import { MaterialsScene } from '../debug/MaterialsScene'
import { Swatches } from '../debug/Swatches'
import { InputSource } from '../input/InputSource'
import {
  getVideo,
  setupCameraLifecycle,
  start as startCamera,
  stop as stopCamera,
  useCameraStore,
} from '../pose/cameraService'
import { startPoseService, stopPoseService } from '../pose/poseService'
import { PoseDebug } from '../debug/PoseDebug'
import { hasDebugFlag } from '../input/source'
import { Hud } from '../ui/Hud'
import { useControlStateDriver } from './controlStore'
import { FlightScene } from './FlightScene'
import { useGameStore } from './gameStore'
import { CalibrateScreen } from './screens/CalibrateScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { PausedOverlay } from './screens/PausedOverlay'
import { TitleScreen } from './screens/TitleScreen'
import { isMaterialsSceneMode, isSwatchesMode } from './urlFlags'
import { setupWakeLockReacquire } from './wakeLock'

/** Control-state machine plus its HUD, mounted for the life of one flight (flying ⇄ paused). */
function FlightControl() {
  useControlStateDriver()
  useAudioEngine()
  return <Hud />
}

export function App() {
  const state = useGameStore((s) => s.state)
  const permissionDenied = useGameStore((s) => s.permissionDenied)

  useEffect(() => setupWakeLockReacquire(), [])
  useEffect(() => setupCameraLifecycle(), [])

  // The camera and pose detection stay live from calibrate through flying
  // and paused (pose control needs them throughout) and only stop once the
  // player is back at the title screen. The pose model downloads here, after
  // Start, never on page load. A model load failure is shown on the
  // calibrate screen (poseStore.modelStatus), not routed to the error state.
  useEffect(() => {
    if (state === 'calibrate') {
      startCamera().then(
        () => startPoseService(getVideo()).catch(() => undefined),
        () => {
          const { errorMessage } = useCameraStore.getState()
          permissionDenied(errorMessage ?? 'Could not start the camera. Try again.')
        },
      )
    } else if (state === 'title') {
      stopPoseService()
      stopCamera()
    }
  }, [state, permissionDenied])

  const inFlight = state === 'flying' || state === 'paused'
  const showPoseDebug =
    hasDebugFlag() && (state === 'calibrate' || state === 'flying' || state === 'paused')

  if (isSwatchesMode()) {
    return <Swatches />
  }

  if (isMaterialsSceneMode()) {
    return <MaterialsScene />
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {state === 'title' && <TitleScreen />}
      {state === 'permission' && <TitleScreen />}
      {state === 'calibrate' && <CalibrateScreen />}
      {state === 'error' && <ErrorScreen />}
      {inFlight && <FlightScene />}
      {state === 'paused' && <PausedOverlay />}
      {inFlight && <FlightControl />}
      <InputSource enableTouchControls={state === 'flying'} />
      {showPoseDebug && <PoseDebug />}
    </div>
  )
}
