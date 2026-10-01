export interface MapBounds {
  centerX: number
  centerZ: number
  sizeMeters: number
  pixels: number
}

/** North (-Z) is up, matching the plane's zero heading. */
export function worldToMapPixel(x: number, z: number, bounds: MapBounds): [number, number] {
  return [
    ((x - bounds.centerX) / bounds.sizeMeters + 0.5) * bounds.pixels,
    ((z - bounds.centerZ) / bounds.sizeMeters + 0.5) * bounds.pixels,
  ]
}

/** Lambert hillshade from height samples and the world-space direction the sun shines from. */
export function hillshade(
  west: number,
  east: number,
  north: number,
  south: number,
  sampleMeters: number,
  sunDirection: readonly [number, number, number],
): number {
  const nx = west - east
  const ny = sampleMeters * 2
  const nz = north - south
  const nl = Math.hypot(nx, ny, nz)
  const sl = Math.hypot(...sunDirection)
  return Math.max(
    0,
    (nx * sunDirection[0] + ny * sunDirection[1] + nz * sunDirection[2]) / (nl * sl),
  )
}
