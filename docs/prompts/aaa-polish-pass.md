# AAA polish pass

You are the lead on a small senior strike team working as one person: an art director who shipped open-world cel-shaded games, a gameplay/graphics engineer who owns feel and frame time, and an experience designer who specializes in first-time-user onboarding for unconventional input (Kinect, Wii, VR, camera-based play). Your job is to take Skyborne, a browser flight game in sorchosky/airplane-game, from a competent prototype to a portfolio showstopper that plays and looks like it came out of a AAA studio. Set the bar at "a stranger at a party picks it up with no explanation, is flying and grinning inside 60 seconds, and asks what engine it's built in."

Think hard before you touch code. Audit, plan, then execute in slices you verify. Never trade correctness or frame time for spectacle.

## What the game is

The player props a phone in landscape, front camera on, and mirrors the screen to a TV. They stand ~2 m back with arms outstretched like wings. Tilting the arm line banks the plane, raising or lowering both arms climbs or dives. Stylized Cessna-style high-wing plane, cel-shaded world, target look is The Legend of Zelda: Breath of the Wild.

Stack: Vite, React 19, TypeScript strict, React Three Fiber v9, drei v10, @react-three/postprocessing, Zustand, MediaPipe Pose Landmarker lite (on-device), simplex-noise, Vitest, Playwright. WebGL2 only. Hosted on Vercel with per-PR previews.

## Read first, in this order

1. `CLAUDE.md` (architecture, rules, commands, definition of done)
2. `docs/decisions.md` (settled decisions)
3. `docs/art-direction.md`, `docs/roadmap.md`
4. `src/styles/tokens.ts`, `src/ui/copy.ts`
5. Every file under `src/flight`, `src/pose`, `src/input`, `src/render`, `src/world`, `src/app`, `src/ui`, `src/audio`
6. The screenshots in `docs/screenshots/` so you see the current look before you judge it

Then run the game yourself (`npm run dev`, `?input=keyboard`, `?debug`, `?fx=high`, `?replay=<fixture>`) and capture your own baseline screenshots and a perf trace with Playwright before changing anything.

## Non-negotiables from CLAUDE.md

- The `ControlInput` seam stays. Flight never imports from `pose/`, pose never imports from `flight/`.
- Pure logic stays pure and gets unit tests (flight model, gesture interpreter, filters, calibration, camera math, any new tuning math).
- No React state at frame rate. Per-frame values live in Zustand and are read with `getState()` inside `useFrame`.
- Tokens only for color, type and spacing. 8pt grid. TV type scale, nothing under `tv-body` for body text.
- Hands-free after Start. No screen after Start may require touch.
- Mirrored preview and mirrored gesture space.
- Keyboard input (`?input=keyboard`) must always work in dev.
- `npm run check` passes before every push. No `any`, no disabled lint rules without a reason in a comment.
- WebGL2, not WebGPU.

## Decisions you are allowed to reopen

The owner is explicitly asking for a BotW look and AAA polish, which conflicts with some logged decisions. You may propose superseding these, but only with evidence: a side-by-side screenshot comparison at the same camera positions, a one-paragraph rationale, and a new line in `docs/decisions.md` that says what it supersedes. Label any such PR `review:visual` and put the comparison at the top of the PR body. Do not reopen anything else.

- **Palette.** The current "warm, low-contrast sunset" palette reads as sepia desert, not Hyrule. `grassLight #b7a35e` and `grassShadow #6d5a3a` make every field look like sand. Propose a BotW-faithful palette: saturated but soft greens, blue-shifted aerial perspective, high-key cream-white clouds, a sky that goes cerulean to pale near the horizon, with golden hour kept as one time-of-day preset rather than the only look.
- **No shadows.** At minimum the plane needs a ground contact shadow (projected blob or single low-res shadow map on the plane only). Without it altitude is unreadable and low flying, the most thrilling part of any flight game, has no payoff.
- **One-ticket-per-session workflow.** For this pass you may run several PRs in one session. Each PR must still be one coherent slice, independently reviewable, off current `main`, with its own screenshots and handoff notes.

## Audit findings to start from (verify each, don't take on faith)

### Art
1. Palette is monochrome brown-orange. Terrain, haze and sky collapse into one value range, so nothing reads at TV distance.
2. Terrain is a smooth height-and-slope gradient with no surface breakup. No grass, no foliage (#25 never shipped), no rock strata, no brush texture. With no near-field detail there is no sense of speed.
3. Clouds are flat-shaded Lambert icosahedra that render as grey blobs. BotW clouds are soft, layered, painterly, with bright tops and warm undersides.
4. From the default chase camera the plane reads as a plus sign. The camera sits directly behind with no lead into turns, and the plane occupies little of the frame.
5. No VFX at all: no wingtip vortices, no speed lines, no wind streaks, no water spray or dust on low passes, no birds, no ambient life.
6. The title screen is a CSS gradient with text on it. No live 3D world, no logo mark, no motion. Paused and countdown screens cover the world with an opaque-looking dark scrim. The in-flight camera preview can show as a flat cream box.
7. UI chrome is generic rounded rectangles. BotW's UI language is thin lines, generous negative space, restrained Sheikah-style geometric motifs, subtle glow, and almost no heavy panels.

### Engineering and feel
1. Latency stack is long: 20 Hz pose detection, One Euro filter, bank/pitch springs of 0.35 s and 0.45 s, then 100 to 200 ms of AirPlay/Chromecast mirroring. Nobody has measured end-to-end gesture-to-photon latency.
2. `flightModel.integrate` allocates a `Vector3` and a `Quaternion` per 60 Hz substep, and `cameraMath` clones vectors every frame. That is steady GC pressure on a phone that is also running MediaPipe and screen mirroring.
3. Quality tier is picked once at load. Adaptive quality (#27) was never built. Nobody has profiled on a real phone while casting.
4. Pose inference runs on the main thread via `requestVideoFrameCallback`.
5. Flight is constant airspeed with a gentle pitch nudge. No energy, no boost, no sense of weight in the bank, no camera shake or FOV punch, nothing that rewards skill.
6. Audio is two detuned sawtooth oscillators plus filtered noise. Functional, not premium.

### Experience
1. Onboarding is three lines of text on the title screen. Nothing demonstrates the pose. Nothing lets the player practice before the plane is moving.
2. Calibration guidance is text only. The player at 2 m cannot tell which body part is wrong.
3. During flight the only feedback on what the body is doing is a small corner preview. There is no in-world, glanceable indicator of roll and pitch input or the arms-out gate.
4. The tilt-to-select, hold-to-pick pause menu is novel and never taught.
5. There is nothing to do after the first minute. A portfolio piece needs a short, authored golden path with a destination and a payoff.

## Pillar 1: Art direction (BotW)

Deliver `docs/art-bible.md` before any art code. It must include: a mood board described in words with specific BotW references (Great Plateau at dawn, Hyrule Field, Lanayru, Tabantha), value and saturation targets per layer (sky, far terrain, mid terrain, near terrain, plane, UI), a revised token set, the time-of-day presets you will ship, the shading model, outline rules, VFX language, UI language, and a "does not look like" list.

Then build, in roughly this order, each as its own PR with before and after screenshots at fixed camera bookmarks you define in code (`?shot=<name>`):

1. **Palette and lighting.** New tokens, sky model with a proper zenith to horizon gradient and sun glow, aerial perspective that shifts cool and desaturates with distance, a hemisphere ambient so shadow sides pick up sky color. Keep the seamless-haze trick from `atmosphereShader.ts`.
2. **Terrain surface.** BotW's painterly ground: macro color variation from low-frequency noise, slope-driven rock with horizontal strata, soft brushed breakup in the shader, grass tint that responds to sun direction. No textures required, but you may add small tiling noise textures if they pay for themselves.
3. **Grass and foliage.** Instanced wind-animated grass cards near the plane on low passes, instanced low-poly trees and bushes with toon shading and the outline hull, density falling off by distance and altitude so the budget holds. This is the single biggest sense-of-speed win.
4. **Clouds.** Replace the Lambert blobs with toon-shaded volumetric-looking cumulus (billboard impostors or shaded meshes with a stepped ramp and soft edge), at least two layers, including a few the plane can fly through with a fog-burst effect.
5. **Plane presentation.** Livery that pops against green and blue, a readable 3/4 silhouette, specular hint on the canopy, wingtip vortex trails when banking hard, subtle control-surface motion that reads on a TV. Camera that frames the plane in the lower-center third with lead into turns so it never looks like a plus sign.
6. **Landmarks.** A handful of authored silhouettes visible from far away (a tower, a stone arch, a waterfall, a lone giant tree, ruins) so the world has places, not just terrain. BotW's rule: always something interesting on the horizon.
7. **Post and grade.** Tune bloom, add a subtle painterly grade, light god rays toward the sun on `high`, keep `medium` and `low` tiers honest.
8. **UI reskin.** Title screen over a live, slowly orbiting 3D scene with a proper wordmark. Thin-line BotW-style chrome. Countdown and pause over a blurred or desaturated world rather than a dark slab. Fix the title-screen contrast gap noted in `art-direction.md` without adding a heavy plate.

## Pillar 2: Engineering (feel and performance)

### Budgets, measured not guessed
- 60 fps sustained on an iPhone 13-class device while running pose detection and screen mirroring, on the `medium` tier. p95 frame time under 16.7 ms, p99 under 20 ms.
- 120 fps capable on desktop `high`.
- Zero per-frame heap allocations in the hot path (flight step, camera, clouds, plane rig, pose source). Prove it with a Chrome performance trace or a Vitest allocation check.
- Draw calls and triangles per tier documented in `docs/perf.md`, with the numbers from `?debug`.
- Gesture-to-visible-bank latency measured and documented, excluding mirroring. Target under 120 ms on phone.

### Work
1. Build an in-app latency probe: timestamp the camera frame, the pose result, the `ControlInput` write, and the frame that first shows the bank change. Surface it in `?debug`.
2. Shorten the latency stack. Tune the One Euro filter against recorded fixtures, consider short linear prediction on roll and pitch between pose samples, and retune the bank/pitch springs so the plane feels responsive but weighty. Every constant change gets a decisions line with the measured before and after.
3. Try moving MediaPipe to a Web Worker with `OffscreenCanvas` or `ImageBitmap` transfer. Keep it only if the trace shows it helps on a phone. Keep a main-thread fallback.
4. Kill hot-path allocations with scratch objects. Keep the pure functions pure by passing out-parameters, and keep their tests passing.
5. Ship adaptive quality (#27): frame-time governor with hysteresis that steps DPR, post tier, foliage density and view distance. No visible popping when it switches.
6. Flight feel. Keep the arcade model and "no crash death". Add weight: slight roll-to-yaw lag, a small speed gain in dives that you can carry into climbs, a gentle boost when both arms sweep back (only if it tests well with the gesture gate and does not cause false triggers), camera shake and FOV punch at speed, a low-altitude speed-and-sound rush, and a satisfying soft-floor pull-up with a spray or dust burst instead of an invisible wall. Everything tunable in one params object with unit tests.
7. Audio. Layered engine with RPM tied to speed and pitch, wind that rises with speed and bank, doppler whoosh past landmarks and through clouds, a small ambient music bed with stems that swell on low passes. Respect the existing mute and bus structure.
8. Robustness. Handle camera loss, tab hide, thermal throttling and model load failure with graceful, on-brand states. Nothing ever shows a raw error or a frozen frame.

## Pillar 3: Experience (welcoming for a first-time player)

Design principle: show, don't tell. The player is 2 m away with no controller. Every instruction must be understandable from a couch in under 3 seconds, with an icon or animation doing most of the work and at most one short line of copy.

1. **Title to flight in under 60 seconds** for a first-timer, measured by walking through it with a stopwatch and the recorded fixtures.
2. **Pose demonstration.** An animated silhouette (or the plane itself, mirrored) that shows each gesture before asking for it. The player sees what "tilt" and "raise arms" look like, not just reads them.
3. **Calibration you can see.** Draw the detected skeleton over the mirrored preview in the token accent, highlight the specific limb that fails the gate, show a target silhouette to match, and celebrate the lock-in with a sound and a flourish.
4. **Practice before speed.** A short "wings" moment after calibration: the plane is on screen, hovering or gliding slowly, and responds to the player's arms while three quick prompts teach bank left, bank right, climb and dive. Each completes on success with a satisfying tick. The player is flying for real before they know the tutorial ended.
5. **In-flight input readout.** A minimal, BotW-style glanceable indicator (for example a thin horizon line with two wing marks) that shows current roll and pitch input and whether the gate is engaged. It fades out after the player has flown steadily for a while and fades back when input gets erratic or drops.
6. **Teach the pause.** First time the arms drop, show the "hold to pause" affordance with a progress ring. First time the pause menu opens, animate the tilt-to-select and hold-to-pick gesture once.
7. **Golden path.** A 3 to 5 minute authored first flight: fly through a few wind rings or follow birds toward a landmark, with a reveal moment (breaking through clouds onto a valley, a waterfall, a sunrise). End with a gentle title card and the option to free-fly. Keep "no crash death".
8. **Accessibility.** Reduced motion, a seated mode (arms only, larger deadzone), a left or right handed tolerance, high-contrast HUD option, captions for audio cues. WCAG AA on every text element, including the title screen.
9. **Copy.** All strings stay in `src/ui/copy.ts`. Short, second person, warm, a little adventurous, zero jargon.

## Process

1. **Audit PR first.** Branch `claude/aaa-audit`. Commit `docs/art-bible.md`, `docs/perf.md` with baseline measurements, `docs/experience.md` with the first-run flow as a storyboard, and a prioritized backlog. File GitHub issues for each slice under a new epic, sized per `docs/roadmap.md`, with dependencies. Stop and ask for owner sign-off on the art bible and palette before building art.
2. **Then execute** in this order unless the audit says otherwise: engineering foundations (latency probe, allocations, adaptive quality) → palette and lighting → terrain and foliage → camera and flight feel → onboarding and practice → clouds, VFX, landmarks → audio → UI reskin → golden path → final polish.
3. **Every PR** follows `.github/pull_request_template.md`, closes its issue, includes before and after screenshots from the `?shot=` bookmarks, perf numbers from `?debug` on `medium` and `high`, verification steps, and handoff notes. Run `npm run check` and the relevant Playwright specs before each push. Use `/opt/pw-browsers/chromium` if Playwright versions mismatch, never `playwright install`.
4. **Decisions.** Any lasting choice gets one line in `docs/decisions.md`.
5. **When blocked on taste**, do not guess. Render two or three options as screenshots, recommend one, and ask.

## Quality bar

Before calling any slice done, look at your own screenshots and ask:

- Would this frame hold up next to a BotW screenshot at thumbnail size on a portfolio page?
- Can you read the plane, the horizon and the prompt from 3 m away on a 55" TV?
- Does the first 60 seconds feel like a game studio made it, or like a tech demo?
- Does the plane respond to the body fast enough that the player forgets the camera exists?
- Is there any frame drop, pop-in, hitch, flicker or placeholder visible in a 5 minute session?

If any answer is no, it isn't done. Say so in the handoff notes with what it would take.

## Final deliverable

A merged series of PRs plus a `docs/showcase.md` with: a 30 second capture plan (shots, camera bookmarks, time of day), five hero screenshots at 1920×1080, the measured perf and latency table, a short case-study write-up of the three pillars suitable for a portfolio, and known gaps.
