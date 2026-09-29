# Release candidate backlog

Proposed slices for the next phase after M5. This follows the M5 backlog
pattern. Each agent slice is one independently reviewable ticket and PR, sized
with the same S and M scale used in `docs/roadmap.md`. Human slices are review
tickets that produce evidence and narrowly scoped defect tickets, not code PRs.

This is a release-candidate pass, not another feature pass. The remaining risk
is whether the finished systems hold up on real phones, while casting, across
the supported input and accessibility modes.

Order of execution: run R1–R3 in tandem → run H1–H4 while those PRs are in
flight → fix reproducible blockers by subsystem → complete showcase #83.

## Parallel-work gate

R1–R3 do not intersect and can start from the same `main` snapshot:

- R1 owns pose interpretation and pose input publication. Do not run the pose
  worker experiment #67 against the same branch.
- R2 owns world tile selection and its allocation measurements.
- R3 owns the pause menu and existing settings stores. It does not add new
  settings or change control tuning.

Human findings do not expand an active agent ticket. File each reproducible
failure as its own issue with one subsystem owner, then schedule it after the
three parallel PRs merge.

## Agentic slices

| Id | Issue | Slice | Size | Depends on | Label |
|---|---|---|---|---|---|
| R1 | TBD | Pose hot-path allocations: reuse caller-owned gesture output and filter state in `gesture.ts` and `poseSource.ts`; preserve mirrored roll, pitch, boost, confidence and gate behavior; add allocation and replay-equivalence tests; update the measured row in `docs/perf.md` | S | none | agent-ready |
| R2 | TBD | Terrain selection allocations: reuse tile-selection buffers across chunk crossings in `terrainStreamer.ts` and `cellCache.ts`; preserve deterministic keys, ordering, seams and tier distances; add an allocation regression test; update the measured row in `docs/perf.md` | S | none | agent-ready |
| R3 | TBD | Pause-menu settings: expose the existing mute, captions, reduced-motion, high-contrast and seated settings through the gesture-safe tilt-and-hold menu; preserve keyboard access, hands-free camera play, persistence, 10-foot type, touch targets and WCAG contrast; add unit and pause-menu e2e coverage | M | none | review:visual |

Every agentic slice must pass `npm run check` and its focused e2e spec. R3 also
ships desktop and phone-viewport screenshots. R1 and R2 record the exact
allocation command and before-and-after result in `docs/perf.md`.

## Human review slices

These can start immediately. Record the preview commit, device, OS, browser,
viewport, control mode and cast target with every result. A review passes or
links to separate defect issues. It does not accumulate fixes in the review
ticket.

| Id | Issue | Review | Size | Feeds | Label |
|---|---|---|---|---|---|
| H1 | TBD | Phone and cast soak: run ten minutes with `?debug` on one iPhone 13-class device with AirPlay and one mid-range Android device with Chromecast; record fps, p95/p99 frame time, pose Hz, inference time, latency, DPR, tier, governor steps, heat, camera loss and audio interruption at 0, 5 and 10 minutes; attach one trace covering pose inference and a tier change | S | #67, #83 | needs-human |
| H2 | TBD | Device and input QA: complete Start → control select → flight → pause → resume → title with Camera, Mouse and Touch on their target hardware; verify orientation changes, tab backgrounding and camera interruption; attach steps and video for each reproducible failure | S | defect tickets | needs-human |
| H3 | TBD | Visual review: inspect the canonical `?shot=` bookmarks on `low`, `medium` and `high`, then a full five-minute day cycle from 3 m on a 55-inch-class TV; approve or file separate issues for hierarchy, contrast, plane and horizon separation, pop, banding, clipping, shimmer and abrupt LOD changes; select five hero frames | S | #83 | needs-human, review:visual |
| H4 | TBD | Accessibility review: complete keyboard-only, 200% zoom, reduced-motion, high-contrast, captions and seated-camera paths; verify focus order, visible focus, accessible names, no traps or clipping, complete cue captions, motion reduction and branded camera denial/loss/recovery | S | defect tickets | needs-human |

## Exit criteria

- A ten-minute cast session meets the phone budgets in `docs/perf.md` without
  thermal, recovery or quality-governor failure.
- Camera, Mouse and Touch complete the primary journey on target hardware.
- Plane, horizon, prompts and component states remain legible from 3 m across
  the day cycle and quality tiers.
- Keyboard-only, 200% zoom, reduced-motion, high-contrast, seated and captioned
  paths pass human review.
- #67 has a keep-or-close decision based on the phone trace.
- #83 contains approved hero shots, real-device performance and latency
  numbers, the capture plan and known gaps.

The phase closes on evidence, not on clearing every review preference. Cosmetic
notes below this bar return to the backlog.
