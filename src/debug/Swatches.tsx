import { color, lighting, space, toonRamp, type } from '../styles/tokens'

const COLOR_ROWS: Array<{ label: string; token: string; value: string }> = [
  { label: 'sky-zenith', token: 'skyZenith', value: color.skyZenith },
  { label: 'sky-horizon', token: 'skyHorizon', value: color.skyHorizon },
  { label: 'fog', token: 'fog', value: color.fog },
  { label: 'sun', token: 'sun', value: color.sun },
  { label: 'grass-light', token: 'grassLight', value: color.grassLight },
  { label: 'grass-shadow', token: 'grassShadow', value: color.grassShadow },
  { label: 'rock', token: 'rock', value: color.rock },
  { label: 'snow', token: 'snow', value: color.snow },
  { label: 'water-shallow', token: 'waterShallow', value: color.waterShallow },
  { label: 'water-deep', token: 'waterDeep', value: color.waterDeep },
  { label: 'foliage', token: 'foliage', value: color.foliage },
  { label: 'outline', token: 'outline', value: color.outline },
  { label: 'plane-body', token: 'planeBody', value: color.planeBody },
  { label: 'plane-stripe', token: 'planeStripe', value: color.planeStripe },
  { label: 'plane-metal', token: 'planeMetal', value: color.planeMetal },
  { label: 'control-active', token: 'controlActive', value: color.controlActive },
  { label: 'control-inactive', token: 'controlInactive', value: color.controlInactive },
  { label: 'surface-hud', token: 'surfaceHud', value: color.surfaceHud },
  { label: 'text-primary', token: 'textPrimary', value: color.textPrimary },
  { label: 'text-muted', token: 'textMuted', value: color.textMuted },
  { label: 'accent', token: 'accent', value: color.accent },
]

// `tv-display` is the only size that gets the uppercase/wide-tracking main-title
// treatment — it's reserved for the logo. `tv-title` uses the display font only for
// section headers (see `Section` below); most `tv-title` usage in the app is buttons,
// which use the body font, so that's what's demonstrated here.
const TYPE_ROWS: Array<{
  label: string
  token: string
  size: string
  font: string
  mainTitle?: boolean
}> = [
  {
    label: 'tv-display',
    token: 'tvDisplay',
    size: type.tvDisplay,
    font: type.fontDisplay,
    mainTitle: true,
  },
  { label: 'tv-title', token: 'tvTitle', size: type.tvTitle, font: type.fontBody },
  { label: 'tv-body', token: 'tvBody', size: type.tvBody, font: type.fontBody },
  { label: 'tv-caption', token: 'tvCaption', size: type.tvCaption, font: type.fontBody },
]

function Swatch({ label, token, value }: { label: string; token: string; value: string }) {
  // The label sits on the fixed dark `surfaceHud` panel below the swatch, never on the swatch
  // color itself, so it always uses the light UI text color regardless of how light or dark the
  // swatch is.
  return (
    <div
      style={{ borderRadius: space.xs, overflow: 'hidden', border: `1px solid ${color.outline}` }}
    >
      <div style={{ height: 64, background: value }} />
      <div style={{ padding: space.sm, background: color.surfaceHud, color: color.textPrimary }}>
        <div style={{ fontFamily: type.fontBody, fontWeight: type.weightButton }}>{label}</div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', opacity: 0.85 }}>
          color.{token}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', opacity: 0.85 }}>{value}</div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: space.xxl }}>
      <h2
        style={{
          fontFamily: type.fontDisplay,
          fontWeight: type.weightDisplay,
          fontSize: type.tvTitle,
          margin: `0 0 ${space.md} 0`,
          color: color.textPrimary,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * `?swatches` dev route: renders every design token for owner review before
 * #20 merges. Not part of the game's own screen flow (see App.tsx).
 *
 * Content sits on a surface-hud sheet over the sky gradient rather than
 * directly on it: text-primary only clears WCAG AA near the top of the
 * gradient (skyZenith), not toward skyHorizon (see the contrast table in
 * docs/art-direction.md) — the same reason TitleScreen puts its title on a
 * plate instead of the open sky.
 */
export function Swatches() {
  return (
    <div
      style={{
        minHeight: '100%',
        padding: space.xl,
        background: `linear-gradient(180deg, ${color.skyZenith}, ${color.skyHorizon})`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: space.xl,
          borderRadius: space.md,
          background: color.surfaceHud,
          color: color.textPrimary,
          fontFamily: type.fontBody,
        }}
      >
        <h1
          style={{
            fontFamily: type.fontDisplay,
            fontWeight: type.weightDisplay,
            fontSize: type.tvDisplay,
            textTransform: 'uppercase',
            letterSpacing: type.trackingDisplay,
            margin: `0 0 ${space.xl} 0`,
          }}
        >
          Design tokens
        </h1>

        <Section title="Colors">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: space.md,
            }}
          >
            {COLOR_ROWS.map((row) => (
              <Swatch key={row.token} {...row} />
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
            {TYPE_ROWS.map((row) => (
              <div key={row.token}>
                <div
                  style={{
                    fontFamily: row.font,
                    fontSize: row.size,
                    lineHeight: 1.1,
                    textTransform: row.mainTitle ? 'uppercase' : 'none',
                    letterSpacing: row.mainTitle ? type.trackingDisplay : 'normal',
                  }}
                >
                  Fly like the wind
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', opacity: 0.75 }}>
                  type.{row.token} · {row.size} · {row.font}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Toon ramp">
          <p style={{ fontSize: type.tvCaption, maxWidth: '60ch' }}>
            {toonRamp.steps} bands, thresholds at{' '}
            {toonRamp.thresholds.map((t) => t.toFixed(2)).join(' and ')} (N·L), edge softness{' '}
            {toonRamp.edgeSoftness}.
          </p>
          <div style={{ display: 'flex', height: 48, borderRadius: space.xs, overflow: 'hidden' }}>
            <div style={{ flex: toonRamp.thresholds[0], background: color.grassShadow }} />
            <div
              style={{
                flex: toonRamp.thresholds[1] - toonRamp.thresholds[0],
                background: color.foliage,
              }}
            />
            <div style={{ flex: 1 - toonRamp.thresholds[1], background: color.grassLight }} />
          </div>
        </Section>

        <Section title="Lighting">
          <p style={{ fontSize: type.tvCaption }}>
            Sun direction [{lighting.sunDirection.join(', ')}] · rim strength {lighting.rimStrength}
          </p>
        </Section>

        <Section title="Gesture control state">
          <div style={{ display: 'flex', gap: space.md }}>
            <Swatch label="control-active" token="controlActive" value={color.controlActive} />
            <Swatch
              label="control-inactive"
              token="controlInactive"
              value={color.controlInactive}
            />
          </div>
        </Section>
      </div>
    </div>
  )
}
