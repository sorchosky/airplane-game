import { color, space } from '../styles/tokens'

/** A restrained geometric mark shared by single-line HUD messages. */
export function HairlineRule() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width: space.xxl,
        height: 1,
        flexShrink: 0,
        background: color.line,
        boxShadow: `0 0 8px ${color.glow}`,
      }}
    />
  )
}
