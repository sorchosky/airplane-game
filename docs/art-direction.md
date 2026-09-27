# Art direction

Visual target: *The Legend of Zelda: Breath of the Wild*, on a clear morning:
green ground, a cerulean sky fading to a pale horizon, cool aerial
perspective and cream clouds, with golden hour kept as a lighting preset
rather than the only look (#64, owner's pick of palette B on #88). The
reasoning, references and the golden path live in `docs/art-bible.md`; this
file is the working reference for the tokens. Every ticket pulls colors, type
and lighting constants from `src/styles/tokens.ts` / `tokens.css` so the look
stays consistent across the scene and the UI. Review all tokens live at
`?swatches`, which shows both lighting presets.

## Principles

- **Read at a glance on a TV.** The player is ~2-3 m from the screen with
  their arms out, not leaning in to squint. Silhouettes, colors and text all
  have to work from a couch.
- **Silhouette first.** Shapes (plane, terrain, landmarks) should be
  identifiable from their outline alone before detail or color is added.
  Outlines exist to serve that, not to decorate.
- **Albedo is not lighting.** Surface colors (`color` in `tokens.ts`) say what
  a thing is. The time of day (`lightingPresets`) says how it is lit. A grass
  token never carries sunset orange; the sun and haze do that.
- **Soft, painterly, not cartoony.** Hues sit near BotW's: sage and olive
  greens, warm grey rock, teal water. Nothing reads as a saturated primary
  except the plane's stripe and `accent`, which is reserved for gesture
  feedback and interactive UI so it stays meaningful.

## Palette

Albedo and UI colors live in `src/styles/tokens.ts` (`color`) and
`src/styles/tokens.css` (`--color-*`), kept in sync by `tokens.test.ts`.

| Token | Value | Role |
|---|---|---|
| `grass-light` | `#93b352` | Grassland, lit face: sage-lime |
| `grass-shadow` | `#567c3b` | Grassland, shadow face: deep olive-green |
| `sand` | `#d9c89c` | Beaches and riverbanks at the waterline |
| `rock` | `#9b9486` | Cliffs and mountains, warm grey |
| `rock-shadow` | `#6e685e` | Steep rock faces and crevices |
| `snow` | `#f5f6f8` | Snowcaps, near-white |
| `water-shallow` | `#6fc0c8` | Water, shallow/lit: bright teal |
| `water-deep` | `#2f6d8c` | Water, deep: blue-teal |
| `foliage` | `#3f7d46` | Tree canopies (read by A3) |
| `foliage-light` | `#6da356` | Lit canopy tops (read by A3) |
| `bark` | `#6b5442` | Trunks (read by A3) |
| `outline` | `#1f2a33` | Cel-shading linework, cool near-black |
| `plane-body` | `#f4efe3` | Plane fuselage, warm white |
| `plane-stripe` | `#d8562b` | Plane stripe, safety orange |
| `plane-trim` | `#d6cfc1` | Wheel pants, a step darker than the body (#71) |
| `plane-metal` | `#857e75` | Prop, struts and gear legs, warm grey metal, darkened in #71 |
| `plane-glass` | `#35414d` | Cabin window band and tires, dark slate, stepped specular highlight (#71) |
| `vapor` | `#eef3f7` | Wingtip vortex ribbons (#71) |
| `control-active` | `#5cb8bd` | Gesture control engaged (arms-out gate) |
| `control-inactive` | `#8a7c6c` | Gesture control disengaged / autopilot |
| `surface-hud` | `rgba(36, 27, 21, 0.8)` | Translucent dark HUD panel background |
| `surface-scrim` | `#241b15` | Opaque `surface-hud` for full-screen blockers |
| `text-primary` | `#f3e8d8` | Primary UI text (on `surface-hud` or the sky) |
| `text-muted` | `#cdbca6` | Secondary UI text |
| `accent` | `#5cb8bd` | Muted teal-cyan: buttons, focus, active state |

The `title-*` tokens belong to the title screen's own shader sky and are
documented with it.

### Lighting presets

`lightingPresets` in `tokens.ts`. `morning` is the default; `?tod=golden`
picks golden hour for the page load. The sky, haze, sun glow, sun disc and
sun light reach every material through shared uniforms
(`src/world/atmosphereUniforms.ts`), so a preset change is one write and no
shader recompile. The day cycle (#92) will blend presets through the same
uniforms.

| Role | `morning` | `goldenHour` | What it drives |
|---|---|---|---|
| `skyZenith` | `#3f7fc4` | `#566a9c` | Top of the sky |
| `skyHorizon` | `#d5e6f0` | `#f3c08f` | Horizon toward the sun (away from it, it leans toward the zenith) |
| `sunGlow` | `#ffe6bd` | `#ffc27a` | Halo around the sun, separate so the sky stays pale |
| `fog` | `#bfd3e2` | `#e8cdb0` | Near haze: cool by day, warm at golden hour |
| `sun` | `#fff2d2` | `#ffd48a` | Key light, rim light, water glints, the post warm lift |
| `ambientSky` | `#8fb4de` | `#8a8fb8` | Hemisphere fill from above (sky-lit shadows) |
| `ambientGround` | `#6b7a52` | `#7a6a4a` | Hemisphere fill from below (grass bounce) |
| `cloudLight` | `#fbfaf5` | `#fff1dc` | Cloud lit side |
| `cloudShadow` | `#b9c3d6` | `#b8a4bd` | Cloud shadow side |
| `sunDirection` | `[0.6, 0.52, 0.49]` (~34°) | `[0.85, 0.28, 0.35]` (~15°) | Direction the sun shines from |
| `sunIntensity` | `2.4` | `2.2` | Directional light |
| `hemisphereIntensity` | `0.9` | `1.0` | Hemisphere light |

### Plane livery

Warm white body (`plane-body`) with a safety-orange stripe (`plane-stripe`)
and a cool dark outline. Against a pale morning horizon the body itself is
close in value to the sky (about 1.1:1), so the plane reads through its
outline and stripe, not its fill: `tokens.test.ts` holds the outline at 3:1
or better against the sky and the grass, and the stripe at 3:1 against the
horizon. The body carries the contrast against the ground and water
(`grass-shadow`, `water-deep`).

## Lighting model

- **Toon ramp:** 3 flat lighting bands (shadow / mid / highlight), split by
  two N·L thresholds at `0.3` and `0.65` (`toonRamp.thresholds`), with a
  `0.05` smoothstep at each edge so the boundary anti-aliases. The bands light
  at `0.62 / 0.86 / 1.0` of the sun (`TOON_BAND_LEVELS` in
  `src/render/toon.ts`): a soft terminator, not comic ink.
- **Sky fill:** the hemisphere light (`ambientSky` over `ambientGround`) adds
  to every band, so shadowed faces pick up the sky's blue instead of going
  grey-brown.
- **Sun:** direction, color and intensity come from the active preset. The
  disc is drawn at 3x in the linear post buffer so bloom (threshold `0.9`)
  catches the sun and water glints, never the pale sky.
- **Rim light:** a soft fresnel rim (`lighting.rimStrength = 0.4`) on the
  plane, tinted with the preset's sun color.

## Outline rules

- Outlines use `outline` (`#1f2a33`), never pure black, so the linework
  reads as ink against both a pale sky and green ground.
- Outline weight scales with screen-space size so distant geometry doesn't
  turn into a solid dark smudge.
- No outlines on particles, water surface ripples, or the sky, only on solid
  terrain, foliage, landmarks and the plane.

## Fog and atmosphere

- The sky and the distance haze share one function (`atmosphereSky` in
  `src/world/atmosphereShader.ts`), so far terrain dissolves into exactly the
  sky color behind it and the 10 km edge never shows.
- Near haze uses the preset's `fog`. By day it is cool and pale, so distance
  reads as blue and desaturated (aerial perspective); at golden hour it turns
  warm.
- The horizon is warm only toward the sun; facing away from it the horizon
  leans toward the zenith color.

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
| `text-primary` on `surface-hud` (over `snow`) | 7.53:1 | Pass (4.5:1 text) |
| `text-muted` on `surface-hud` (over `snow`) | 4.92:1 | Pass (4.5:1 text) |
| `accent` border on `surface-hud` (over `snow`) | 3.93:1 | Pass (3:1 UI component) |

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
