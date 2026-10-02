import { Quaternion, Vector3 } from 'three'
import type { FlightState } from '../flight/flightModel'
import { activeLighting } from '../world/lightingPreset'

/**
 * `?shot=<name>`: fixed camera bookmarks for before/after screenshots. Every art PR captures the
 * same bookmarks at the same resolution (`tests/e2e/shots.spec.ts`) so the owner compares like
 * with like. Pure: no React, DOM or store imports, so the parsing and the placement math are
 * unit tested.
 *
 * While a shot is active the flight sim, clouds and water are frozen, so a capture is
 * deterministic apart from terrain streaming, which the spec waits for.
 *
 * Coordinates are world metres for the fixed world seed (`TERRAIN_CONFIG.seed`), found with a
 * scan of the heightfield: spawn is over a valley at (1750, 2000), the nearest big lake is at
 * (1700, 2450), the highest peak nearby is at (2850, -900), and a plateau sits at (-2250, 0..400).
 */
export interface ShotBookmark {
  name: string
  /** Plane position, world m. */
  position: readonly [number, number, number]
  /** Yaw, radians, around world +Y. Forward is (-sin, 0, -cos). 0 looks toward -Z. */
  heading: number
  /** Radians, positive banks right. */
  bank: number
  /** Radians, positive nose up. */
  pitchAngle: number
  /**
   * Optional camera override, m, in the plane's heading frame: [right, up, forward]. The camera
   * looks at the plane. Without it the chase camera frames the shot as in play.
   */
  cameraOffset?: readonly [number, number, number]
  /**
   * Optional shift of the camera's aim point away from the plane, m, in the plane's heading frame:
   * [right, up, forward]. Aiming left of the plane puts the plane right of centre on screen.
   */
  lookOffset?: readonly [number, number, number]
  /** Why this bookmark exists, for the capture log and the art bible. */
  purpose: string
}

const deg = (degrees: number): number => (degrees * Math.PI) / 180

/**
 * World-space heading whose forward vector, (-sin h, 0, -cos h), points along the active lighting
 * preset's horizontal sun direction, so `toward-sun` faces the sun under any `?tod=` (#64).
 */
const TOWARD_SUN = (() => {
  const [x, , z] = activeLighting().sunDirection
  return Math.atan2(-x, -z)
})()
const AWAY_FROM_SUN = TOWARD_SUN + Math.PI

export const SHOT_BOOKMARKS: readonly ShotBookmark[] = [
  {
    name: 'title',
    position: [1750, 147, 2000],
    // Across the sun's line, so the light rakes the plane and the left of the frame stays open sky.
    heading: TOWARD_SUN + deg(55),
    bank: 0,
    pitchAngle: 0,
    // Behind and left of the plane, a touch above it: the camera looks about 11 degrees down, which
    // puts the horizon in the upper third. Aiming 9 m left of the plane seats it in the right two
    // thirds (at 16:9, and a little further right on a wider phone), leaving the left third sky.
    cameraOffset: [-9, 5, -26],
    lookOffset: [-9, 0, 0],
    purpose:
      'The front door (#153): plane parked in the right two thirds, horizon in the upper third, open sky on the left for the masthead. At the title the flyby (#157) flies instead, frozen under `?shot=title`; this bookmark frames the same shot once flight starts.',
  },
  {
    name: 'spawn',
    position: [1750, 147, 2000],
    heading: 0,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The first frame a player sees. Default chase framing over the spawn valley.',
  },
  {
    name: 'the-cut',
    position: [1750, 147, 2000],
    // Bearing from the basin centre to the cut's route point, `docs/world-route.md`.
    heading: -0.245,
    bank: 0,
    pitchAngle: 0,
    purpose:
      'The home basin (#171): looking through the cut from spawn, the ridge ring to either side.',
  },
  // The route valley (#172): 45 m over the floor, heading down the valley along the route.
  {
    name: 'valley-tower-approach',
    position: [2189, 101, 692],
    heading: -0.529,
    bank: 0,
    pitchAngle: 0,
    purpose:
      'The route valley (#172) past the cut: floor, both walls and the bend toward the tower.',
  },
  {
    name: 'valley-east-river',
    position: [4892, 91, 673],
    heading: -2.545,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The route valley (#172) dropping into the wide, low east river reach.',
  },
  {
    name: 'valley-south-shoulder',
    position: [2837, 114, 3661],
    heading: 1.735,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The route valley (#172) at its narrow south shoulder, heading west.',
  },
  {
    name: 'valley-west-bend',
    position: [520, 89, 3023],
    heading: 1.029,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The route valley (#172) into the tight west bend, where two floors merge.',
  },
  // The route river (#174): 50 m over the floor, heading downstream along the route.
  {
    name: 'river-east',
    position: [5129, 86, 1220],
    heading: -2.961,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The route river (#174) where the east reach drops into the water and runs south.',
  },
  {
    name: 'river-lake',
    position: [275, 83, 2373],
    heading: -0.697,
    bank: 0,
    pitchAngle: 0,
    purpose:
      'The route river (#174) running out of the west reach into its lake on the return notch.',
  },
  {
    name: 'low-pass',
    position: [1750, 47, 1900],
    heading: 0,
    bank: 0,
    pitchAngle: 0,
    purpose: 'Twenty metres over the valley floor: near-field detail and sense of speed.',
  },
  {
    name: 'lake-bank',
    position: [1650, 85, 2200],
    heading: Math.PI,
    bank: deg(38),
    pitchAngle: 0,
    purpose: 'Banking over the spawn lake: water, shoreline, plane silhouette in a turn.',
  },
  {
    name: 'mountain-vista',
    position: [2400, 380, 300],
    heading: -0.36,
    bank: 0,
    pitchAngle: 0,
    purpose: 'High over the range toward the tallest peak: aerial perspective and snow line.',
  },
  {
    name: 'toward-sun',
    position: [1750, 250, 2000],
    heading: TOWARD_SUN,
    bank: 0,
    pitchAngle: 0,
    purpose: 'Sun glow, haze warmth and bloom.',
  },
  {
    name: 'away-from-sun',
    position: [1750, 250, 2000],
    heading: AWAY_FROM_SUN,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The cool side of the sky and the horizon shift.',
  },
  {
    name: 'plateau',
    position: [-2250, 260, 700],
    heading: 0,
    bank: 0,
    pitchAngle: deg(-6),
    purpose: 'Plateau cliffs ahead: rock strata and slope-driven colour.',
  },
  {
    name: 'clouds',
    position: [1750, 400, 2000],
    heading: 0,
    bank: 0,
    pitchAngle: deg(4),
    purpose: 'Inside the cloud layer: cloud shading and volume.',
  },
  {
    name: 'cloud-gate',
    position: [1205, 136, 903],
    heading: 0.674,
    bank: 0,
    pitchAngle: 0,
    purpose: 'Golden-path approach: the dense cumulus gate bank centred on the route.',
  },
  {
    name: 'plane-hero',
    position: [1750, 147, 2000],
    heading: 0,
    bank: deg(30),
    pitchAngle: deg(6),
    cameraOffset: [9, 3.5, 11],
    purpose: 'Three-quarter front view of the plane: livery, silhouette, outlines, canopy.',
  },
  // Landmarks (#76), each framed from its reveal (#173): the route point 1.5 km before its station,
  // at the 50 m low cruise over the floor, heading straight at it. `landmarks.test.ts` checks each
  // still matches `revealPoint` and frames its landmark if the stations change.
  {
    name: 'landmark-tower',
    position: [1883, 93, 1531],
    heading: -0.577,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The watchtower revealed through the outbound cut, standing on the tower approach.',
  },
  {
    name: 'landmark-waterfall',
    position: [5146, 84, 1519],
    heading: 2.572,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The waterfall revealed down the east river reach: ribbon, cliff and its plunge pool.',
  },
  {
    name: 'landmark-tree',
    position: [3689, 100, 3381],
    heading: 1.719,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The lone giant tree revealed past the south bend, on the high south shoulder.',
  },
  {
    name: 'landmark-arch',
    position: [1704, 113, 3555],
    heading: 1.126,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The stone arch revealed round the west bend, lying across the route to fly through.',
  },
  {
    name: 'landmark-ruins',
    position: [241, 87, 2813],
    heading: -0.778,
    bank: 0,
    pitchAngle: 0,
    purpose: 'The ruins revealed through the return notch, on the basin floor by the way home.',
  },
]

export function findShot(name: string | null): ShotBookmark | null {
  if (!name) return null
  return SHOT_BOOKMARKS.find((shot) => shot.name === name) ?? null
}

/** The bookmark named by `?shot=`, or null (unknown names are ignored). */
export function getShotFromUrl(search: string = window.location.search): ShotBookmark | null {
  return findShot(new URLSearchParams(search).get('shot'))
}

let cached: ShotBookmark | null | undefined

/** The active bookmark, read once per page load. Frame loops call this every frame, so it caches. */
export function activeShot(): ShotBookmark | null {
  if (cached === undefined) {
    cached = typeof window === 'undefined' ? null : getShotFromUrl()
  }
  return cached
}

/** Flight state parked at the bookmark, at cruise speed with the springs at rest. */
export function shotFlightState(shot: ShotBookmark, cruiseSpeed: number): FlightState {
  const [x, y, z] = shot.position
  return {
    position: new Vector3(x, y, z),
    orientation: flightOrientation(shot.pitchAngle, shot.heading, shot.bank),
    bank: shot.bank,
    pitchAngle: shot.pitchAngle,
    heading: shot.heading,
    speed: cruiseSpeed,
    bankRate: 0,
    pitchRate: 0,
    // At rest the heading's lagged bank has caught up with the wings (#68).
    yawBank: shot.bank,
    floorContact: 0,
    boosting: false,
    boostTime: 0,
    boostCooldown: 0,
    boostSpent: false,
  }
}

/** Same composition as `flightModel.integrate`: roll about the plane's forward axis, then pitch, then yaw. */
function flightOrientation(pitch: number, heading: number, bank: number): Quaternion {
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading)
  const pitchQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch)
  const roll = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -bank)
  return yaw.multiply(pitchQ).multiply(roll)
}

/**
 * World position of an overridden camera: `cameraOffset` rotated into the heading frame and
 * added to the plane's position. Forward = (-sin h, 0, -cos h), right = (cos h, 0, -sin h).
 */
export function shotCameraPosition(shot: ShotBookmark): [number, number, number] {
  const [right, up, forward] = shot.cameraOffset ?? [0, 0, 0]
  const [x, y, z] = shot.position
  const sin = Math.sin(shot.heading)
  const cos = Math.cos(shot.heading)
  return [x + right * cos - forward * sin, y + up, z - right * sin - forward * cos]
}

/**
 * World position the camera looks at: the plane, plus `lookOffset` rotated into the heading frame.
 */
export function shotLookTarget(shot: ShotBookmark): [number, number, number] {
  const [right, up, forward] = shot.lookOffset ?? [0, 0, 0]
  const [x, y, z] = shot.position
  const sin = Math.sin(shot.heading)
  const cos = Math.cos(shot.heading)
  return [x + right * cos - forward * sin, y + up, z - right * sin - forward * cos]
}

/** The bookmark the attract world parks the plane at, with no `?shot=` set (#153). */
export function titleBookmark(): ShotBookmark {
  const shot = findShot('title')
  if (!shot) throw new Error('the title bookmark is missing from SHOT_BOOKMARKS')
  return shot
}
