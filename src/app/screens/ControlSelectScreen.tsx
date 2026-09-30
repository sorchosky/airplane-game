import { useRef } from 'react'
import { color, effect, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { isTouchDevice, useControlModeStore, type ControlMode } from '../controlModeStore'
import { useGameStore } from '../gameStore'
import './controlSelect.css'

export function ControlSelectScreen() {
  const secondMode: ControlMode = isTouchDevice() ? 'touch' : 'mouse'
  const modes: ControlMode[] = ['camera', secondMode]
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xl,
        padding: space.xl,
        background: color.surfaceScrim,
        backdropFilter: effect.scrimBlur,
        color: color.textPrimary,
        fontFamily: type.fontBody,
      }}
    >
      <h1
        style={{
          fontFamily: type.fontDisplay,
          fontSize: type.tvDisplay,
          margin: 0,
          textShadow: effect.textGlow,
        }}
      >
        {copy.controlSelect.title}
      </h1>
      <div className="control-options">
        {modes.map((mode, index) => (
          <button
            key={mode}
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            className="control-option"
            onClick={() => choose(mode)}
            onKeyDown={(event) => {
              if (
                event.key === 'ArrowLeft' ||
                event.key === 'ArrowUp' ||
                event.key === 'ArrowRight' ||
                event.key === 'ArrowDown'
              ) {
                event.preventDefault()
                const next = (index + 1) % modes.length
                buttons.current[next]?.focus()
              }
            }}
          >
            <span
              style={{
                fontFamily: type.fontDisplay,
                fontSize: type.tvTitle,
                fontWeight: type.weightDisplay,
              }}
            >
              {copy.controlSelect[mode]}
            </span>
            <span style={{ fontSize: type.tvBody }}>{copy.controlSelect[`${mode}Hint`]}</span>
          </button>
        ))}
      </div>
    </main>
  )
}
