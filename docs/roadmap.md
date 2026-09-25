# Roadmap

Five milestones, each tracked as an epic issue with sub-issues. Every ticket is sized for one Claude Code session and one PR.

**How to pick the next ticket:** the lowest-numbered open ticket whose dependencies are all merged. M1 and M2 can run in parallel once #6–#9 are merged. M3 can start after #6.

## Labels

| Label | Meaning |
|---|---|
| `epic` | Milestone tracker, not worked directly |
| `milestone:M0`…`milestone:M4` | Which milestone a ticket belongs to |
| `size:S` / `size:M` | S ≈ under 200 lines of diff, M ≈ 200–500. Anything bigger gets split. |
| `agent-ready` | Fully specified, an agent can do it without questions |
| `needs-human` | Owner action required (account setup, recording, device test, decision) |
| `review:visual` | Owner should look at the screenshot or preview before merging |

## M0 Foundation · epic #1

| Issue | Ticket | Size | Depends on | Notes |
|---|---|---|---|---|
| #6 | Scaffold Vite + React + TS + R3F project | M | none | |
| #7 | CI (GitHub Actions) and Vercel preview deploys | S | #6 | needs-human: connect Vercel |
| #8 | Game state machine, title screen, wake lock | M | #6 | |

## M1 Flight greybox (keyboard) · epic #2

| Issue | Ticket | Size | Depends on | Notes |
|---|---|---|---|---|
| #9 | `ControlInput` contract and keyboard/touch input | S | #6 | the seam between M1 and M2 |
| #10 | Arcade flight model | M | #9 | |
| #11 | Chase camera | S | #10 | |
| #12 | Procedural terrain chunks (greybox) and soft floor | M | #10 | |

**Checkpoint:** fly around with the keyboard on the Vercel preview.

## M2 Gesture control · epic #3

| Issue | Ticket | Size | Depends on | Notes |
|---|---|---|---|---|
| #13 | Camera service and mirrored preview | M | #8 | |
| #14 | Pose service (MediaPipe) | M | #13 | |
| #15 | Orientation line overlay on preview | S | #14 | |
| #16 | Gesture interpreter (arms-out gate, roll, pitch, smoothing) | M | #9 | pure logic, parallel with #13–#15 |
| #17 | Calibration flow | M | #15, #16 | |
| #18 | Arms-down autopilot, gesture pause, HUD prompts | M | #8, #10, #16 | |
| #19 | Pose record/replay and fake-camera e2e test | M | #14, #16 | needs-human: record a clip |

**Checkpoint:** cast to the TV and fly with your body.

## M3 Art direction (BotW) · epic #4

| Issue | Ticket | Size | Depends on | Notes |
|---|---|---|---|---|
| #20 | Art direction doc and design tokens | S | #6 | review:visual |
| #21 | Toon material factory and outlines | M | #20 | review:visual |
| #22 | Sky, sun, clouds, atmospheric fog | M | #20 | review:visual |
| #23 | Procedural Cessna-style plane | M | #10, #21 | review:visual |
| #24 | Terrain coloring and water | M | #12, #21 | review:visual |
| #25 | Foliage and landmarks | M | #24 | review:visual |
| #26 | Post-processing and color grade | S | #21, #22 | review:visual |

**Checkpoint:** screenshot review against the art direction doc.

## M4 Polish · epic #5

| Issue | Ticket | Size | Depends on | Notes |
|---|---|---|---|---|
| #27 | Mobile performance pass and debug HUD | M | #18, #25 | needs-human: device test while casting |
| #28 | Pause menu, orientation prompt, reduced motion, UX copy | M | #18 | |
| #29 | Audio: engine and wind | S | #10 | optional |
