# Decisions log

One line per decision. Newest at the bottom. Format: `YYYY-MM-DD · area · decision · why`.
Sessions must not re-litigate these. Propose changes in PR handoff notes instead.

- 2026-09-24 · stack · Vite + React + TS + React Three Fiber + drei + Zustand · owner is fluent in React; R3F keeps 3D and UI in one tree
- 2026-09-24 · stack · WebGL2 renderer, not WebGPU · safest support on iOS Safari; revisit after M4
- 2026-09-24 · pose · MediaPipe Pose Landmarker (lite) via `@mediapipe/tasks-vision`, on-device · free, GPU accelerated, 33 landmarks, no video leaves the device
- 2026-09-24 · pose · One Euro filter for landmark smoothing · low lag matters because TV mirroring already adds ~100–200 ms
- 2026-09-24 · controls · Roll = angle of the wrist-to-wrist line; pitch = both arms raised (climb) or lowered (dive) relative to shoulders · reliable from a single 2D camera; torso lean needs noisy depth
- 2026-09-24 · controls · "Outstretched arms" gate: elbows nearly straight, wrist span > ~1.5× shoulder width, high landmark visibility; 300 ms to engage, 500 ms grace to disengage · avoids flicker
- 2026-09-24 · controls · Arms down or player out of frame → autopilot eases to level flight and shows a prompt · forgiving, keeps flow
- 2026-09-24 · controls · Arms down for 5 s → pause; arms out → resume · player is ~2 m from the phone, so no touch after Start
- 2026-09-24 · platform · Primary setup: phone propped in landscape, front camera, screen mirrored to a TV · owner's play setup; drives 10-foot UI and wake-lock requirements
- 2026-09-24 · flight · Arcade model: constant airspeed, bank causes turn, auto-level, soft terrain floor, no crash death in v1 · adventurous free flight, not a sim
- 2026-09-24 · art · Plane is procedural low-poly in code (Cessna-style high wing), swappable for glTF later · agent-buildable, no asset pipeline
- 2026-09-24 · hosting · Vercel with a preview deploy per PR · HTTPS for camera; test each PR on the phone
- 2026-09-24 · workflow · One ticket = one session = one PR, started manually with `docs/kickoff-prompt.md` · owner controls usage on a Pro plan
- 2026-09-24 · future · Split architecture (phone streams pose over WebRTC to a TV/laptop browser that renders) is out of scope for v1 · better quality and no mirroring lag, but much larger build
- 2026-09-25 · stack · `@react-three/fiber` v9 and `@react-three/drei` v10, not v8/v9 · React 18 peer deps of R3F v8 conflict with the React 19 required by #6; v9 targets React 19
- 2026-09-25 · art · Palette is a warm, low-contrast sunset (dusty gold/terracotta/muted teal) in `src/styles/tokens.ts`/`.css`, not a bright saturated midday look; `accent` is a muted teal-cyan, not neon, reserved for interactive UI rather than the plane livery (cream body, terracotta stripe) · owner review on the initial brighter/cooler palette called it too cartoony; kept one deliberately distinct (but muted) accent color for gesture feedback so it stays meaningful without clashing
- 2026-09-25 · art · Type: `Josefin Sans` (art-deco display, logo/section headers only) + `Work Sans` (Helvetica-like body/HUD everywhere else), both Google Fonts (SIL OFL 1.1), loaded via the Fonts API CSS in `tokens.css`; main title is uppercase with wide tracking (`type.trackingDisplay`), and the whole type ramp leans smaller than a typical hero-game-title scale · owner asked for BotW's actual split (Helvetica-like UI, special font only for logo/headers) and a smaller, mid-century-poster-style ramp instead of a big fantasy display scale; self-hosting can follow later if offline load time becomes an issue
- 2026-09-25 · art · UI buttons are a `surface-hud` panel with a 2px `accent` border, not a solid `accent` fill · matches an outlined-button look and avoids needing a separate "text on accent" token
- 2026-09-25 · art · `text-primary` never sits directly on the raw sky gradient; `TitleScreen`'s title/tagline and `?swatches`'s content both moved onto a `surface-hud` plate · a WCAG audit found `text-primary` on `sky-horizon` at only 1.7:1, far below AA, even though the same text on `surface-hud` passes comfortably; the plate also reads as a mid-century poster device rather than a bolted-on fix
- 2026-09-25 · art · Reverted the above for `TitleScreen` only: no panel behind the title/tagline/Start button, Start is a plain `text-primary`-outlined button (no fill, no `accent` border) · explicit owner request for this round of visual testing over the AA fix; `?swatches` keeps its `surface-hud` sheet. Known gap: title-screen text is not reliably AA-compliant everywhere on the gradient — flagged in `docs/art-direction.md`, revisit before shipping
