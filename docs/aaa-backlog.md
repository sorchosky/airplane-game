# AAA polish pass backlog

Prioritised slices for the M5 epic (#58). Each slice is one PR off current `main`,
independently reviewable, with before and after `?shot=` bookmarks, perf
numbers from `?debug` on `medium` and `high`, and handoff notes. Sizes follow
`docs/roadmap.md` (S under 200 lines of diff, M 200–500). Anything bigger
gets split.

Order of execution unless a measurement says otherwise: engineering
foundations → palette and lighting → terrain and foliage → camera and flight
feel → onboarding and practice → clouds, VFX, landmarks → audio → UI reskin →
golden path → final polish.

## Gate

Art slices (A1 onward) wait for the owner's sign-off on `docs/art-bible.md`
and a palette pick from the contact sheets in `docs/art-bible.md` §3. Engineering and
experience slices do not.

## Slices

| Id | Issue | Slice | Size | Depends on | Label |
|---|---|---|---|---|---|
| E1 | #59 | Latency probe and perf HUD: timestamps from camera frame to first visible bank, p95/p99 frame time, DPR, tier, pose Hz, all in `?debug` | M | none | agent-ready |
| E2 | #60 | Zero per-frame allocations: scratch objects and out-parameters in flight step, camera, plane rig, clouds, pose source, overlay; Vitest allocation check | M | none | agent-ready |
| E3 | #65 | Adaptive quality: frame-time governor with hysteresis stepping DPR, post tier, foliage density and view distance; supersedes #27's adaptive part | M | E1 #59 | agent-ready |
| E4 | #66 | Shorter latency stack: 30 Hz detection when inference allows, write `ControlInput` on detection instead of the next rAF, linear prediction between samples, retuned One Euro and bank/pitch springs, measured before and after | M | E1 #59 | agent-ready |
| E5 | #67 | Pose in a Web Worker experiment (OffscreenCanvas / ImageBitmap), kept only if the phone trace shows a win, main-thread fallback | M | E1 #59 | needs-human (phone trace) |
| E6 | #61 | Robustness: camera loss, tab hide, thermal throttle, model load failure as on-brand states; never a raw error or frozen frame | S | none | agent-ready |
| E7 | #62 | Replay input source and first-run timing spec (the unbuilt half of #19): `?input=replay&replay=<fixture>` feeds `poseStore` on fixture timestamps | M | none | agent-ready |
| A1 | #64 | Palette and lighting: albedo and lighting token groups, `morning` and `golden-hour` presets, sky gradient with sun glow, cool aerial perspective, hemisphere shadow fill, bloom threshold retune | M | sign-off | review:visual |
| A2 | #69 | Terrain surface: macro colour variation, brushed breakup, rock strata, sun-responsive grass tint | M | A1 #64 | review:visual |
| A3 | #75 | Grass and foliage: instanced wind grass cards near the plane, instanced toon trees and bushes with outlines, density by distance and altitude | M | A2 #69, E3 #65 | review:visual |
| A4 | #70 | Clouds: two toon-shaded layers of cumulus impostors with stepped ramp and soft edge, fly-through fog burst | M | A1 #64 | review:visual |
| A5 | #71 | Plane presentation and camera: livery, canopy specular hint, wingtip vortices, contact shadow blob, camera framing in the lower-centre third with lead into turns | M | A1 #64 | review:visual |
| A6 | #76 | Landmarks: tower, stone arch, waterfall, lone giant tree, ruins, placed on the horizon from spawn | M | A2 #69 | review:visual |
| A7 | #72 | Post and grade: painterly grade, god rays on `high`, honest `medium` and `low` | S | A1 #64 | review:visual |
| A8 | #73 | Title cinematic: fade from white, animated parallax cirrus, longer eased sweep with breathing blur, light shift, per-letter reveal, audio swell, contrast fix, hand-off into the live world | M | A1 #64 | review:visual |
| A9 | #79 | UI reskin: thin-line chrome, glow instead of panels, blurred pause and countdown, camera preview frame | M | A8 #73 | review:visual |
| F1 | #68 | Flight feel: energy (dive speed carried into climbs), roll-to-yaw lag, optional arms-back boost behind the gesture gate, soft-floor pull-up burst, one tunables object with tests | M | E2 #60 | agent-ready |
| F2 | #77 | Camera and VFX: FOV punch and shake at speed, wind streaks, spray and dust on low passes, birds | M | F1 #68, A5 #71 | review:visual |
| F3 | #78 | Audio: layered engine tied to RPM, wind by speed and bank, doppler past landmarks and through clouds, ambient bed with stems that swell on low passes, captions hook | M | F1 #68 | agent-ready |
| X1 | #63 | Pose demonstration and calibration you can see: title silhouette loop, camera ask frame, skeleton overlay, target silhouette, failing-limb highlight, lock-in flourish | M | none | review:visual |
| X2 | #74 | Wings practice: slow glide after calibration, three prompts with ticks, speed ramps to cruise, first-run timing spec | M | X1 #63, E7 #62 | agent-ready |
| X3 | #80 | In-flight readout and pause teaching: horizon line with wing marks, pause ring on first arms-drop, menu gesture loop on first open | S | X2 #74 | review:visual |
| X4 | #81 | Golden path: wind rings, birds, cloud break, waterfall and arch reveal, title card, free flight | M | A4 #70, A6 #76, F2 #77 | review:visual |
| X5 | #82 | Accessibility: seated mode, handedness tolerance, high-contrast HUD, captions, AA audit | M | X3 #80 | agent-ready |
| S1 | #83 | Showcase: `docs/showcase.md`, 30 s capture plan, five hero shots, perf and latency table, case study, known gaps | S | everything | needs-human (phone numbers) |

## Superseded tickets

- #27 (mobile performance pass) is split into E1, E3 and E5. Its owner step
  (10 minutes on the phone while casting) stays and feeds E3's tuning.
- #25 (foliage and landmarks) is split into A3 and A6.
- #19 (record/replay) becomes E7 for the replay half; the owner's recorded
  clip is still wanted and still feeds the fake-camera e2e.

## Quality bar, applied at every slice

- Would this frame hold up next to a BotW screenshot at thumbnail size?
- Can you read the plane, the horizon and the prompt from 3 m on a 55" TV?
- Does the first 60 seconds feel like a studio made it?
- Does the plane respond fast enough that the player forgets the camera?
- Any drop, pop, hitch, flicker or placeholder in a 5 minute session?

If any answer is no, the slice is not done and the handoff notes say what it
would take.
