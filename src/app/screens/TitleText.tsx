import { type CSSProperties, type ReactNode, type Ref } from 'react'
import { color, radius, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { PoseDemoFigure } from '../../ui/PoseDemoFigure'

// The title's text layers, shared by `TitleScreen` and the Start hand-off (`TitleHandoff`), which
// lifts a copy of them away over the next screen.

/** The wordmark's shadow sits this far below it (Figma: 8 px at 48 px type). */
const HERO_SHADOW_OFFSET = '0.1667em'
/** Figma: the shadow is `title-text-shadow` at 20%. */
const HERO_SHADOW_OPACITY = 0.2
/** Start's touch target (the 64 px floor for a phone held at arm's length). */
const START_HEIGHT = space.xxxl
/** How far the scrim feathers out above and below the text it sits behind. */
const SCRIM_FEATHER = space.xxxl
/** The glow around the wordmark and Start's label: a soft halo, no offset. */
const TEXT_GLOW = `0 0 0.4em ${color.titleGlow}`

/** The wordmark row: dead center (frame 07), rather than centered as a group with Start. */
export function WordmarkRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
      {children}
    </div>
  )
}

/**
 * Start hangs below the centered wordmark, with the tagline and pose demonstration (#63) below it.
 * The ref lets the intro settle the whole group in together.
 */
export function StartRow({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: space.lg,
        paddingTop: `calc(${type.tvHero} / 2 + ${space.lg})`,
      }}
    >
      {children}
    </div>
  )
}

/** The one-line tagline beside the looping pose demonstration (#63), under Start. */
export function StartTagline({ decorative = false }: { decorative?: boolean }) {
  return (
    <div
      aria-hidden={decorative || undefined}
      style={{ display: 'flex', alignItems: 'center', gap: space.md }}
    >
      <PoseDemoFigure />
      <p
        style={{
          margin: 0,
          fontFamily: type.fontBody,
          fontSize: type.tvBody,
          whiteSpace: 'nowrap',
          textShadow: TEXT_GLOW,
        }}
      >
        {copy.title.tagline}
      </p>
    </div>
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
  textShadow: TEXT_GLOW,
}

interface StartButtonProps {
  onClick?: () => void
  /** A look-alike for the hand-off: not a button, hidden from assistive tech. */
  decorative?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function StartButton({ onClick, decorative = false, ref }: StartButtonProps) {
  // Letter-spacing also trails the last letter; pull it back so the label centers.
  const label = (
    <span style={{ marginRight: `calc(-1 * ${type.trackingStart})` }}>{copy.title.start}</span>
  )
  if (decorative) {
    return (
      <div aria-hidden="true" style={startStyle}>
        {label}
      </div>
    )
  }
  return (
    <button ref={ref} type="button" onClick={onClick} style={{ ...startStyle, cursor: 'pointer' }}>
      {label}
    </button>
  )
}

/**
 * A feathered band of `titleScrim` across the wordmark and Start: the contrast assist that keeps
 * them at AA over the sky without a plate. Full strength exactly behind the text, fading out over
 * `SCRIM_FEATHER` above and below.
 */
export function TitleScrim() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `calc(50% - ${type.tvHero} / 2 - ${SCRIM_FEATHER})`,
        height: `calc(${type.tvHero} + ${space.lg} + ${START_HEIGHT} + 2 * ${SCRIM_FEATHER})`,
        background: `linear-gradient(180deg, transparent 0, ${color.titleScrim} ${SCRIM_FEATHER}, ${color.titleScrim} calc(100% - ${SCRIM_FEATHER}), transparent 100%)`,
        pointerEvents: 'none',
      }}
    />
  )
}

/** The Driftwing wordmark: the text over its offset Figma shadow, with a soft glow. */
export function TitleWordmark({ decorative = false }: { decorative?: boolean }) {
  return (
    <h1
      aria-hidden={decorative || undefined}
      style={{
        display: 'grid',
        margin: 0,
        fontFamily: type.fontDisplay,
        fontWeight: type.weightHero,
        fontSize: type.tvHero,
        lineHeight: 1,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          ...heroLayer(type.trackingHeroShadow),
          color: color.titleTextShadow,
          opacity: HERO_SHADOW_OPACITY,
          transform: `translateY(${HERO_SHADOW_OFFSET})`,
        }}
      >
        {copy.title.name}
      </span>
      <span style={{ ...heroLayer(type.trackingHero), textShadow: TEXT_GLOW }}>
        {copy.title.name}
      </span>
    </h1>
  )
}

/** One of the wordmark's two stacked layers (the text and its shadow share a grid cell). */
function heroLayer(tracking: string): CSSProperties {
  return {
    gridArea: '1 / 1',
    justifySelf: 'center',
    letterSpacing: tracking,
    // Letter-spacing also trails the last letter; indent by the same amount so the word centers.
    paddingLeft: tracking,
  }
}
