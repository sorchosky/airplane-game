import { useEffect, useRef } from 'react'
import { color, size } from '../styles/tokens'
import { copy } from './copy'
import {
  createDemoFigure,
  DEMO_HEAD_RADIUS,
  DEMO_KEYS,
  demoFigure,
  demoFrameIndex,
  demoPose,
  type DemoFigure,
} from './poseDemo'

const STROKE_WIDTH = 8

function armPoints(figure: DemoFigure): string {
  const { leftWrist: l, neck: n, rightWrist: r } = figure
  return `${l.x},${l.y} ${n.x},${n.y} ${r.x},${r.y}`
}

function legPoints(figure: DemoFigure): string {
  const { leftFoot: l, hip: h, rightFoot: r } = figure
  return `${l.x},${l.y} ${h.x},${h.y} ${r.x},${r.y}`
}

/**
 * The title's pose demonstration (#63): a silhouette looping arms out → lean → arms up at 24 fps.
 * Written straight to the SVG from an animation frame loop, only when the 24 fps frame changes, so
 * it never re-renders React. Under reduced motion it holds the first frame.
 */
export function PoseDemoFigure() {
  const headRef = useRef<SVGCircleElement>(null)
  const torsoRef = useRef<SVGLineElement>(null)
  const armsRef = useRef<SVGPolylineElement>(null)
  // The first frame, for the initial render and reduced motion.
  const still = useRef(demoFigure(DEMO_KEYS[0] ?? { lean: 0, armRaise: 0 })).current

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const pose = { lean: 0, armRaise: 0 }
    const figure = createDemoFigure()
    const startMs = performance.now()
    let lastIndex = -1
    let frame = 0

    const tick = (nowMs: number) => {
      const t = nowMs - startMs
      const index = demoFrameIndex(t)
      if (index !== lastIndex) {
        lastIndex = index
        demoFigure(demoPose(t, pose), figure)
        headRef.current?.setAttribute('cx', String(figure.head.x))
        headRef.current?.setAttribute('cy', String(figure.head.y))
        torsoRef.current?.setAttribute('x2', String(figure.neck.x))
        torsoRef.current?.setAttribute('y2', String(figure.neck.y))
        armsRef.current?.setAttribute('points', armPoints(figure))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <svg
      viewBox="0 0 160 160"
      width={size.poseDemoFigure}
      height={size.poseDemoFigure}
      role="img"
      aria-label={copy.title.demoLabel}
      data-testid="pose-demo"
      style={{ flexShrink: 0 }}
    >
      <g
        stroke={color.textMuted}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <circle
          ref={headRef}
          cx={still.head.x}
          cy={still.head.y}
          r={DEMO_HEAD_RADIUS}
          fill={color.textMuted}
          stroke="none"
        />
        <line
          ref={torsoRef}
          x1={still.hip.x}
          y1={still.hip.y}
          x2={still.neck.x}
          y2={still.neck.y}
        />
        <polyline ref={armsRef} points={armPoints(still)} />
        <polyline points={legPoints(still)} />
      </g>
    </svg>
  )
}
