# Art direction

Visual target: *The Legend of Zelda: Breath of the Wild*. Every M3+ ticket pulls
colors, type and lighting constants from `src/styles/tokens.ts` / `tokens.css`
so the look stays consistent across the scene and the UI. Review all tokens
live at `?swatches`.

## Principles

- **Read at a glance on a TV.** The player is ~2-3 m from the screen with
  their arms out, not leaning in to squint. Silhouettes, colors and text all
  have to work from a couch.
- **Silhouette first.** Shapes (plane, terrain, landmarks) should be
  identifiable from their outline alone before detail or color is added —
  outlines exist to serve that, not to decorate.
- **Soft, not neon.** BotW's palette is painterly and slightly desaturated.
  Warm greens and yellows land as inviting grassland, not toxic-slime green;
  the Sheikah-cyan accent is a deliberate exception — one saturated color
  reserved for gesture feedback and interactive UI so it stays meaningful.

## Palette

All values live in `src/styles/tokens.ts` (`color`) and `src/styles/tokens.css`
(`--color-*`), generated from the same source and kept in sync by
`tokens.test.ts`.

| Token | Value | Role |
|---|---|---|
| `sky-zenith` | `#3d76ad` | Top of the sky gradient |
| `sky-horizon` | `#cfe8ee` | Bottom of the sky gradient, hazy blue-teal |
| `fog` | `#b7d6da` | Distance fog / atmospheric perspective fade |
| `sun` | `#ffd873` | Sun disc and warm key-light tint |
| `grass-light` | `#a8c34d` | Grassland, lit face |
| `grass-shadow` | `#4f6b2c` | Grassland, shadow face |
| `rock` | `#8d8577` | Cliffs and mountains |
| `snow` | `#f4f8fb` | Snowcaps |
| `water-shallow` | `#6fd1c8` | Water, shallow/lit |
| `water-deep` | `#1f5c73` | Water, deep/shadow |
| `foliage` | `#3f6e3b` | Trees and bushes |
| `outline` | `#20241f` | Cel-shading linework (soft near-black, not pure black) |
| `plane-body` | `#f2e9d8` | Plane fuselage, cream |
| `plane-stripe` | `#d9552c` | Plane accent stripe, warm red-orange |
| `plane-metal` | `#9aa0a6` | Plane prop/struts, muted silver |
| `control-active` | `#3fd6e6` | Gesture control engaged (arms-out gate) |
| `control-inactive` | `#5b6570` | Gesture control disengaged / autopilot |
| `surface-hud` | `rgba(13, 20, 33, 0.78)` | Translucent dark HUD panel background |
| `text-primary` | `#f5f3ec` | Primary UI text (on `surface-hud` or the sky) |
| `text-muted` | `#b9c2ca` | Secondary/de-emphasized UI text |
| `accent` | `#3fd6e6` | Sheikah-cyan: buttons, focus, active state |

### Plane livery

Cream body (`plane-body`) with a warm red-orange stripe (`plane-stripe`) along
the fuselage — an adventurous bush-plane look rather than a corporate livery.
**Alternatives for the owner to consider:** a two-tone cream/forest-green
(more "ranger plane"), or swapping the stripe for `sun` yellow-gold (brighter,
reads better at distance but less contrast against `grass-light` terrain).
Cream + red-orange was chosen as the default because it reads clearly against
both sky and grass, and the stripe color doubles as a warm accent that doesn't
compete with the cyan UI accent.

## Lighting model

- **Toon ramp:** 3 flat lighting bands (shadow / mid / highlight), split by
  two N·L thresholds at `0.25` and `0.6` (`toonRamp.thresholds`), with a small
  `0.04` smoothstep at each edge so the band boundary anti-aliases instead of
  jaggies. Defined in `tokens.ts` as `toonRamp`; #21 wires it into the
  material shader.
- **Sun direction:** low and warm, from over the player's left shoulder —
  `lighting.sunDirection = [0.35, 0.82, 0.45]` (world-space, #22 normalizes
  and can animate it for a day/dusk mood later).
- **Rim light:** a soft cool-toned rim (`lighting.rimStrength = 0.35`) on the
  shadow side of geometry, to separate foreground silhouettes from the
  background without relying on outlines alone.

## Outline rules

- Outlines use `outline` (`#20241f`), never pure black — keeps the linework
  soft and consistent with a painterly, not comic-ink, look.
- Outline weight scales with screen-space size so distant geometry doesn't
  turn into a solid dark smudge (#21 owns the exact falloff curve).
- No outlines on particles, water surface ripples, or the sky — only on solid
  terrain, foliage, landmarks and the plane.

## Fog and atmosphere

- Distance fog uses `fog` (`#b7d6da`), blended in gradually starting well
  before the terrain draw distance so the horizon fades to haze rather than
  popping.
- Fog density and the sky gradient (`sky-zenith` → `sky-horizon`) are picked
  to meet at a similar hue at the horizon line, so distant terrain dissolves
  into the sky instead of silhouetting against a mismatched color.

## UI style

- **Type:** display headings use `Cinzel` (`type.fontDisplay`), a thin serif
  that reads as adventurous/legendary without being a licensed-font
  lookalike. Body and HUD text use `Inter` (`type.fontBody`), a highly
  legible humanist sans at TV viewing distance. Both are Google Fonts, SIL
  Open Font License 1.1 (free for commercial use, no attribution required),
  loaded via the Google Fonts CSS API in `tokens.css`.
- **Type scale:** `tv-display` / `tv-title` / `tv-body` / `tv-caption`, all
  `clamp()`-sized so they scale with viewport but never shrink past a legible
  floor. `tv-body` (`clamp(1.5rem, 2.4vw, 2rem)`) is the minimum size for any
  body text — the 24px floor follows the common "10-foot UI" console
  guideline for text legible at ~3 m on a 1080p+ TV.
- **Surfaces:** HUD chrome sits on `surface-hud`, a translucent dark panel,
  never a solid color — it should feel like it's floating over the world, not
  blocking it.
- **Accent:** `accent` (Sheikah-cyan) is reserved for interactive elements —
  button borders, focus states, the active-control indicator. Buttons are a
  `surface-hud` panel with a 2px `accent` border and `text-primary` label
  (a Sheikah Slate-style outlined button), not a solid cyan fill, so the
  accent stays a highlight rather than competing with terrain colors.
- **Spacing:** 8pt grid (`space.*`), generous — BotW's UI has a lot of empty
  space around text, which also helps 10-foot legibility.

### Contrast

`text-primary` and `text-muted` on `surface-hud`, checked against the
brightest terrain color likely to sit behind a translucent HUD panel
(`snow`, composited at `surface-hud`'s 0.78 alpha — the realistic worst case;
any other backdrop only improves the ratio):

| Pair | Ratio | WCAG AA (4.5:1) |
|---|---|---|
| `text-primary` on `surface-hud` (over `snow`) | 8.55:1 | Pass |
| `text-muted` on `surface-hud` (over `snow`) | 5.26:1 | Pass |
| `accent` label on `surface-hud` button (over `snow`) | 5.41:1 | Pass |

Enforced by `tokens.test.ts` so a future palette change can't silently drop
below AA. Full contrast math and the alpha-compositing assumption are in that
test file.

## Do / don't

**Do**

- Use semantic token names (`grass-light`, `outline`, `surface-hud`) in code,
  never a raw hex value or a hue name.
- Keep saturated color reserved for `accent` and gesture-control feedback.
- Let distant geometry fade toward `fog` — atmospheric perspective is doing a
  lot of the "depth" work in a low-poly scene.
- Keep HUD panels translucent and out of the way of the horizon line.

**Don't**

- Don't add pure black or pure white anywhere except `outline`-adjacent
  linework and `snow` highlights — everything else should read as tinted.
- Don't introduce a new saturated color without a decision entry; it competes
  with the cyan accent for the player's attention.
- Don't shrink `tv-body` below its current floor — it's already at the
  legibility limit for the couch/TV setup this game is built for.
- Don't put body text directly on the sky gradient or raw terrain colors;
  route it through `surface-hud` or another token that's been contrast
  checked.

## `?swatches`

`src/debug/Swatches.tsx`, rendered when the URL has a `swatches` query flag
(e.g. `/?swatches`), lays out every color token as a labeled tile, the type
ramp at each size, and the toon ramp thresholds, for the owner to review
before this PR merges.
