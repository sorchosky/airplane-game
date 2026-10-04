import type { RouteControlPoint } from './route'

/**
 * The clockwise authored loop from #170. Point zero is the home-basin spawn and the next point is
 * the outbound cut that the authored spawn heading faces. Heights and widths are the target valley
 * floor, not samples of the terrain that #171 will replace.
 */
export const ROUTE_POINTS: readonly RouteControlPoint[] = [
  { x: 1750, z: 2000, floorHeight: 40, valleyWidth: 560 },
  { x: 1938, z: 1248, floorHeight: 46, valleyWidth: 360 },
  { x: 2408, z: 402, floorHeight: 60, valleyWidth: 320 },
  { x: 3442, z: -162, floorHeight: 78, valleyWidth: 380 },
  { x: 4570, z: 308, floorHeight: 54, valleyWidth: 440 },
  { x: 5134, z: 1248, floorHeight: 36, valleyWidth: 520 },
  { x: 4852, z: 2470, floorHeight: 34, valleyWidth: 480 },
  { x: 3818, z: 3316, floorHeight: 48, valleyWidth: 400 },
  { x: 2502, z: 3692, floorHeight: 70, valleyWidth: 340 },
  { x: 1092, z: 3316, floorHeight: 52, valleyWidth: 380 },
  { x: 152, z: 2658, floorHeight: 34, valleyWidth: 460 },
  { x: 622, z: 2094, floorHeight: 35, valleyWidth: 500 },
]

/** Where a landmark stands along the loop (#173). */
export interface LandmarkStation {
  readonly kind: 'tower' | 'arch' | 'waterfall' | 'tree' | 'ruins' | 'town'
  /** m of route from spawn: the station, the beat that frames the landmark */
  readonly s: number
  /**
   * m off the route at the station, with the sign of `NearestRoutePoint.lateral`: positive is the
   * pilot's right, flying the loop clockwise.
   */
  readonly lateral: number
  /**
   * m of route before the station it is first seen, where that is not the landmarks' 1.5 km. The
   * town's is the sea's: the reach curves away from the sea, so the break in its east wall shows
   * down the floor from further back.
   */
  readonly reveal?: number
}

/**
 * The landmarks' stations from `docs/world-route.md`, each revealed 1.5 km earlier along the
 * route. Every one stands on the valley floor, clear of the centreline but the arch, which the
 * route flies through. Two departures from the #170 table: the tree and the waterfall swap, since
 * only the low east reach can hold the waterfall's pool under the one water plane, and the arch and
 * the ruins move 350 m and 100 m to floor that passes the dry-ground rule.
 */
export const LANDMARK_STATIONS: readonly LandmarkStation[] = [
  { kind: 'tower', s: 2000, lateral: 120 },
  { kind: 'town', s: 5500, lateral: -195, reveal: 2300 },
  { kind: 'waterfall', s: 7100, lateral: 200 },
  { kind: 'tree', s: 9600, lateral: 80 },
  { kind: 'arch', s: 11650, lateral: 0 },
  { kind: 'ruins', s: 13300, lateral: -200 },
]

/** One gate of the golden path (#175) along the loop. */
export interface GateStation {
  /** `ring`: a wind ring. `cloud`: the cumulus gate (#163). `notch`: the return notch, the lap line. */
  readonly kind: 'ring' | 'cloud' | 'notch'
  /** m of route from spawn */
  readonly s: number
}

/**
 * The golden path's gates, in route order. Rings sit about 750 m apart, so the next one is in
 * view from the current one, and keep clear of the tower, the tree and the arch, which frame
 * their own beats. The cloud gate takes the high east bend's descent toward the river. The notch
 * station is the return notch's route point (`TERRAIN_CONFIG.basin.notches[1]`), and is last.
 */
export const GATE_STATIONS: readonly GateStation[] = [
  { kind: 'ring', s: 400 },
  { kind: 'ring', s: 1150 },
  { kind: 'ring', s: 1850 },
  { kind: 'ring', s: 2650 },
  { kind: 'ring', s: 3400 },
  { kind: 'ring', s: 4150 },
  { kind: 'cloud', s: 4900 },
  { kind: 'ring', s: 5650 },
  { kind: 'ring', s: 6400 },
  { kind: 'ring', s: 7150 },
  { kind: 'ring', s: 7900 },
  { kind: 'ring', s: 8650 },
  { kind: 'ring', s: 9300 },
  { kind: 'ring', s: 10050 },
  { kind: 'ring', s: 10800 },
  { kind: 'ring', s: 11400 },
  { kind: 'ring', s: 11950 },
  { kind: 'notch', s: 12750 },
]
