# CLAUDE.md

Guidance for Claude Code sessions working in this repo. Read this first, every session.

## What this is

A browser flight game. The player stands in front of a propped-up phone (front camera, landscape) with arms outstretched like wings. The phone screen is cast to a TV (AirPlay / Chromecast mirroring). Body tilt banks the plane, raising or lowering both arms pitches it. The look is cel-shaded, inspired by *The Legend of Zelda: Breath of the Wild*. The plane is a stylized Cessna-style high-wing.

Roadmap and ticket index: `docs/roadmap.md`. Settled decisions: `docs/decisions.md`. Do not re-litigate a decision logged there. If you believe one is wrong, say so in the PR handoff notes.

## Stack

- Vite + React + TypeScript (strict)
- Three.js via React Three Fiber (`@react-three/fiber`) + `@react-three/drei`
- `@react-three/postprocessing` for post FX
- Zustand for shared state
- MediaPipe Pose Landmarker (lite model) via `@mediapipe/tasks-vision`
- `simplex-noise` for terrain
- Vitest (unit), Playwright (e2e, Chromium fake camera)
- Hosting: Vercel, preview deploy per PR (HTTPS is required for camera access)
- Renderer: WebGL2. Do not switch to WebGPU without a decision entry.

## Commands

Created by ticket #6 (scaffold). Keep these names stable.

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint + Prettier check |
| `npm test` | Vitest, single run |
| `npm run e2e` | Playwright |
| `npm run check` | typecheck + lint + test. Must pass before every push. |

Playwright: Chromium is preinstalled in cloud sessions. Never run `playwright install`. If versions mismatch, launch with `executablePath: '/opt/pw-browsers/chromium'`.

## Architecture

```
src/
  app/        App root, game state machine (title → calibrate → flying ⇄ paused), screens
  input/      ControlInput contract, input store, keyboard/touch source
  pose/       camera service, pose service (MediaPipe), gesture interpreter, filters, calibration
  flight/     flight model (pure), Plane component, chase camera
  world/      terrain chunks, sky, water, foliage, landmarks
  render/     toon material factory, outlines, postprocessing
  ui/         HUD, CameraPreview, PoseOverlay, prompts
  styles/     design tokens (tokens.ts + tokens.css)
  debug/      perf HUD, pose recorder/replay
tests/e2e/    Playwright specs + fixtures (fake camera .y4m, recorded pose JSON)
docs/
```

### The key seam: `ControlInput`

Everything that steers the plane produces one shape, defined in `src/input/types.ts`:

```ts
interface ControlInput {
  roll: number;       // -1 (bank left) .. 1 (bank right)
  pitch: number;      // -1 (dive) .. 1 (climb)
  active: boolean;    // false = autopilot takes over
  confidence: number; // 0..1, from pose; keyboard reports 1
  source: 'keyboard' | 'pose' | 'replay';
}
```

Flight code only reads `ControlInput`. It never imports from `pose/`. Pose code never imports from `flight/`. This lets flight and gesture work proceed in parallel and be tested independently.

### Rules

- **Pure logic stays pure.** Flight model, gesture interpreter, filters and calibration math are plain TS functions with no React or Three imports (Three math types like `Vector3` are OK in flight). They get unit tests.
- **No React state at frame rate.** Per-frame values live in Zustand stores and are read with `store.getState()` inside `useFrame`. React re-renders only on state-machine or UI changes.
- **Units.** Meters, seconds, radians. Y up. Plane forward is -Z.
- **Tokens only.** No raw hex colors, font sizes or spacing in components. Import from `src/styles/tokens`. Spacing is on an 8pt grid.
- **Hands-free after Start.** After the player taps Start they are ~2m away. No screen after that may require touch. Pause and resume are gestures.
- **10-foot UI.** The game is viewed on a TV. Use the TV type scale in tokens. Minimum body text is the `tv-body` token. Prompts must be legible from a couch.
- **Mirrored preview.** The camera preview is mirrored (selfie view). Gesture math works in mirrored space so "tilt right" on screen banks right.
- **URL flags** for dev and testing: `?input=keyboard|pose|replay`, `?replay=<fixture>`, `?debug` (perf HUD, pose debug). Keyboard input must always work in dev.

## Session protocol (one ticket per session)

Start every session with a prompt from `docs/kickoff-prompt.md` — "run the next ticket" if you weren't given a specific issue number, or the specific-ticket prompt if you were.

1. Read this file, then the issue you were given. Read other issues or PRs only if the ticket references them.
2. Work on the branch the session assigns. If none, use `ticket/<issue#>-<short-slug>` from `main`.
3. Stay in scope. Things you notice outside scope go in the PR's handoff notes, not in the diff.
4. `npm run check` must pass. Add unit tests for new pure logic. For visual changes, capture a screenshot with Playwright and put it in the PR.
5. Open a PR with `Closes #<issue>` and fill in the PR template, including handoff notes.
6. If you are blocked on a decision only the owner can make, comment the question on the issue with options and a recommendation, add the `needs-human` label, and stop.
7. If you made a lasting decision (library choice, tuning constant rationale, contract change), add one line to `docs/decisions.md`.

## Definition of done

- All acceptance criteria in the issue are checked.
- `npm run check` passes locally and in CI.
- No new `any`, no disabled lint rules without a comment explaining why.
- PR includes verification steps, and screenshots for anything visual.
- Handoff notes list follow-ups and anything the next ticket should know.
