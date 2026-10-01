import { useEffect } from 'react'
import { useAudioEngine } from '../audio/useAudioEngine'
import { MaterialsScene } from '../debug/MaterialsScene'
import { Swatches } from '../debug/Swatches'
import { WorldMap } from '../debug/WorldMap'
import { InputSource } from '../input/InputSource'
import {
  getVideo,
  setupCameraLifecycle,
  start as startCamera,
  stop as stopCamera,
  useCameraStore,
} from '../pose/cameraService'
import { startPoseService, stopPoseService } from '../pose/poseService'
import { PerfHud } from '../debug/PerfHud'
import { PoseDebug } from '../debug/PoseDebug'
import { ShotReady } from '../debug/ShotReady'
import { activeShot } from '../debug/shots'
import { hasDebugFlag } from '../input/source'
import { copy } from '../ui/copy'
import { Hud } from '../ui/Hud'
import { GoldenPathTitle } from '../world/GoldenPath'
import { OrientationPrompt } from '../ui/OrientationPrompt'
import { setupCameraRecovery } from './cameraRecovery'
import { useControlModeStore } from './controlModeStore'
import { useControlStateDriver } from './controlStore'
import { FrontDoorStage } from './FrontDoorStage'
import { useGameStore } from './gameStore'
import { PausedOverlay } from './screens/PausedOverlay'
import { WingsPrompts } from './screens/WingsPrompts'
import { isMaterialsSceneMode, isReplayInputMode, isSwatchesMode, mapSizeKm } from './urlFlags'
import { sceneModeFor, worldIsVisible } from './sceneMode'
import { useGameClock } from './useGameClock'
import { WorldLayer } from './WorldLayer'
import { setupWakeLockReacquire } from './wakeLock'
import { useAccessibilityStore } from './accessibilityStore'

/** Control-state machine, audio and in-game clock plus the HUD, mounted for the life of one flight (flying ⇄ paused). */
function FlightControl({ hud }: { hud: boolean }) {
  useControlStateDriver()
  useAudioEngine()
  useGameClock()
  return hud ? <Hud /> : null
}

function GameApp() {
  const state = useGameStore((s) => s.state)
  const mode = useControlModeStore((s) => s.controlMode)
  const permissionDenied = useGameStore((s) => s.permissionDenied)
  const highContrast = useAccessibilityStore((s) => s.highContrast)

  useEffect(() => setupWakeLockReacquire(), [])
  useEffect(() => setupCameraLifecycle(), [])
  useEffect(() => setupCameraRecovery(), [])

  // The camera and pose detection stay live from calibrate through flying
  // and paused (pose control needs them throughout) and only stop once the
  // player is back at the title screen. The pose model downloads here, after
  // Start, never on page load. A model load failure is shown on the
  // calibrate screen (poseStore.modelStatus), not routed to the error state.
  // A replay feeds poseStore itself, so neither runs under `?input=replay`.
  useEffect(() => {
    if (isReplayInputMode() || mode !== 'camera') return
    if (state === 'calibrate') {
      startCamera().then(
        () => startPoseService(getVideo()).catch(() => undefined),
        () => {
          const { errorMessage } = useCameraStore.getState()
          permissionDenied(errorMessage ?? copy.error.cameraFailed)
        },
      )
    } else if (state === 'title') {
      stopPoseService()
      stopCamera()
    }
  }, [state, permissionDenied, mode])

  const sceneMode = sceneModeFor(state)
  const inFlight = sceneMode === 'flight'
  // `?shot=` captures the world alone: no prompt, no preview, no touch fallback over it.
  const shot = activeShot() !== null
  const showPoseDebug = hasDebugFlag() && (state === 'calibrate' || inFlight)

  if (isSwatchesMode()) {
    return <Swatches />
  }

  if (isMaterialsSceneMode()) {
    return <MaterialsScene />
  }

  return (
    <div
      className={highContrast ? 'high-contrast' : undefined}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        // The world sits behind everything at z-index -1; this keeps it inside the app.
        isolation: 'isolate',
        cursor: inFlight && mode === 'mouse' && !shot ? 'crosshair' : undefined,
      }}
    >
      <WorldLayer mode={sceneMode} covered={!worldIsVisible(state)} />
      <FrontDoorStage />
      {state === 'wings' && <WingsPrompts />}
      {state === 'paused' && <PausedOverlay />}
      {(state === 'flying' || state === 'paused') && <FlightControl hud={!shot} />}
      {/* Attract (title, select, permission, error) attaches no input source; calibrate on does. */}
      {(inFlight || state === 'calibrate') && (
        <InputSource enableTouchControls={state === 'flying' && !shot} />
      )}
      {inFlight && !shot && <GoldenPathTitle />}
      <PerfHud initiallyVisible={hasDebugFlag()} />
      {shot && <ShotReady />}
      {showPoseDebug && (
        <PoseDebug reserveTouchPause={state === 'flying' && mode === 'touch' && !shot} />
      )}
      <OrientationPrompt />
    </div>
  )
}

export function App() {
  const mapKm = mapSizeKm()
  return mapKm === null ? <GameApp /> : <WorldMap sizeKm={mapKm} />
}
