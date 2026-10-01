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
