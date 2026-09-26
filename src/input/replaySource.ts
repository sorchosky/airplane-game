import { useEffect } from 'react'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { usePoseStore } from '../pose/poseStore'
import { usePoseInterpreter } from './poseSource'
import {
  frameAt,
  frameIndexAt,
  getReplayNameFromUrl,
  hasReplayLoopFlag,
  parseReplayFixture,
  type ReplayFixture,
} from './replayFixture'

export type ReplayPhase = 'idle' | 'loading' | 'playing' | 'ended' | 'error'

/** Playback state for the debug readout and the e2e test hook. Mutated in place, never React state. */
export interface ReplayStatus {
  name: string
  phase: ReplayPhase
  frameIndex: number
  label: string | null
  /** Ms since playback started, as of the last frame written. */
  elapsedMs: number
  error: string | null
}

export const replayStatus: ReplayStatus = {
  name: '',
  phase: 'idle',
  frameIndex: -1,
  label: null,
  elapsedMs: 0,
  error: null,
}

// Fixtures ship as plain JSON assets, fetched only when a replay starts, so they never weigh on
// the game's own bundle.
const FIXTURE_URLS = import.meta.glob<string>('../../tests/fixtures/replays/*.json', {
  query: '?url',
  import: 'default',
})

async function loadFixture(name: string): Promise<ReplayFixture> {
  const load = FIXTURE_URLS[`../../tests/fixtures/replays/${name}.json`]
  if (!load) throw new Error(`replay fixture "${name}" not found in tests/fixtures/replays/`)
  const response = await fetch(await load())
  if (!response.ok) throw new Error(`replay fixture "${name}" failed to load (${response.status})`)
  return parseReplayFixture(await response.json())
}

/**
 * `?input=replay&replay=<fixture>[&loop]`: plays a recorded pose fixture into `poseStore` on the
 * fixture's own timestamps, in place of the camera and MediaPipe, and interprets it exactly as the
 * live pose source does, with `ControlInput.source = 'replay'`. Playback starts from the first
 * frame each time `enabled` turns on (the app enables it from calibrate onward). A frame whose time
 * passed during a long frame is dropped in favour of the latest one, like a real detector falling
 * behind. Without `&loop` the last frame repeats at the fixture's rate after the end.
 */
export function useReplaySource(enabled: boolean): void {
  usePoseInterpreter(enabled, 'replay')

  useEffect(() => {
    if (!enabled) return
    const search = window.location.search
    const name = getReplayNameFromUrl(search)
    const loop = hasReplayLoopFlag(search)
    let cancelled = false
    let removeJob: (() => void) | undefined

    Object.assign(replayStatus, {
      name,
      phase: 'loading',
      frameIndex: -1,
      label: null,
      elapsedMs: 0,
      error: null,
    } satisfies ReplayStatus)

    // Driven by the frame loop, just ahead of the interpreter, rather than by timers: a timer can
    // be starved behind long frames, which would read as a stale detector and drop the gate.
    const play = (fixture: ReplayFixture) => {
      const holdMs = fixture.durationMs / fixture.frames.length
      const lastIndex = fixture.frames.length - 1
      let startMs: number | null = null
      let writtenIndex = -1
      let writtenPass = -1
      let writtenAtMs = -Infinity
      usePoseStore.setState({ modelStatus: 'ready', delegate: null, hz: 1000 / holdMs })
      replayStatus.phase = 'playing'

      const tick = (nowMs: number) => {
        startMs ??= nowMs
        const elapsedMs = nowMs - startMs
        const index = frameIndexAt(fixture, elapsedMs, loop)
        if (index < 0) return
        const pass = loop ? Math.floor(elapsedMs / fixture.durationMs) : 0
        const ended = !loop && index === lastIndex
        const fresh = index !== writtenIndex || pass !== writtenPass
        // Once a fixture without `&loop` ends, its last frame keeps arriving at the fixture's rate.
        if (!fresh && !(ended && nowMs - writtenAtMs >= holdMs)) return

        const frame = frameAt(fixture.frames, index)
        usePoseStore.setState({
          frame: frame.landmarks
            ? {
                landmarks: frame.landmarks,
                worldLandmarks: frame.worldLandmarks ?? [],
                timestampMs: nowMs,
              }
            : null,
          detectedAtMs: nowMs,
        })
        writtenIndex = index
        writtenPass = pass
        writtenAtMs = nowMs
        replayStatus.frameIndex = index
        replayStatus.label = frame.label ?? null
        replayStatus.elapsedMs = elapsedMs
        if (ended) replayStatus.phase = 'ended'
      }

      removeJob = frameLoop.add(tick, FRAME_PRIORITY.detections)
    }

    loadFixture(name).then(
      (fixture) => {
        if (!cancelled) play(fixture)
      },
      (error: unknown) => {
        if (cancelled) return
        replayStatus.phase = 'error'
        replayStatus.error = error instanceof Error ? error.message : String(error)
        console.error(`[replay] ${replayStatus.error}`)
      },
    )

    return () => {
      cancelled = true
      removeJob?.()
      replayStatus.phase = 'idle'
      usePoseStore.setState({ frame: null, detectedAtMs: 0, modelStatus: 'idle', hz: 0 })
    }
  }, [enabled])
}
