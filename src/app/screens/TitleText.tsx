import { type CSSProperties, type ReactNode, type Ref } from 'react'
import { color, effect, radius, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { SHARED_ELEMENT_ATTR, SHARED_ELEMENTS } from '../../ui/sharedElement'

// The title's text layers, used by `TitleScreen` and moved by the Start → Choose timeline.

/** Start's touch target (the 64 px floor for a phone held at arm's length). */
const START_HEIGHT = space.xxxl
/** The masthead's left inset: the TV margin, or the notch's safe area when that is larger. */
const MASTHEAD_INSET = `max(${space.xxxl}, env(safe-area-inset-left))`

/**
 * The masthead column in the left third, upper half, over sky: wordmark, rule and Start, top to
 * bottom and left-aligned, `space.lg` apart. The column is as wide as the wordmark, which is what
 * the rule spans.
 */
export function Masthead({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: MASTHEAD_INSET,
        transform: 'translateY(calc(-50% - 4vh))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        width: 'max-content',
        gap: space.lg,
      }}
    >
      {children}
    </div>
  )
}

/** The hairline under the wordmark, drawn from its left end by the intro and faded out by Start. */
export function MastheadRule({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      {...{ [SHARED_ELEMENT_ATTR]: SHARED_ELEMENTS.rule }}
      style={{
        height: 1,
        background: color.line,
        transformOrigin: '0 50%',
      }}
    />
  )
}

const startStyle: CSSProperties = {
  minHeight: START_HEIGHT,
  padding: `${space.md} ${space.xl}`,
  borderRadius: radius.sharp,
  border: `2px solid ${color.titleStartBorder}`,
  background: 'transparent',
  color: color.titleText,
  fontFamily: type.fontBody,
  fontWeight: type.weightStart,
  fontSize: type.tvBody,
  lineHeight: 1,
  letterSpacing: type.trackingStart,
  textTransform: 'uppercase',
  textShadow: effect.titleTextShadow,
  boxShadow: effect.titleOutlineShadow,
}

interface StartButtonProps {
  onClick?: () => void
  ref?: Ref<HTMLButtonElement>
}

export function StartButton({ onClick, ref }: StartButtonProps) {
  // Letter-spacing also trails the last letter; pull it back so the label centers.
  const label = (
    <span style={{ marginRight: `calc(-1 * ${type.trackingStart})` }}>{copy.title.start}</span>
  )
  return (
    <button ref={ref} type="button" onClick={onClick} style={{ ...startStyle, cursor: 'pointer' }}>
      {label}
    </button>
  )
}

/** Start sits at the column's left edge at its natural width, not stretched to the rule. */
export function StartSlot({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      {...{ [SHARED_ELEMENT_ATTR]: SHARED_ELEMENTS.start }}
      style={{ alignSelf: 'flex-start' }}
    >
      {children}
    </div>
  )
}

/**
 * A local vignette centred on the masthead. Its soft radial falloff supplies contrast without a
 * box edge and clears the aircraft on the right.
 */
export function TitleScrim() {
  return (
    <div
      aria-hidden="true"
      {...{ [SHARED_ELEMENT_ATTR]: SHARED_ELEMENTS.scrim }}
      style={{
        position: 'absolute',
        inset: 0,
        background: effect.titleVignette,
        pointerEvents: 'none',
      }}
    />
  )
}

/**
 * The Driftwing wordmark, a shared element (`SHARED_ELEMENTS.wordmark`): the Choose beat shrinks
 * this node into the running head. Josefin at the display size, uppercase, with a soft glow.
 */
export function TitleWordmark({ ref }: { ref?: Ref<HTMLHeadingElement> }) {
  return (
    <h1
      ref={ref}
      {...{ [SHARED_ELEMENT_ATTR]: SHARED_ELEMENTS.wordmark }}
      style={{
        margin: 0,
        // Letter-spacing also trails the last letter; pull it back so the rule ends at the "G".
        marginRight: `calc(-1 * ${type.trackingDisplay})`,
        fontFamily: type.fontDisplay,
        fontWeight: type.weightHero,
        fontSize: type.tvDisplay,
        lineHeight: 1,
        letterSpacing: type.trackingDisplay,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        textShadow: effect.titleTextShadow,
      }}
    >
      {copy.title.name}
    </h1>
  )
}

/**
 * Where the wordmark ends up in the Choose beat (#159): a running head at the top left, inset by
 * the safe area, set at `tv-caption` in the wordmark's own face and tracking. It draws nothing
 * itself. The stage measures it as the shared-element move's last rect, and it sits where the
 * masthead's column starts, so the wordmark glides straight up to it.
 */
export function RunningHeadTarget({ ref }: { ref?: Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: `max(${space.lg}, env(safe-area-inset-top))`,
        left: MASTHEAD_INSET,
        visibility: 'hidden',
        fontFamily: type.fontDisplay,
        fontWeight: type.weightHero,
        fontSize: type.tvCaption,
        lineHeight: 1,
        letterSpacing: type.trackingDisplay,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {copy.title.name}
    </span>
  )
}
