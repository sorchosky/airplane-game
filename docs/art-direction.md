# Art direction

Visual target: *The Legend of Zelda: Breath of the Wild*, at golden hour — a
warm, low-contrast sunset rather than a bright midday palette. Every M3+
ticket pulls colors, type and lighting constants from
`src/styles/tokens.ts` / `tokens.css` so the look stays consistent across the
scene and the UI. Review all tokens live at `?swatches`.

## Principles

- **Read at a glance on a TV.** The player is ~2-3 m from the screen with
  their arms out, not leaning in to squint. Silhouettes, colors and text all
  have to work from a couch.
- **Silhouette first.** Shapes (plane, terrain, landmarks) should be
  identifiable from their outline alone before detail or color is added —
  outlines exist to serve that, not to decorate.
- **Warm, soft, low-contrast — not cartoony.** The palette is a muted sunset:
  dusty golds, terracotta and warm teal, closer together in value than a
  bright noon scene. Nothing should read as a saturated primary color except
  `accent`, and even that's a muted teal-cyan rather than a neon one — one
  deliberately distinct color reserved for gesture feedback and interactive
  UI so it stays meaningful instead of clashing with the environment art.

## Palette

All values live in `src/styles/tokens.ts` (`color`) and `src/styles/tokens.css`
(`--color-*`), generated from the same source and kept in sync by
`tokens.test.ts`.

| Token | Value | Role |
|---|---|---|
| `sky-zenith` | `#5c5b74` | Top of the sky gradient, dusky blue-violet |
| `sky-horizon` | `#e7a878` | Bottom of the sky gradient, warm peach-orange |
| `fog` | `#e3bd9a` | Distance fog / atmospheric perspective fade, warm haze |
| `sun` | `#f8b968` | Sun disc and warm key-light tint |
| `grass-light` | `#b7a35e` | Grassland, lit face — sun-baked gold-olive |
| `grass-shadow` | `#6d5a3a` | Grassland, shadow face — muted umber |
| `sand` | `#cdb48a` | Beaches and riverbanks at the waterline, pale warm sand |
| `rock` | `#a3907b` | Cliffs and mountains, warm taupe |
| `snow` | `#f6ead9` | Snowcaps, warm cream catching the sunset glow |
| `water-shallow` | `#7fa79c` | Water, shallow/lit — dusty muted teal |
| `water-deep` | `#39525a` | Water, deep/shadow — muted teal-slate |
| `foliage` | `#5f6b41` | Trees and bushes, olive |
| `outline` | `#2a2219` | Cel-shading linework (warm near-black, not pure black) |
| `plane-body` | `#f1e7d4` | Plane fuselage, warm cream |
| `plane-stripe` | `#c2572f` | Plane accent stripe, muted terracotta |
| `plane-metal` | `#a99b89` | Plane prop/struts, warm taupe-metal |
| `plane-glass` | `#3a4248` | Plane cabin window band and tires, dark cool slate |
| `control-active` | `#5cb8bd` | Gesture control engaged (arms-out gate) |
| `control-inactive` | `#8a7c6c` | Gesture control disengaged / autopilot |
| `surface-hud` | `rgba(36, 27, 21, 0.8)` | Translucent warm-dark HUD panel background |
| `surface-scrim` | `#241b15` | Opaque `surface-hud` for full-screen blockers (orientation prompt) |
| `text-primary` | `#f3e8d8` | Primary UI text (on `surface-hud` or the sky) |
| `text-muted` | `#cdbca6` | Secondary/de-emphasized UI text |
| `accent` | `#5cb8bd` | Muted teal-cyan: buttons, focus, active state |

### Plane livery

Warm cream body (`plane-body`) with a muted terracotta stripe (`plane-stripe`)
along the fuselage — an adventurous bush-plane look rather than a corporate
livery, toned to sit inside the sunset palette instead of popping out of it.
**Alternatives for the owner to consider:** a two-tone cream/olive-green (more
"ranger plane", pulls from `foliage`), or swapping the stripe for `sun`
gold-orange (blends further into the sky, less separation from terrain at
distance). Cream + terracotta was kept as the default because it still reads
clearly in silhouette against both the sky and the ground without being as
saturated as the original red-orange.

## Lighting model

- **Toon ramp:** 3 flat lighting bands (shadow / mid / highlight), split by
  two N·L thresholds at `0.3` and `0.65` (`toonRamp.thresholds`), with a
  `0.05` smoothstep at each edge so the band boundary anti-aliases instead of
  jaggies. Thresholds sit a little higher and the edge a little softer than a
  high-contrast comic ramp, keeping the shading gentle. Defined in
  `tokens.ts` as `toonRamp`; #21 wires it into the material shader.
- **Sun direction:** low on the horizon for a golden-hour mood —
  `lighting.sunDirection = [0.85, 0.28, 0.35]` (world-space, mostly
  horizontal with a shallow rise; #22 normalizes and can animate it further
  for a day/dusk cycle later).
- **Rim light:** a soft rim (`lighting.rimStrength = 0.4`) on the shadow side
  of geometry — stronger than a noon scene's, since raking low-angle light is
  doing a lot of the silhouette-separation work at golden hour, on top of the
  outlines.

## Outline rules

- Outlines use `outline` (`#2a2219`), never pure black — keeps the linework
  soft and consistent with a painterly, not comic-ink, look.
- Outline weight scales with screen-space size so distant geometry doesn't
  turn into a solid dark smudge (#21 owns the exact falloff curve).
- No outlines on particles, water surface ripples, or the sky — only on solid
  terrain, foliage, landmarks and the plane.

## Fog and atmosphere

- Distance fog uses `fog` (`#e3bd9a`), blended in gradually starting well
  before the terrain draw distance so the horizon fades to a warm haze rather
  than popping.
- Fog density and the sky gradient (`sky-zenith` → `sky-horizon`) are picked
  to meet at a similar hue at the horizon line, so distant terrain dissolves
  into the sunset sky instead of silhouetting against a mismatched color.

## UI style

- **Type:** BotW's own UI is Helvetica-like everywhere except the logo and
  section headers, so that's the split here too. `Josefin Sans`
  (`type.fontDisplay`) — a geometric sans with 1920s art-deco proportions —
  is reserved for the game's logo/title and section headers. Everything
  else (buttons, body copy, prompts, captions) uses `Work Sans`
  (`type.fontBody`), a plain, highly legible humanist grotesque in the
  Helvetica/Akzidenz-Grotesk family, at TV viewing distance. Both are Google
  Fonts, SIL Open Font License 1.1 (free for commercial use, no attribution
  required), loaded via the Google Fonts CSS API in `tokens.css`.
- **Main title treatment:** the game's title (and nothing else) is set in
  `tv-display`, uppercase, with wide tracking (`type.trackingDisplay =
  0.14em`) — an airy, mid-century poster wordmark rather than a giant fantasy
  logo. The rest of the type ramp leans smaller and tighter than a typical
  "hero game title" scale on purpose, in keeping with that restraint;
  hierarchy comes from the uppercase/tracking treatment and font pairing, not
  from one element being enormous.
- **Type scale:** `tv-display` / `tv-title` / `tv-body` / `tv-caption`, all
  `clamp()`-sized so they scale with viewport but never shrink past a legible
  floor. `tv-body` (`clamp(1.5rem, 2vw, 1.875rem)`) is the minimum size for
  any body text — the 24px floor follows the common "10-foot UI" console
  guideline for text legible at ~3 m on a 1080p+ TV.
- **Surfaces:** HUD chrome sits on `surface-hud`, a translucent warm-dark
  panel, never a solid color — it should feel like it's floating over the
  world, not blocking it.
- **Font pairing:** `Josefin Sans` + `Work Sans` is a well-established real
  pairing (its geometric, slightly art-deco letterforms contrast cleanly with
  a neutral grotesque body face without clashing), not an arbitrary choice —
  the same reasoning that makes it a common recommendation in font-pairing
  guides applies here.
- **Font weights are loaded exactly, not "whatever's default":** `Josefin
  Sans` is used at `type.weightDisplay` (600) and `type.weightHero` (400, the
  title wordmark); `Work Sans` at its browser default (400, for body copy),
  `type.weightButton` (500, for buttons and labels) and `type.weightStart`
  (600, the title screen's Start). `tokens.css`'s Google Fonts import requests
  exactly those weights — no more, no less — and `tokens.test.ts` asserts the
  import URL matches, so a component can't silently request an unloaded
  weight (which would force the browser into synthetic-bold territory) or
  the font file bloat of loading a weight nothing uses.
- **Accent:** `accent` (muted teal-cyan) is reserved for interactive
  elements — button borders, focus states, the active-control indicator.
  Buttons are a `surface-hud` panel with a 2px `accent` border and
  `text-primary` label (an outlined button, not a solid fill), so the accent
  stays a highlight rather than competing with the warm terrain colors.
  **Exception:** `TitleScreen`'s Start button, per specific owner requests
  for this round of testing, has no `surface-hud` fill, no drop shadow, and a
  `text-primary` (not `accent`) border — a plain white-outlined button
  directly on the sky. Its label also breaks from the usual buttons-are-
  `fontBody` rule: it's set in `fontDisplay`, uppercase, with
  `trackingDisplay` — the same airy treatment as the main title, just at
  `tv-title` size instead of `tv-display`. Not yet applied to other screens'
  buttons.
- **Spacing:** 8pt grid (`space.*`), generous — BotW's UI has a lot of empty
  space around text, which also helps 10-foot legibility.

### Contrast

`text-primary`, `text-muted` and an `accent` border on `surface-hud`, checked
against the brightest terrain color likely to sit behind a translucent HUD
panel (`snow`, composited at `surface-hud`'s 0.8 alpha — the realistic worst
case; any other backdrop only improves the ratio):

| Pair | Ratio | WCAG AA |
|---|---|---|
| `text-primary` on `surface-hud` (over `snow`) | 7.83:1 | Pass (4.5:1 text) |
| `text-muted` on `surface-hud` (over `snow`) | 5.12:1 | Pass (4.5:1 text) |
| `accent` border on `surface-hud` (over `snow`) | 4.08:1 | Pass (3:1 UI component) |

Enforced by `tokens.test.ts` so a future palette change can't silently drop
below AA. Full contrast math and the alpha-compositing assumption are in that
test file.

**Known gap: `TitleScreen` contrast is marginal.** The title screen follows the
owner's Figma "Driftwing" storyboard: `title-text` directly on the ported cirrus
sky (`TitleSky`), no plate, no tagline or How to play. At screen center, where
the wordmark sits, the sky is roughly a 70/30 mix of `title-sky-mid` and
`title-sky-top`, which gives `title-text` about 3:1: enough for the wordmark as
large text, marginal for the Start label and its 70% border. Cloud wisps
passing behind lower it further in places.

`?swatches` still uses the `surface-hud` sheet, since none of this applies
there. Revisit before this ships: bring back a plate (even a lighter one),
or accept the gap and note why.

## Do / don't

**Do**

- Use semantic token names (`grass-light`, `outline`, `surface-hud`) in code,
  never a raw hex value or a hue name.
- Keep saturated color reserved for `accent` and gesture-control feedback —
  and keep even that muted, not neon.
- Let distant geometry fade toward `fog` — atmospheric perspective is doing a
  lot of the "depth" work in a low-poly scene.
- Keep HUD panels translucent and out of the way of the horizon line.
- Reserve `Josefin Sans`/uppercase/wide-tracking for the logo and section
  headers; everything else is plain `Work Sans`.

**Don't**

- Don't add pure black or pure white anywhere except `outline`-adjacent
  linework and `snow` highlights — everything else should read as tinted.
- Don't introduce a new saturated color without a decision entry; it competes
  with the accent for the player's attention.
- Don't shrink `tv-body` below its current floor — it's already at the
  legibility limit for the couch/TV setup this game is built for.
- Don't put body text directly on the sky gradient or raw terrain colors;
  route it through `surface-hud` or another token that's been contrast
  checked.
- Don't apply the display font/uppercase/tracking treatment to buttons or
  body text — it's a header-only treatment, matching BotW's own UI.

## `?swatches`

`src/debug/Swatches.tsx`, rendered when the URL has a `swatches` query flag
(e.g. `/?swatches`), lays out every color token as a labeled tile, the type
ramp at each size (including the main-title uppercase/tracking treatment on
`tv-display`), and the toon ramp thresholds, for the owner to review before
this PR merges.
