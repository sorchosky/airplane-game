import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { usePerfStore } from '../debug/perfStore'
import { isWorldReady } from './worldReadiness'
import { useWorldStore } from './worldStore'

/**
 * Inside the canvas: counts rendered frames and tells the world store when the first terrain is
 * drawn, so the poster can fade (#153). Reads `perfStore`, which `Terrain` keeps current, and
 * stops looking once ready.
 */
export function WorldWatcher() {
  const frames = useRef(0)

  useFrame(() => {
    if (useWorldStore.getState().status === 'ready') return
    frames.current += 1
    const { terrainReady, terrainTiles } = usePerfStore.getState()
    if (isWorldReady({ terrainReady, terrainTiles, framesRendered: frames.current })) {
      useWorldStore.getState().markReady()
    }
  })

  return null
}
