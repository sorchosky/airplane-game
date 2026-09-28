import { useEffect } from 'react'
import { joystickVector, JOYSTICK_RANGE_PX } from './touchJoystick'

/** Full mouse deflection at 35% of the viewport's short side. */
export function mouseVector(clientX: number, clientY: number, width: number, height: number) {
  const radius = Math.min(width, height) * 0.35
  if (radius <= 0) return { roll: 0, pitch: 0 }
  const scale = JOYSTICK_RANGE_PX / radius
  const { roll, pitch } = joystickVector(
    (clientX - width / 2) * scale,
    (clientY - height / 2) * scale,
  )
  return { roll, pitch }
}

export const mouseTargets = { roll: 0, pitch: 0, active: false }

/** Pointer events only update targets; keyboardSource owns the per-frame store write. */
export function useMouseSource(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let position: { x: number; y: number } | null = null
    // Selection happens via a pointer inside the page; preserve that state until it leaves.
    let inside = document.hasFocus()

    const update = () => {
      if (position) {
        const vector = mouseVector(position.x, position.y, window.innerWidth, window.innerHeight)
        mouseTargets.roll = vector.roll
        mouseTargets.pitch = vector.pitch
      }
      mouseTargets.active = inside && document.hasFocus()
    }
    const move = (event: MouseEvent) => {
      position = { x: event.clientX, y: event.clientY }
      inside = true
      update()
    }
    const leave = () => {
      inside = false
      mouseTargets.roll = 0
      mouseTargets.pitch = 0
      mouseTargets.active = false
    }
    const blur = () => {
      mouseTargets.active = false
    }
    window.addEventListener('mousemove', move)
    document.documentElement.addEventListener('mouseleave', leave)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', update)
    window.addEventListener('resize', update)
    update()
    return () => {
      window.removeEventListener('mousemove', move)
      document.documentElement.removeEventListener('mouseleave', leave)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', update)
      window.removeEventListener('resize', update)
      leave()
    }
  }, [enabled])
}
