import { color, space, type } from '../../styles/tokens'
import { ControlChoice } from '../../ui/ControlChoice'
import { isTouchDevice, useControlModeStore, type ControlMode } from '../controlModeStore'
import { useGameStore } from '../gameStore'
import './controlSelect.css'

export function ControlSelectScreen() {
  const secondMode = isTouchDevice() ? 'touch' : 'mouse'

  const choose = (mode: ControlMode) => {
    useControlModeStore.getState().selectMode(mode)
    const game = useGameStore.getState()
    if (mode === 'camera') {
      game.startPermission()
      game.permissionGranted()
    } else {
      game.skipToFlying()
    }
  }

  return (
    <main
      data-testid="control-select"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xl,
        // No plate and no backdrop filter: the world behind is blurred and scrimmed in the render
        // pipeline (#159), which is what keeps the corner marks at 3:1 (tokens.test.ts).
        color: color.textPrimary,
        fontFamily: type.fontBody,
      }}
    >
      <ControlChoice secondMode={secondMode} onChoose={choose} />
    </main>
  )
}
