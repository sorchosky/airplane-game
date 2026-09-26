# Driftwing first-run experience

The storyboard for a stranger who has never seen the game. Design principle:
show, don't tell. The player is two metres from the phone with no controller.
Every instruction is understandable from a couch in under three seconds, with
an icon or an animation doing most of the work and at most one short line of
copy. Target: title to flying, grinning, in under 60 seconds.

## What happens today (measured on the recorded fixtures, keyboard walk-through)

| Beat | Today | Time |
|---|---|---|
| Title | Wordmark reveal, Start. No hint of what the game is or what the body does. | 0–4 s |
| Camera ask | Browser permission prompt, no framing copy. | 4–8 s |
| Calibrate | Dark box, a fake cream video panel with a thin arm line, a stick figure, text only: "Step back until your head and hips are in view". No skeleton on the player, no target to match, no indication of which limb is wrong. | 8–25 s (owner estimate; first-timers often longer) |
| Lock-in | The screen cuts straight to flight. No sound, no flourish. | |
| Flight | The plane is already moving at cruise. The only body feedback is a 20 vw corner preview. Prompt "Spread your arms to fly" appears when the gate drops. | 25 s → |
| Pause | Arms down 5 s pauses. Nothing teaches that. The tilt-to-choose, hold-to-pick menu is explained by one line of text. | |
| After a minute | Nothing to do. No destination, no reward. | |

The 60-second target is not met today because calibration has no visual
guidance and flight starts at full speed with no practice.

## Storyboard

Times are targets for a first-timer who has never seen the game. Each frame
lists what is on screen, what the player does, and what tells them it worked.

### 00 Title (0–6 s)

Cinematic sky, wordmark sweeps in under the frosted band, Start settles.
Beneath Start, one line in `tv-body`: *"Fly with your arms. Cast to a TV."*
plus a 3-frame looping silhouette (arms out, tilt, arms up) at 24 fps in
`text-muted`. The silhouette is the pose demonstration: the player sees the
whole control scheme before touching anything. Start is the only tap in the
game.

### 01 Camera ask (6–9 s)

The sky stays. A single frame in the UI language: camera icon, *"We need your
camera to see you fly. Nothing leaves your phone."* The browser prompt opens
on top. On deny: the same frame with *"Allow the camera in your browser
settings"* and Try again. No raw error text, ever.

### 02 Get in position (9–20 s)

The mirrored preview goes near full-bleed with a 12 px cool frame. Over the
player, the detected skeleton in `accent` (shoulders, elbows, wrists, hips,
head). Over the frame, a target silhouette in `line` at 40%: the T-pose the
player should fill, sized for two metres. One line of copy switches with the
check that fails, and the failing limb pulses in `control-inactive`:

| Check | Copy | Visual |
|---|---|---|
| No person | *"Step into view"* | Empty target silhouette pulses |
| Too close | *"Step back"* | Target shrinks toward the centre |
| Too far | *"Come closer"* | Target grows |
| Arms not out | *"Spread your arms like wings"* | Arm segments of the target pulse; the player's arm segments show in inactive grey |
| Holding | *"Hold…"* | Skeleton turns fully accent, ring fills |

### 03 Lock-in (20–23 s)

Ring completes: a chime, the skeleton flashes white once and the frame
contracts to the corner preview over 600 ms while the world fades up behind
it. A caption for the chime (*"Locked"*) shows for players with captions on.

### 04 Wings (23–50 s)

The plane is on screen, gliding slowly (0.45 × cruise, no floor pressure, no
pause timer) over the spawn valley in morning light. Three prompts, one at a
time, each an icon plus two words, each completing on success with a tick and
a soft cue:

1. *"Tilt left"* silhouette leaning left → plane banks left past 20° for 0.5 s → tick.
2. *"Tilt right"* → tick.
3. *"Arms up"* → climb past 8° for 0.5 s → tick. *"Arms down"* → dive → tick.

Speed rises to cruise over the last prompt. If the player drops their arms
during Wings, the plane just glides and the prompt waits; no pause timer runs
here. If a prompt is not completed in 20 s it quietly moves on. Wings is
skipped when a saved calibration is reused and the player has finished it
before.

### 05 First flight (50–60 s)

*"You're flying."* fades in and out over 2 s. The in-flight readout appears: a
thin horizon line under the plane with two wing marks that mirror the player's
roll and pitch, in `accent` while the gate is engaged and `control-inactive`
when it is not. It fades out after 20 s of steady input and returns when input
gets erratic or drops.

### 06 Golden path (1–5 min)

An authored first flight, no crash death, always skippable by just flying
elsewhere:

1. Three wind rings ahead in a gentle line, each a 30 m soft ring in `line`;
   flying through one gives a chime, a puff and a small speed gain.
2. A flock of birds crosses and leads toward the range.
3. The cloud layer thickens; the plane breaks through into sun (fog burst,
   audio swell).
4. Reveal: a valley with a waterfall and the stone arch landmark, light shifting
   toward `golden-hour` over the last minute.
5. Through the arch: title card *"Driftwing"* in the wordmark treatment, then
   *"Fly anywhere."* Free flight.

### 07 Teaching the pause

- First time the arms drop in flight: the prompt shows the wing icon and a
  progress ring that fills over the 5 s pause timer. *"Arms down to pause"*.
- First time the menu opens: a 2 s silhouette loop above the items shows tilt
  (highlight moves) then a level hold (ring fills). The loop never plays again
  in that session.
- Countdown and pause show the world blurred and desaturated behind a 60%
  scrim, so the player never loses the sense of where they are.

## Accessibility

| Need | What ships |
|---|---|
| Reduced motion | Title intro skipped, no camera roll, no FOV punch, no shake, no speed lines, fades only |
| Seated mode | `?seated` and a pause-menu toggle: arms-only gate (no hip check), 1.5 × deadzones, pitch from wrist height alone |
| Left or right handed | Roll calibration accepts a ±15° neutral tilt; asymmetric arm height tolerance in the gate |
| High-contrast HUD | Readout and prompts on a full-alpha panel, thicker lines |
| Captions | Every audio cue has a 1 s caption in `tv-caption` at the bottom centre |
| Contrast | WCAG AA on every text element including the title (fixed in A8) |

## Copy

All strings in `src/ui/copy.ts`. Second person, warm, a little adventurous,
zero jargon, nothing longer than one line at `tv-body` on a 16:9 phone. New
keys this pass adds: `title.tagline`, `camera.ask`, `camera.denied`,
`calibrate.locked`, `wings.*`, `flight.youAreFlying`, `pause.teach`,
`path.*`, `captions.*`.

## Measuring the 60 seconds

`tests/e2e/firstRun.spec.ts` (slice X2) drives the replay source with a
recorded fixture (walk in, T-pose, tilt left, tilt right, arms up, arms down)
and asserts the time from the Start click to `flight.youAreFlying` is under
60 s with the fixture's natural timing. The owner repeats it with a stopwatch
on the phone once per milestone.
