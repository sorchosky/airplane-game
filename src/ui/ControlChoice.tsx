import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { type } from '../styles/tokens'
import type { ControlMode } from '../app/controlModeStore'
import { copy } from './copy'
import { MotionGlyph, MouseGlyph, TouchGlyph } from './controlGlyphs'

/** What later beat tickets animate as shared elements (#159, #160). */
export interface ControlChoiceHandle {
  frame: (mode: ControlMode) => HTMLButtonElement | null
  /** The four corner marks of a frame, top-left, top-right, bottom-left, bottom-right. */
  corners: (mode: ControlMode) => HTMLElement[]
  motionGlyph: () => SVGSVGElement | null
}

interface ControlChoiceProps {
  /** The second option: Touch on touch devices, Mouse elsewhere. */
  secondMode: Exclude<ControlMode, 'camera'>
  onChoose: (mode: ControlMode) => void
  handleRef?: Ref<ControlChoiceHandle>
}

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const

/**
 * The control choice (#154): a tracked uppercase header over two viewfinder frames, each a button
 * with only four corner marks, a hairline glyph and a label. Motion is focused by default and the
 * arrow keys move focus; Enter or Space chooses. Focus is the corner marks turning `accent` and
 * sliding inward, with no fill, glow or outline ring (`controlSelect.css`).
 */
export function ControlChoice({ secondMode, onChoose, handleRef }: ControlChoiceProps) {
  const modes: ControlMode[] = ['camera', secondMode]
  const frames = useRef<Array<HTMLButtonElement | null>>([])
  const motionGlyph = useRef<SVGSVGElement | null>(null)

  useImperativeHandle(handleRef, () => ({
    frame: (mode) => frames.current[modes.indexOf(mode)] ?? null,
    corners: (mode) =>
      Array.from(
        frames.current[modes.indexOf(mode)]?.querySelectorAll<HTMLElement>('.control-corner') ?? [],
      ),
    motionGlyph: () => motionGlyph.current,
  }))

  useEffect(() => {
    frames.current[0]?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="control-choice">
      <h1
        className="control-title"
        style={{
          fontFamily: type.fontDisplay,
          fontSize: type.tvTitle,
          fontWeight: type.weightDisplay,
        }}
      >
        {copy.controlSelect.title}
      </h1>
      <div className="control-frames">
        {modes.map((mode, index) => (
          <button
            key={mode}
            ref={(button) => {
              frames.current[index] = button
            }}
            type="button"
            className="control-frame"
            data-mode={mode}
            onClick={() => onChoose(mode)}
            onKeyDown={(event) => {
              if (event.key.startsWith('Arrow')) {
                event.preventDefault()
                const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
                const next = (index + step + modes.length) % modes.length
                frames.current[next]?.focus()
              }
            }}
          >
            {CORNERS.map((corner) => (
              <span
                key={corner}
                className="control-corner"
                data-corner={corner}
                aria-hidden="true"
              />
            ))}
            <span className="control-glyph-box">
              {mode === 'camera' ? (
                <MotionGlyph svgRef={motionGlyph} />
              ) : mode === 'touch' ? (
                <TouchGlyph />
              ) : (
                <MouseGlyph />
              )}
            </span>
            <span className="control-label">{copy.controlSelect[mode]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
