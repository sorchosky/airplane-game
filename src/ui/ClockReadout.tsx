import { color, space, type } from '../styles/tokens'
import { useClockStore } from '../world/clockStore'
import { copy } from './copy'

/**
 * In-game clock, top right (#94). Subscribes to the half-hour `display` only, so React re-renders
 * 48 times a loop, never per frame. A dark `surfaceHud` pill keeps it legible against both the
 * day and the night sky. Part of the HUD, so it is already hidden in `?shot=` captures and during
 * calibrate. Read-only: nothing to tap.
 */
export function ClockReadout() {
  const display = useClockStore((s) => s.display)
  return (
    <time
      data-testid="clock-readout"
      dateTime={display}
      aria-label={copy.hud.clockLabel}
      style={{
        position: 'absolute',
        top: space.md,
        right: space.md,
        padding: `${space.xs} ${space.md}`,
        borderRadius: space.md,
        background: color.surfaceHud,
        color: color.textPrimary,
        fontFamily: type.fontBody,
        fontSize: type.tvBody,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {display}
    </time>
  )
}
