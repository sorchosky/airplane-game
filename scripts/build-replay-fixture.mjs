// Builds the replay fixtures in tests/fixtures/replays/ from the hand-authored poses in
// tests/fixtures/poses/. first-run.json: a player walks in, spreads their arms, holds a T-pose long
// enough to calibrate, then tilts left, tilts right, climbs, dives and drops their arms. boost.json
// (#93): the same start, then both arms swept back and held, then out again. Frames are 20 Hz (the
// pose service's detection rate) with smooth transitions and light seeded jitter, so the output is
// identical on every run.
//
// Usage: node scripts/build-replay-fixture.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const poseDir = join(root, 'tests/fixtures/poses')
const outDir = join(root, 'tests/fixtures/replays')

const FRAME_MS = 50
const LANDMARK_COUNT = 33
const I = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
}
const ARM_POINTS = [
  I.LEFT_SHOULDER,
  I.RIGHT_SHOULDER,
  I.LEFT_ELBOW,
  I.RIGHT_ELBOW,
  I.LEFT_WRIST,
  I.RIGHT_WRIST,
]

// The hand-authored poses put the shoulders 0.2 of the frame apart, the calibration flow's
// "too close" limit. Scaling about the frame center to 0.14 stands the player at a normal distance
// without changing any angle or span ratio the gesture math reads.
const SCALE = 0.7
const JITTER = 0.0015

/** Arm points only; every other landmark is added by `withBody`. */
function loadPose(name) {
  const points = JSON.parse(readFileSync(join(poseDir, `${name}.json`), 'utf8'))
  const arms = {}
  for (const i of ARM_POINTS) {
    arms[i] = {
      x: 0.5 + (points[i].x - 0.5) * SCALE,
      y: 0.5 + (points[i].y - 0.5) * SCALE,
      z: 0,
    }
  }
  return arms
}

/** Mirrors a pose's wrists and elbows through the shoulder line: arms raised become arms lowered. */
function lowered(pose) {
  const shoulderY = (pose[I.LEFT_SHOULDER].y + pose[I.RIGHT_SHOULDER].y) / 2
  const out = { ...pose }
  for (const i of [I.LEFT_ELBOW, I.RIGHT_ELBOW, I.LEFT_WRIST, I.RIGHT_WRIST]) {
    out[i] = { ...pose[i], y: 2 * shoulderY - pose[i].y }
  }
  return out
}

function mix(a, b, t) {
  const out = {}
  for (const i of ARM_POINTS) {
    out[i] = {
      x: a[i].x + (b[i].x - a[i].x) * t,
      y: a[i].y + (b[i].y - a[i].y) * t,
      z: a[i].z + (b[i].z - a[i].z) * t,
    }
  }
  return out
}

const smoothstep = (t) => t * t * (3 - 2 * t)

const level = loadPose('tpose-level')
const atSides = loadPose('arms-at-sides')
const tiltLeft = loadPose('tilt-left')
const tiltRight = loadPose('tilt-right')
const armsUp = loadPose('arms-up')
// A third of the way to the fully raised pose is a firm but not full climb (and the mirror a dive).
const climb = mix(level, armsUp, 0.35)
const dive = lowered(climb)

/**
 * Tucked wings (#93): from the level pose, each wrist just inside its shoulder and below it, 0.8
 * shoulder widths behind it in depth (z grows away from the camera), elbows halfway. Too narrow
 * to pass as arms out, which is what the boost has to keep the gate engaged through.
 */
function sweptBack(pose) {
  const ls = pose[I.LEFT_SHOULDER]
  const rs = pose[I.RIGHT_SHOULDER]
  const width = rs.x - ls.x
  const out = { ...pose }
  const arm = (shoulder, elbow, wrist, inward) => {
    out[wrist] = {
      x: shoulder.x + inward * width * 0.15,
      y: shoulder.y + width * 0.7,
      z: width * 0.8,
    }
    out[elbow] = {
      x: (shoulder.x + out[wrist].x) / 2,
      y: (shoulder.y + out[wrist].y) / 2,
      z: width * 0.4,
    }
  }
  arm(ls, I.LEFT_ELBOW, I.LEFT_WRIST, 1)
  arm(rs, I.RIGHT_ELBOW, I.RIGHT_WRIST, -1)
  return out
}
const swept = sweptBack(level)

// Walking in, spreading the arms and holding the calibration T-pose: shared by every fixture.
const ARRIVAL = [
  { label: 'empty', until: 0.6, pose: null },
  { label: 'walk-in', until: 2.4, pose: atSides, shiftFrom: 0.45 },
  { label: 'spread-arms', until: 3.4, pose: level, ease: 1 },
  { label: 't-pose', until: 6.9, pose: level },
]

// Seconds. Each segment eases from the previous pose to its own over `ease`, then holds.
// `shiftX` slides the whole body sideways (walking in from screen right).
const FIRST_RUN = [
  ...ARRIVAL,
  { label: 'tilt-left', until: 10.9, pose: tiltLeft, ease: 0.5 },
  { label: 'tilt-right', until: 15.4, pose: tiltRight, ease: 1 },
  { label: 'level', until: 16.9, pose: level, ease: 0.5 },
  { label: 'climb', until: 20.9, pose: climb, ease: 0.5 },
  { label: 'dive', until: 25.4, pose: dive, ease: 1 },
  { label: 'level-out', until: 26.9, pose: level, ease: 0.5 },
  { label: 'arms-at-sides', until: 29.9, pose: atSides, ease: 1 },
]

// Labels starting `boost` mark the deliberate sweep and its release: the false-trigger test in
// gesture.test.ts allows a boost only there.
const BOOST = [
  ...ARRIVAL,
  { label: 'level', until: 8.9, pose: level },
  { label: 'boost-sweep', until: 12.9, pose: swept, ease: 0.6 },
  { label: 'boost-release', until: 13.9, pose: level, ease: 0.6 },
  { label: 'level-out', until: 16.9, pose: level },
]

/** mulberry32: a tiny seeded PRNG so the jitter is the same on every build. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let random = rng(19)
const jitter = () => (random() * 2 - 1) * JITTER

const round = (v) => Math.round(v * 1000) / 1000
const HIDDEN = { x: 0, y: 0, z: 0, visibility: 0 }

/** Full 33-point frame: the arms plus a nose and hips so calibration's framing check passes. */
function withBody(arms, shiftX) {
  const points = Array.from({ length: LANDMARK_COUNT }, () => HIDDEN)
  const place = (i, x, y, visibility = 0.95, z = 0) => {
    const px = x + shiftX + jitter()
    const py = y + jitter()
    const inFrame = px >= 0 && px <= 1
    points[i] = { x: round(px), y: round(py), z: round(z), visibility: inFrame ? visibility : 0.1 }
  }
  for (const i of ARM_POINTS) place(i, arms[i].x, arms[i].y, 0.95, arms[i].z)
  const ls = arms[I.LEFT_SHOULDER]
  const rs = arms[I.RIGHT_SHOULDER]
  const width = rs.x - ls.x
  const midY = (ls.y + rs.y) / 2
  place(I.NOSE, (ls.x + rs.x) / 2, midY - width * 0.6, 0.9)
  place(I.LEFT_HIP, ls.x + width * 0.15, midY + width * 1.5, 0.85)
  place(I.RIGHT_HIP, rs.x - width * 0.15, midY + width * 1.5, 0.85)
  return points
}

function build(name, segments, seed) {
  random = rng(seed)
  const frames = []
  let previous = null
  let segmentStart = 0
  for (const segment of segments) {
    const from = previous ?? segment.pose
    for (let t = segmentStart; t < segment.until - 1e-9; t += FRAME_MS / 1000) {
      const tMs = Math.round(t * 1000)
      if (!segment.pose) {
        frames.push({ tMs, label: segment.label, landmarks: null, worldLandmarks: null })
        continue
      }
      const local = t - segmentStart
      const span = segment.until - segmentStart
      let arms = segment.pose
      let shiftX = 0
      if (segment.ease && from)
        arms = mix(from, segment.pose, smoothstep(Math.min(local / segment.ease, 1)))
      if (segment.shiftFrom)
        shiftX = segment.shiftFrom * (1 - smoothstep(Math.min(local / span, 1)))
      // World landmarks are left empty: nothing in the game reads them, and a synthesized set would
      // only double the file. Recordings from `?debug` carry the real ones.
      frames.push({
        tMs,
        label: segment.label,
        landmarks: withBody(arms, shiftX),
        worldLandmarks: [],
      })
    }
    if (segment.pose) previous = segment.pose
    segmentStart = segment.until
  }

  const outPath = join(outDir, `${name}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  // One frame per line: small enough to diff, far smaller than pretty-printed.
  const body = frames.map((f) => JSON.stringify(f)).join(',\n')
  writeFileSync(outPath, `{"frames":[\n${body}\n]}\n`)
  console.log(`wrote ${frames.length} frames (${(frames.length * FRAME_MS) / 1000}s) to ${outPath}`)
}

build('first-run', FIRST_RUN, 19)
build('boost', BOOST, 93)
