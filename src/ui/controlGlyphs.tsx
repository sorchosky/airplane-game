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
 * caps and joins, `currentColor`, no fills) in a shared 160 × 128 viewBox, bottom-aligned so the
 * labels below share a baseline. Loops are Web Animations built from `controlGlyphMotion.ts`
 * (transforms and opacity only); reduced motion keeps the static key pose.
 */

const SAMPLE_STEP_MS = 20

function GlyphSvg({ svgRef, children }: { svgRef?: Ref<SVGSVGElement>; children: ReactNode }) {
  return (
    <svg
      ref={svgRef}
      className="control-glyph"
      viewBox="0 0 160 128"
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

/** Head, neck, shoulder contour and straight arms ending in a rounded taper; torso open at the waist. */
const ARM_CONTOUR =
  'M75 54 C70 58 64 60 58 60 L18 62 A4 4 0 0 0 18 70 L58 71 C62 72 64 75 64 80 L66 118'

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
      {/* Everything rotates about the waist point (80, 118). */}
      <g transform="translate(80 118)">
        <g
          ref={(node) => {
            rigRef.current = node
          }}
          style={rotate(0)}
        >
          <g transform="translate(-80 -118)">
            <path d={ARM_CONTOUR} />
            <path d={ARM_CONTOUR} transform="translate(160 0) scale(-1 1)" />
            {/* The head counter-tilts about the base of the neck. */}
            <g transform="translate(80 54)">
              <g
                ref={(node) => {
                  headRef.current = node
                }}
                style={rotate(0)}
              >
                <g transform="translate(-80 -54)">
                  <circle cx="80" cy="32" r="14" />
                  <path d="M75 45 V54 M85 45 V54" />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </GlyphSvg>
  )
}

// Index finger with a fingertip at the top, drawn in the same contour style; the wrist is open.
const HAND_CONTOUR =
  'M-5 6 A5 5 0 0 1 5 6 L5 24 C9 22 14 22 14 27 C18 26 22 27 22 32 L22 44 C22 54 14 60 8 62 ' +
  'M-5 6 V30 C-12 28 -20 32 -20 38 C-20 42 -16 44 -12 42 L-8 44 C-8 52 -6 58 -4 62'
// A cursor arrow with its tip at the origin.
const CURSOR_CONTOUR = 'M0 0 L0 36 L9 28 L15 42 L21 39 L15 26 L27 26 Z'

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
  const contactX = isTouch ? 80 : 68
  const contactY = isTouch ? 62 : 52

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
            r="2"
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
          <g transform={isTouch ? 'translate(0 -7)' : 'translate(0 -6)'}>
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
