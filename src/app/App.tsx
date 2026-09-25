import { useEffect } from 'react'
import { FlightScene } from './FlightScene'
import { useGameStore } from './gameStore'
import { CalibrateScreen } from './screens/CalibrateScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { PausedOverlay } from './screens/PausedOverlay'
import { TitleScreen } from './screens/TitleScreen'
import { setupWakeLockReacquire } from './wakeLock'

export function App() {
  const state = useGameStore((s) => s.state)

  useEffect(() => setupWakeLockReacquire(), [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {state === 'title' && <TitleScreen />}
      {state === 'permission' && <TitleScreen />}
      {state === 'calibrate' && <CalibrateScreen />}
      {state === 'error' && <ErrorScreen />}
      {(state === 'flying' || state === 'paused') && <FlightScene />}
      {state === 'paused' && <PausedOverlay />}
    </div>
  )
}
