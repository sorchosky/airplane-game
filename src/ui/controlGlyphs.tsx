import { useEffect, useRef, type ReactNode, type Ref } from 'react'
import {
  motionHeadDeg,
  motionTiltDeg,
  MOTION_LOOP_MS,
  MOTION_PHASE_MS,
  sampleKeyframes,
  TOUCH_CYCLE_MS,
  TOUCH_PHASE_MS,
  TOUCH_RING_RADIUS,
  TOUCH_STATIC_MS,
  touchFrame,
  type SampledKeyframe,
  type TouchFrame,
} from './controlGlyphMotion'
import { size } from '../styles/tokens'

/**
 * The control choice glyph family (#154): one hairline contour style (a single stroke token, round
 * caps and joins, `currentColor`, no fills) in a shared 240 × 112 viewBox, bottom-aligned so the
 * labels below share a baseline. Loops are Web Animations built from `controlGlyphMotion.ts`
 * (transforms and opacity only); reduced motion keeps the static key pose.
 */

const SAMPLE_STEP_MS = 20

function GlyphSvg({ svgRef, children }: { svgRef?: Ref<SVGSVGElement>; children: ReactNode }) {
  return (
    <svg
      ref={svgRef}
      className="control-glyph"
      viewBox="0 0 240 112"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

interface Loop {
  element: Element | null
  keyframes: SampledKeyframe[]
  periodMs: number
  phaseMs: number
}

/** Starts the loops unless the player prefers reduced motion; the static pose stays otherwise. */
function useGlyphLoops(build: () => Loop[]) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animations = build().flatMap(({ element, keyframes, periodMs, phaseMs }) => {
      if (!element || typeof element.animate !== 'function') return []
      return [
        element.animate(keyframes, {
          duration: periodMs,
          iterations: Infinity,
          delay: -phaseMs,
          easing: 'linear',
          fill: 'both',
        }),
      ]
    })
    return () => animations.forEach((animation) => animation.cancel())
    // The loops are fixed for the glyph's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const rotate = (deg: number) => ({ transform: `rotate(${deg}deg)` })

/** Skull, ears and jaw, open at the neck. */
const HEAD_CONTOUR =
  'M113 47 C110 44 108 40.5 107.6 36.5 C105.6 36.2 105 32.5 106.4 30.2 ' +
  'C106 19.5 112.2 11.5 120 11.5 C127.8 11.5 134 19.5 133.6 30.2 ' +
  'C135 32.5 134.4 36.2 132.4 36.5 C132 40.5 130 44 127 47'
/**
 * The left half from the neck: shoulder, an arm held straight out that tapers to a rounded hand
 * (no fingers), the armpit and the torso side, open at the waist. Mirrored for the right half.
 */
const BODY_HALF_CONTOUR =
  'M113 47 L112.6 50.4 C110 52.6 104 52.8 97 53.2 L27 55.4 ' +
  'C22 55.4 17.5 54.6 12.5 55 C7 55.4 4 57 4 58.6 C4 60.4 7 61.8 12.5 62 ' +
  'C17.5 62.2 22 61.4 27 61.2 L91 64 C94.6 64.2 96.6 66 96.6 69 ' +
  'C96.4 84 98.4 98 100 110'

export function MotionGlyph({ svgRef }: { svgRef?: Ref<SVGSVGElement> }) {
  const rigRef = useRef<SVGGElement | null>(null)
  const headRef = useRef<SVGGElement | null>(null)

  useGlyphLoops(() => [
    {
      element: rigRef.current,
      keyframes: sampleKeyframes(MOTION_LOOP_MS, SAMPLE_STEP_MS, motionTiltDeg, (deg) =>
        rotate(deg),
      ),
      periodMs: MOTION_LOOP_MS,
      phaseMs: MOTION_PHASE_MS,
    },
    {
      element: headRef.current,
      keyframes: sampleKeyframes(
        MOTION_LOOP_MS,
        SAMPLE_STEP_MS,
        (t) => motionHeadDeg(motionTiltDeg(t)),
        (deg) => rotate(deg),
      ),
      periodMs: MOTION_LOOP_MS,
      phaseMs: MOTION_PHASE_MS,
    },
  ])

  return (
    <GlyphSvg svgRef={svgRef}>
      {/* Everything rotates about the waist point (120, 110). */}
      <g transform="translate(120 110)">
        <g
          ref={(node) => {
            rigRef.current = node
          }}
          style={rotate(0)}
        >
          <g transform="translate(-120 -110)">
            <path d={BODY_HALF_CONTOUR} />
            <path d={BODY_HALF_CONTOUR} transform="translate(240 0) scale(-1 1)" />
            {/* The head counter-tilts about the base of the neck. */}
            <g transform="translate(120 50)">
              <g
                ref={(node) => {
                  headRef.current = node
                }}
                style={rotate(0)}
              >
                <g transform="translate(-120 -50)">
                  <path d={HEAD_CONTOUR} />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </GlyphSvg>
  )
}

// Index finger up with its tip at the origin, three folded fingers stepping down to the right, the
// thumb out to the left and a rounded heel, in the same contour style as the figure.
const HAND_CONTOUR =
  'M-6.5 50 V6.5 A6.5 6.5 0 0 1 6.5 6.5 V24 ' +
  'C6.5 19.5 9.2 17 12.5 17 C15.8 17 18.5 19.5 18.5 23 ' +
  'C18.8 20.6 21.2 19.6 24.5 19.6 C27.8 19.6 30.5 22 30.5 25.5 ' +
  'C30.9 23.4 33.2 22.6 36 22.6 C39.4 22.6 42 25 42 28.5 V48 ' +
  'C42 64 33 79 20 79 H11 C5 79 0.5 76.4 -2.6 72.4 L-17 55 ' +
  'C-20.5 50.5 -14 44 -6.5 50 ' +
  'M6.5 24 V36 M18.5 23 V34 M30.5 25.5 V36'
// A cursor arrow with its tip at the origin.
const CURSOR_CONTOUR = 'M0 0 V52 L13 40.5 L22 60 L30 56.4 L21.2 37.4 H38 Z'

const px = (value: number) => `${value}px`

function handStyle(f: TouchFrame) {
  return { transform: `translate(${px(f.handX)}, ${px(f.handY)}) scale(${f.handScale})` }
}
function dotStyle(f: TouchFrame) {
  return { transform: `translate(${px(f.dotX)}, ${px(f.dotY)})`, opacity: f.dotOpacity }
}
function ringStyle(f: TouchFrame) {
  return {
    transform: `translate(${px(f.ringX)}, 0px) scale(${f.ringScale})`,
    opacity: f.ringOpacity,
  }
}
function trailStyle(f: TouchFrame) {
  return {
    transform: `translate(${px(f.trailX)}, 0px) rotate(${f.trailAngleDeg}deg) scaleX(${f.trailLength})`,
    opacity: f.trailOpacity,
  }
}

/** Touch (hand and contact dot) and Mouse (cursor) share the tap-and-drag beats. */
function PointerGlyph({ kind, svgRef }: { kind: 'touch' | 'mouse'; svgRef?: Ref<SVGSVGElement> }) {
  const refs = {
    hand: useRef<SVGGElement | null>(null),
    dot: useRef<SVGCircleElement | null>(null),
    ring: useRef<SVGCircleElement | null>(null),
    trail: useRef<SVGLineElement | null>(null),
  }
  const still = touchFrame(TOUCH_STATIC_MS)
  const isTouch = kind === 'touch'

  useGlyphLoops(() => {
    const loop = (
      element: Element | null,
      project: (frame: TouchFrame) => Record<string, string | number>,
    ): Loop => ({
      element,
      keyframes: sampleKeyframes(TOUCH_CYCLE_MS, SAMPLE_STEP_MS, touchFrame, project),
      periodMs: TOUCH_CYCLE_MS,
      phaseMs: TOUCH_PHASE_MS,
    })
    return [
      loop(refs.hand.current, handStyle),
      loop(refs.dot.current, dotStyle),
      loop(refs.ring.current, ringStyle),
      loop(refs.trail.current, trailStyle),
    ]
  })

  // The contact point: the fingertip when pressed, or the cursor tip.
  const contactX = isTouch ? 106 : 101
  const contactY = isTouch ? 21 : 56

  return (
    <GlyphSvg svgRef={svgRef}>
      <g transform={`translate(${contactX} ${contactY})`}>
        <line
          ref={(node) => {
            refs.trail.current = node
          }}
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          style={{ ...trailStyle(still), strokeWidth: size.glyphTrailStroke }}
        />
        <circle
          ref={(node) => {
            refs.ring.current = node
          }}
          r={TOUCH_RING_RADIUS}
          style={ringStyle(still)}
        />
        {isTouch && (
          <circle
            ref={(node) => {
              refs.dot.current = node
            }}
            r="2.5"
            style={dotStyle(still)}
          />
        )}
        <g
          ref={(node) => {
            refs.hand.current = node
          }}
          style={handStyle(still)}
        >
          {/* Raised 6 px at rest; the press brings the tip down onto the contact point. */}
          <g transform={isTouch ? 'translate(0 -6) scale(1.2)' : 'translate(0 -6)'}>
            <path d={isTouch ? HAND_CONTOUR : CURSOR_CONTOUR} />
          </g>
        </g>
      </g>
    </GlyphSvg>
  )
}

export function TouchGlyph({ svgRef }: { svgRef?: Ref<SVGSVGElement> }) {
  return <PointerGlyph kind="touch" svgRef={svgRef} />
}

export function MouseGlyph({ svgRef }: { svgRef?: Ref<SVGSVGElement> }) {
  return <PointerGlyph kind="mouse" svgRef={svgRef} />
}
