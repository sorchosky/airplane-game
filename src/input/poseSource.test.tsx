import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import tiltRight from '../../tests/fixtures/poses/tilt-right.json'
import tposeLevel from '../../tests/fixtures/poses/tpose-level.json'
import { INITIAL_POSE_STATE, usePoseStore } from '../pose/poseStore'
import type { PoseLandmarks } from '../pose/types'
import { useInputStore } from './inputStore'
import { usePoseSource } from './poseSource'
import { NEUTRAL_INPUT } from './types'

function Harness() {
  usePoseSource(true)
  return null
}

function detect(landmarks: PoseLandmarks, tMs: number) {
  usePoseStore.setState({
    frame: { landmarks, worldLandmarks: [], timestampMs: tMs },
    detectedAtMs: tMs,
  })
}

describe('usePoseSource (#66)', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    // No animation frames run in this test: anything the input shows came from the detection.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    container = document.createElement('div')
    root = createRoot(container)
    act(() => root.render(<Harness />))
  })

  afterEach(() => {
    act(() => root.unmount())
    usePoseStore.setState(INITIAL_POSE_STATE)
    useInputStore.setState({ current: NEUTRAL_INPUT })
    vi.restoreAllMocks()
  })

  it('writes ControlInput the moment a detection lands, without waiting for a frame', () => {
    for (let t = 1; t <= 20; t++) detect(tposeLevel as PoseLandmarks, t * 50)
    expect(useInputStore.getState().current.active).toBe(true)
    expect(useInputStore.getState().current.source).toBe('pose')

    detect(tiltRight as PoseLandmarks, 1050)
    expect(useInputStore.getState().current.roll).toBeGreaterThan(0)
  })

  it('interprets each detection once, however often the store is written', () => {
    detect(tposeLevel as PoseLandmarks, 50)
    const first = useInputStore.getState().current
    usePoseStore.setState({ inferenceMs: 12 })
    expect(useInputStore.getState().current).toBe(first)
  })
})
