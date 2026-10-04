import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  createFrameStats,
  pushFrame,
  resetFrameStats,
  summarizeFrames,
  type FrameSummary,
} from '../debug/frameStats'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { usePerfStore } from '../debug/perfStore'
import {
  buildLadder,
  createGovernorState,
  DEFAULT_GOVERNOR_PARAMS,
  describeRung,
  capRungIndex,
  CAST_GOVERNOR_PARAMS,
  governorParams,
  HITCH_WINDOW_MS,
  resetGovernorTiming,
  stepGovernor,
  type QualitySettings,
} from './adaptiveQuality'
import { useQualityStore } from './qualityStore'

/** About 3 s of frames at 60 fps: the window the p95 is taken over. */
const WINDOW_FRAMES = 180
/** s between governor samples. */
const SAMPLE_INTERVAL = 0.5
/** s after mount (and after each change) before sampling: terrain streaming and shader compiles. */
export const SETTLE_TIME = 3
/**
 * A frame this long is a one-off stall (tab switch, shader compile), not a steady cost, and isn't
 * counted. Kept well above any real frame time: a device stuck at 3 fps must still step down.
 */
export const STALL_MS = 1000

function apply(ladder: readonly QualitySettings[], rung: number, setDpr: (dpr: number) => void) {
  const settings = ladder[rung]
  if (!settings) return
  setDpr(settings.dpr)
  useQualityStore.setState({
    rung,
    rungCount: ladder.length,
    dpr: settings.dpr,
    tier: settings.tier,
    capFps: settings.capFps,
    foliageDensity: settings.foliageDensity,
    viewDistance: settings.viewDistance,
  })
}

/**
 * Mount inside the `<Canvas>`. Measures frame times and walks the quality ladder (#65): pixel
 * ratio, post tier, foliage, view distance. Changes land between frames through R3F's `setDpr`
 * and the quality store; the terrain applies a new view distance on its next chunk crossing. Off
 * when `?fx=` pins the tier, and idle while `paused` (the attract world).
 */
export function QualityGovernor({ paused = false }: { paused?: boolean }) {
  const setDpr = useThree((s) => s.setDpr)
  const ladderRef = useRef<QualitySettings[]>([])
  // Frames are judged against 60 fps until the cap rung, and against 30 fps from there.
  const paramsRef = useRef({ open: DEFAULT_GOVERNOR_PARAMS, capped: CAST_GOVERNOR_PARAMS })
  const capRungRef = useRef(-1)
  const governor = useRef(createGovernorState())
  const stats = useRef(createFrameStats(WINDOW_FRAMES))
  const summary = useRef<FrameSummary>({
    fps: 0,
    meanMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    onePercentLowFps: 0,
  })
  const sinceSample = useRef(0)
  const settle = useRef(SETTLE_TIME)
  const terrainWasReady = useRef(usePerfStore.getState().terrainReady)
  const terrainHitch = useRef(0)

  useEffect(() => {
    const { tier, pinned, capFps } = useQualityStore.getState()
    const start: QualitySettings = {
      dpr: TERRAIN_CONFIG.maxPixelRatio,
      tier,
      capFps,
      foliageDensity: 1,
      viewDistance: TERRAIN_CONFIG.viewDistance,
    }
    // Pinned: one rung, so the governor never moves; the pixel ratio still honours the screen.
    const ladder = buildLadder(start, window.devicePixelRatio || 1)
    ladderRef.current = pinned ? ladder.slice(0, 1) : ladder
    capRungRef.current = capRungIndex(ladderRef.current)
    paramsRef.current = {
      open: governorParams(window.location.search, false),
      capped: governorParams(window.location.search, true),
    }
    governor.current = createGovernorState(0, paramsRef.current.open)
    apply(ladderRef.current, 0, setDpr)
  }, [setDpr])

  useFrame((_state, delta) => {
    const ladder = ladderRef.current
    if (ladder.length < 2) return
    // The attract world renders at a capped 30 fps on purpose; that is not a slow device. Sampling
    // starts fresh, after the usual settle time, once flight begins.
    if (paused) {
      settle.current = SETTLE_TIME
      resetFrameStats(stats.current)
      return
    }
    if (settle.current > 0) {
      settle.current -= delta
      return
    }
    const terrainReady = usePerfStore.getState().terrainReady
    if (terrainReady && !terrainWasReady.current) {
      terrainHitch.current = HITCH_WINDOW_MS / 1000
      governor.current = resetGovernorTiming(governor.current)
      resetFrameStats(stats.current)
      sinceSample.current = 0
    }
    terrainWasReady.current = terrainReady
    if (terrainHitch.current > 0) {
      terrainHitch.current -= delta
      return
    }
    const frameMs = delta * 1000
    if (frameMs < STALL_MS) pushFrame(stats.current, frameMs)

    sinceSample.current += delta
    if (sinceSample.current < SAMPLE_INTERVAL) return
    sinceSample.current = 0

    const { p95Ms } = summarizeFrames(stats.current, summary.current)
    const nowMs = performance.now()
    const params = ladder[governor.current.rung]?.capFps
      ? paramsRef.current.capped
      : paramsRef.current.open
    const { state, change } = stepGovernor(
      governor.current,
      { p95Ms, nowMs },
      ladder.length,
      params,
      capRungRef.current,
    )
    governor.current = state
    if (!change) return

    apply(ladder, state.rung, setDpr)
    useQualityStore.setState({
      lastChange: {
        direction: change,
        // Going up undoes the rung we leave, so name that one.
        label: describeRung(ladder, change === 'down' ? state.rung : state.rung + 1),
        atMs: nowMs,
      },
    })
    // Measure the new rung on its own frames.
    resetFrameStats(stats.current)
    settle.current = 1
  })

  return null
}
