import { useEffect, useRef } from 'react'
import { color, effect, size, space } from '../styles/tokens'
import { useClockStore } from '../world/clockStore'
import { copy } from './copy'
import { sunMoonDialPosition } from './sunMoonDial'

const VIEW_WIDTH = 160
const HORIZON_Y = 76
const ARC_HEIGHT = 60

function transform(x: number, y: number): string {
  return `translate(${x * VIEW_WIDTH} ${HORIZON_Y - y * ARC_HEIGHT})`
}

/** Hairline celestial dial. React only follows the coarse clock label, while the glyphs use RAF. */
export function SunMoonDial() {
  const display = useClockStore((state) => state.display)
  const sunRef = useRef<SVGGElement>(null)
  const moonRef = useRef<SVGGElement>(null)

  useEffect(() => {
    let frame = 0
    const draw = () => {
      const position = sunMoonDialPosition(useClockStore.getState().time.minutes)
      if (sunRef.current) {
        sunRef.current.setAttribute('transform', transform(position.sun.x, position.sun.y))
        sunRef.current.style.opacity = String(position.sun.opacity)
      }
      if (moonRef.current) {
        moonRef.current.setAttribute('transform', transform(position.moon.x, position.moon.y))
        moonRef.current.style.opacity = String(position.moon.opacity)
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <time
      data-testid="sun-moon-dial"
      dateTime={display}
      aria-label={`${copy.hud.clockLabel} ${display}`}
      style={{
        position: 'absolute',
        top: space.md,
        right: space.md,
        width: size.sunMoonDial,
        aspectRatio: '16 / 9',
        display: 'block',
        color: color.line,
        textShadow: effect.textGlow,
        filter: effect.ringGlow,
      }}
    >
      <svg aria-hidden="true" viewBox="-12 0 184 96" width="100%" height="100%" overflow="visible">
        <path
          d={`M 0 ${HORIZON_Y} A 80 ${ARC_HEIGHT} 0 0 1 160 ${HORIZON_Y}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path d={`M -8 ${HORIZON_Y} H 168`} fill="none" stroke="currentColor" strokeWidth="1" />
        <g
          ref={sunRef}
          fill="none"
          stroke={color.textPrimary}
          strokeWidth={size.glyphStroke}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <circle r="7" />
          <path d="M 0 -13 V -10 M 9.2 -9.2 L 7.1 -7.1 M 13 0 H 10 M 9.2 9.2 L 7.1 7.1 M 0 13 V 10 M -9.2 9.2 L -7.1 7.1 M -13 0 H -10 M -9.2 -9.2 L -7.1 -7.1" />
        </g>
        <g
          ref={moonRef}
          fill="none"
          stroke={color.textMuted}
          strokeWidth={size.glyphStroke}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <path d="M 5.5 -10 A 11 11 0 1 0 5.5 10 A 9 9 0 0 1 5.5 -10 Z" />
        </g>
      </svg>
    </time>
  )
}
