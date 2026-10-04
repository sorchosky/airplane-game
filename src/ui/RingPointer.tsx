import { useEffect, useRef } from 'react'
import { useCourseSettingsStore } from '../app/courseSettingsStore'
import { useGameStore } from '../app/gameStore'
import { color, effect, size } from '../styles/tokens'
import { ringPointerPosition, type RingPointerResult } from './ringPointerMath'
import { ringPointerFrame } from './ringPointerStore'

const SHOW_DELAY_MS = 1500
const FADE_IN_MS = 400
const FADE_OUT_MS = 200

export function RingPointer() {
  const pointerRef = useRef<HTMLDivElement>(null)
  const courseRings = useCourseSettingsStore((state) => state.courseRings)

  useEffect(() => {
    const pointer = pointerRef.current
    if (!pointer || courseRings !== 'all') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const projected: RingPointerResult = { x: 0, y: 0, angle: 0 }
    const exclusions = { previewRight: 0, previewBottom: 0, dialLeft: 0, dialBottom: 0, radius: 0 }
    const measure = () => {
      const preview = document.querySelector<HTMLElement>('[data-testid="camera-preview"]')
      const dial = document.querySelector<HTMLElement>('[data-testid="sun-moon-dial"]')
      const previewRect = preview?.getBoundingClientRect()
      const dialRect = dial?.getBoundingClientRect()
      exclusions.previewRight = previewRect?.right ?? 0
      exclusions.previewBottom = previewRect?.bottom ?? 0
      exclusions.dialLeft = dialRect?.left ?? viewport.width
      exclusions.dialBottom = dialRect?.bottom ?? 0
      exclusions.radius = pointer.offsetWidth / 2
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    let hiddenSince = 0
    let opacity = 0
    let previous = performance.now()
    let frame = 0

    const draw = (now: number) => {
      viewport.width = window.innerWidth
      viewport.height = window.innerHeight
      const game = useGameStore.getState().state
      const eligible = game === 'flying' && useCourseSettingsStore.getState().courseRings === 'all'
      const position = ringPointerFrame.ready
        ? ringPointerPosition(
            ringPointerFrame.viewProjection.elements,
            ringPointerFrame.nextRing,
            viewport,
            projected,
          )
        : null
      const offscreen = eligible && position !== null
      if (offscreen) {
        if (hiddenSince === 0) hiddenSince = now
      } else {
        hiddenSince = 0
      }
      const target = offscreen && now - hiddenSince >= SHOW_DELAY_MS ? 1 : 0
      const duration = target > opacity ? FADE_IN_MS : FADE_OUT_MS
      opacity = reducedMotion
        ? target
        : opacity +
          Math.sign(target - opacity) *
            Math.min(Math.abs(target - opacity), (now - previous) / duration)
      previous = now

      if (position) {
        const radius = exclusions.radius
        if (
          position.x - radius < exclusions.previewRight &&
          position.y - radius < exclusions.previewBottom
        ) {
          position.y = exclusions.previewBottom + radius
        }
        if (
          position.x + radius > exclusions.dialLeft &&
          position.y - radius < exclusions.dialBottom
        ) {
          position.y = exclusions.dialBottom + radius
        }
        pointer.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%) rotate(${position.angle}rad)`
      }
      pointer.style.opacity = String(opacity)
      pointer.style.visibility = opacity === 0 ? 'hidden' : 'visible'
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [courseRings])

  if (courseRings !== 'all') return null
  return (
    <div
      ref={pointerRef}
      data-testid="ring-pointer"
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size.ringPointer,
        height: size.ringPointer,
        color: color.courseRing,
        filter: effect.textGlow,
        opacity: 0,
        visibility: 'hidden',
        willChange: 'transform, opacity',
      }}
    >
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <path
          d="M 11 8 L 35 24 L 11 40"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
