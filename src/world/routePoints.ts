import type { RouteControlPoint } from './route'

/**
 * Temporary loop for exercising the route systems before the authored route lands in #170.
 * It starts at the current spawn and runs clockwise for roughly 13.5 km.
 */
export const PLACEHOLDER_ROUTE_POINTS: readonly RouteControlPoint[] = [
  { x: 0, z: 0, floorHeight: 72, valleyWidth: 420 },
  { x: 340, z: -900, floorHeight: 58, valleyWidth: 360 },
  { x: 1250, z: -1560, floorHeight: 46, valleyWidth: 330 },
  { x: 2500, z: -1800, floorHeight: 38, valleyWidth: 380 },
  { x: 3750, z: -1560, floorHeight: 52, valleyWidth: 440 },
  { x: 4660, z: -900, floorHeight: 86, valleyWidth: 520 },
  { x: 5000, z: 0, floorHeight: 110, valleyWidth: 480 },
  { x: 4660, z: 900, floorHeight: 92, valleyWidth: 400 },
  { x: 3750, z: 1560, floorHeight: 64, valleyWidth: 350 },
  { x: 2500, z: 1800, floorHeight: 44, valleyWidth: 390 },
  { x: 1250, z: 1560, floorHeight: 55, valleyWidth: 460 },
  { x: 340, z: 900, floorHeight: 78, valleyWidth: 500 },
]
