import { useEffect, useRef, useState } from 'react'
import { color, lightingPresets, space, type } from '../styles/tokens'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import type { WorldMapResult } from './worldMap.worker'
import { hillshade, worldToMapPixel, type MapBounds } from './worldMapMath'

const MAP_PIXELS = 768

export interface RoutePoint {
  x: number
  z: number
}

interface WorldMapProps {
  sizeKm: number
  /** Future route-authoring tickets can supply a closed world-space polyline here. */
  route?: readonly RoutePoint[]
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function terrainBand(height: number, slope: number): [number, number, number] {
  if (height <= TERRAIN_CONFIG.waterLevel) return rgb(color.waterShallow)
  if (height < TERRAIN_CONFIG.waterLevel + TERRAIN_CONFIG.bands.sandHeight) return rgb(color.sand)
  if (height >= TERRAIN_CONFIG.bands.snowHeight) return rgb(color.snow)
  if (slope >= TERRAIN_CONFIG.bands.rockSlope) return rgb(color.rock)
  return height > 180 ? rgb(color.grassLight) : rgb(color.grassShadow)
}

function drawRouteOverlay(
  context: CanvasRenderingContext2D,
  route: readonly RoutePoint[],
  bounds: MapBounds,
): void {
  if (route.length < 2) return
  context.save()
  context.strokeStyle = color.planeStripe
  context.lineWidth = 4
  context.setLineDash([12, 8])
  context.beginPath()
  route.forEach((point, index) => {
    const [x, y] = worldToMapPixel(point.x, point.z, bounds)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  context.stroke()
  context.restore()
}

function drawMap(
  context: CanvasRenderingContext2D,
  data: WorldMapResult,
  sizeMeters: number,
  route: readonly RoutePoint[],
): void {
  const samples = Math.sqrt(data.heights.length)
  const image = context.createImageData(samples - 2, samples - 2)
  const sun = lightingPresets.morning.sunDirection
  for (let row = 1; row < samples - 1; row++) {
    for (let column = 1; column < samples - 1; column++) {
      const at = row * samples + column
      const height = data.heights[at] ?? 0
      const west = data.heights[at - 1] ?? height
      const east = data.heights[at + 1] ?? height
      const north = data.heights[at - samples] ?? height
      const south = data.heights[at + samples] ?? height
      const sampleMeters = sizeMeters / (samples - 1)
      const normalY = (sampleMeters * 2) / Math.hypot(west - east, sampleMeters * 2, north - south)
      const base = terrainBand(height, 1 - normalY)
      const shade =
        height <= TERRAIN_CONFIG.waterLevel
          ? 1
          : 0.5 + hillshade(west, east, north, south, sampleMeters, sun) * 0.5
      const pixel = ((row - 1) * (samples - 2) + column - 1) * 4
      image.data[pixel] = base[0] * shade
      image.data[pixel + 1] = base[1] * shade
      image.data[pixel + 2] = base[2] * shade
      image.data[pixel + 3] = 255
    }
  }
  const bitmap = document.createElement('canvas')
  bitmap.width = samples - 2
  bitmap.height = samples - 2
  bitmap.getContext('2d')?.putImageData(image, 0, 0)
  context.imageSmoothingEnabled = true
  context.drawImage(bitmap, 0, 0, MAP_PIXELS, MAP_PIXELS)

  const bounds = { centerX: data.spawn.x, centerZ: data.spawn.z, sizeMeters, pixels: MAP_PIXELS }
  context.font = `500 16px ${type.fontBody}`
  context.textBaseline = 'top'
  context.lineWidth = 1
  context.strokeStyle = color.line
  context.fillStyle = color.textPrimary
  const half = sizeMeters / 2
  const firstX = Math.ceil((data.spawn.x - half) / 1000) * 1000
  const firstZ = Math.ceil((data.spawn.z - half) / 1000) * 1000
  for (let x = firstX; x <= data.spawn.x + half; x += 1000) {
    const [px] = worldToMapPixel(x, data.spawn.z, bounds)
    context.beginPath()
    context.moveTo(px, 0)
    context.lineTo(px, MAP_PIXELS)
    context.stroke()
    context.fillText(`${Math.round((x - data.spawn.x) / 1000)} km`, px + 4, 4)
  }
  for (let z = firstZ; z <= data.spawn.z + half; z += 1000) {
    const [, py] = worldToMapPixel(data.spawn.x, z, bounds)
    context.beginPath()
    context.moveTo(0, py)
    context.lineTo(MAP_PIXELS, py)
    context.stroke()
    context.fillText(`${Math.round((data.spawn.z - z) / 1000)} km`, 4, py + 4)
  }

  context.strokeStyle = lightingPresets.morning.sun
  context.fillStyle = lightingPresets.morning.sun
  context.lineWidth = 3
  for (const ring of data.rings) {
    const [x, y] = worldToMapPixel(ring.x, ring.z, bounds)
    context.beginPath()
    context.arc(x, y, 7, 0, Math.PI * 2)
    context.stroke()
  }
  if (data.gate) {
    const [x, y] = worldToMapPixel(data.gate.x, data.gate.z, bounds)
    context.strokeRect(x - 8, y - 8, 16, 16)
  }

  context.font = `600 18px ${type.fontBody}`
  for (const landmark of data.landmarks) {
    const [x, y] = worldToMapPixel(landmark.x, landmark.z, bounds)
    context.fillStyle = color.outline
    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = color.textPrimary
    context.lineWidth = 3
    context.strokeText(landmark.kind.toUpperCase(), x + 9, y - 10)
    context.fillStyle = color.outline
    context.fillText(landmark.kind.toUpperCase(), x + 9, y - 10)
  }

  const [spawnX, spawnY] = worldToMapPixel(data.spawn.x, data.spawn.z, bounds)
  context.fillStyle = color.planeStripe
  context.beginPath()
  context.moveTo(spawnX, spawnY - 15)
  context.lineTo(spawnX - 9, spawnY + 10)
  context.lineTo(spawnX, spawnY + 6)
  context.lineTo(spawnX + 9, spawnY + 10)
  context.closePath()
  context.fill()
  context.fillText('SPAWN', spawnX + 14, spawnY - 10)
  drawRouteOverlay(context, route, bounds)
}

export function WorldMap({ sizeKm, route = [] }: WorldMapProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('Sampling terrain…')

  useEffect(() => {
    const worker = new Worker(new URL('./worldMap.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorldMapResult>) => {
      const context = canvas.current?.getContext('2d')
      if (context) drawMap(context, event.data, sizeKm * 1000, route)
      setStatus('Map ready')
      worker.terminate()
    }
    worker.postMessage({ sizeMeters: sizeKm * 1000, samples: MAP_PIXELS + 2 })
    return () => worker.terminate()
  }, [route, sizeKm])

  return (
    <main
      style={{
        minHeight: '100%',
        background: color.surfaceSolid,
        padding: space.lg,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <section style={{ display: 'grid', gap: space.sm, width: 'min(92vmin, 960px)' }}>
        <header
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <h1
            style={{ margin: 0, font: `${type.weightDisplay} ${type.tvTitle} ${type.fontDisplay}` }}
          >
            WORLD MAP
          </h1>
          <span aria-live="polite" style={{ color: color.textMuted, fontSize: type.tvCaption }}>
            {status} · {sizeKm} km
          </span>
        </header>
        <canvas
          ref={canvas}
          width={MAP_PIXELS}
          height={MAP_PIXELS}
          data-testid="world-map"
          aria-label={`${sizeKm} kilometre world map centred on spawn`}
          style={{ width: '100%', aspectRatio: '1', border: `1px solid ${color.line}` }}
        />
      </section>
    </main>
  )
}
