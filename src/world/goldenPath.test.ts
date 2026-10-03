import { describe, expect, it } from 'vitest'
import {
  GOLDEN_PATH,
  advanceProgress,
  applyRingSpeedGain,
  createGoldenPathRoute,
  crossesGate,
  initialProgress,
  stationsPassed,
  type Gate,
  type LoopProgress,
} from './goldenPath'
import { heightAt } from './heightfield'
import { getLandmarks, visibleFraction } from './landmarks'
import { ROUTE } from './route'
import { GATE_STATIONS, LANDMARK_STATIONS } from './routePoints'
import { TERRAIN_CONFIG } from './terrainConfig'

const route = createGoldenPathRoute()
const { gates } = route

const gateAt = (s: number): Gate => ({
  kind: 'ring',
  s,
  position: { x: 0, y: 0, z: -s },
  normal: { x: 0, z: -1 },
  radius: 10,
})

/** Flies straight down the middle of every gate in `indices`, one frame each. */
function flyThrough(progress: LoopProgress, indices: readonly number[]) {
  let lapCompleted = false
  for (const index of indices) {
    const gate = gates[index]!
    const { position: c, normal: n } = gate
    const from = { x: c.x - n.x * 5, y: c.y, z: c.z - n.z * 5 }
    const to = { x: c.x + n.x * 5, y: c.y, z: c.z + n.z * 5 }
    const step = advanceProgress(progress, stationsPassed(gates, from, to))
    progress = step.progress
    lapCompleted ||= step.lapCompleted
  }
  return { progress, lapCompleted }
}

const all = gates.map((_gate, i) => i)

describe('golden path layout', () => {
  it('runs in route order, from the outbound cut to the return notch', () => {
    const s = GATE_STATIONS.map((station) => station.s)
    expect(s).toEqual([...s].sort((a, b) => a - b))
    expect(gates.at(-1)?.kind).toBe('notch')
    expect(gates.filter((gate) => gate.kind === 'cloud')).toHaveLength(1)
    expect(route.rings.length).toBeGreaterThanOrEqual(12)
  })

  it('puts the notch station on the return notch', () => {
    const notch = TERRAIN_CONFIG.basin.notches[1]
    const station = gates[route.notch]!
    expect(Math.abs(ROUTE.nearest(notch.x, notch.z).s - station.s)).toBeLessThan(20)
  })

  it('keeps every gate in the air over the valley floor', () => {
    for (const gate of gates) {
      if (gate.kind === 'notch') continue
      const ground = Math.max(
        heightAt(gate.position.x, gate.position.z, TERRAIN_CONFIG),
        TERRAIN_CONFIG.waterLevel,
      )
      expect(gate.position.y - GOLDEN_PATH.ringRadius - ground, `s = ${gate.s}`).toBeGreaterThan(20)
    }
  })

  it('keeps the next gate in sight and in the chase view from each gate', () => {
    for (let i = 0; i < gates.length - 1; i++) {
      const here = gates[i]!
      const there = gates[i + 1]!
      if (there.kind === 'notch') continue
      const eye = [here.position.x, here.position.y, here.position.z] as const
      const radius = there.kind === 'ring' ? GOLDEN_PATH.ringRadius : 40
      expect(
        visibleFraction(
          eye,
          there.position.x,
          there.position.z,
          there.position.y - radius,
          radius * 2,
          0,
        ),
        `s = ${here.s} → ${there.s}`,
      ).toBe(1)
      const dx = there.position.x - here.position.x
      const dz = there.position.z - here.position.z
      const cos = (dx * here.normal.x + dz * here.normal.z) / Math.hypot(dx, dz)
      // Inside the chase camera's 60° view, with margin.
      expect(Math.acos(cos), `s = ${here.s} → ${there.s}`).toBeLessThan((25 * Math.PI) / 180)
      expect(there.s - here.s).toBeLessThanOrEqual(800)
    }
  })

  it('keeps rings clear of the landmarks that frame their own beats', () => {
    for (const index of route.rings) {
      const ring = gates[index]!
      for (const landmark of LANDMARK_STATIONS) {
        if (landmark.kind === 'waterfall') continue
        expect(Math.abs(ring.s - landmark.s), `${landmark.kind} at s = ${ring.s}`).toBeGreaterThan(
          140,
        )
      }
    }
  })

  it('lines the ring before the arch up with its opening', () => {
    const arch = getLandmarks().find((landmark) => landmark.kind === 'arch')
    if (!arch) throw new Error('no arch')
    const center = arch.trigger.center
    const before = gates.filter((gate) => gate.kind === 'ring' && gate.s < 11650).at(-1)!
    expect(Math.abs(before.position.y - center[1])).toBeLessThan(15)
  })
})

describe('crossing a gate', () => {
  const gate = gateAt(100)

  it('counts a pass through the disc, even with both frame ends outside it', () => {
    expect(crossesGate({ x: 0, y: 0, z: -90 }, { x: 0, y: 0, z: -110 }, gate)).toBe(true)
    expect(crossesGate({ x: 3, y: 4, z: -99 }, { x: 3, y: 4, z: -100 }, gate)).toBe(true)
  })

  it('ignores a pass outside the disc, backwards, or short of it', () => {
    expect(crossesGate({ x: 12, y: 0, z: -90 }, { x: 12, y: 0, z: -110 }, gate)).toBe(false)
    expect(crossesGate({ x: 0, y: 0, z: -110 }, { x: 0, y: 0, z: -90 }, gate)).toBe(false)
    expect(crossesGate({ x: 0, y: 0, z: -90 }, { x: 0, y: 0, z: -99 }, gate)).toBe(false)
  })

  it('lists every gate one frame passes, in route order', () => {
    const pair = [gateAt(100), gateAt(102)]
    expect(stationsPassed(pair, { x: 0, y: 0, z: -95 }, { x: 0, y: 0, z: -105 })).toEqual([0, 1])
    expect(stationsPassed(pair, { x: 0, y: 0, z: -95 }, { x: 0, y: 0, z: -96 })).toEqual([])
  })
})

describe('lap progress', () => {
  it('completes a lap when every gate is flown in order, then starts the next', () => {
    const { progress, lapCompleted } = flyThrough(initialProgress(gates.length), all)
    expect(lapCompleted).toBe(true)
    expect(progress.laps).toBe(1)
    expect(progress.next).toBe(0)
    expect(progress.passed.every((passed) => !passed)).toBe(true)
    const second = flyThrough(progress, all)
    expect(second.progress.laps).toBe(2)
  })

  it('advances one gate at a time and reports each new pass once', () => {
    const start = initialProgress(gates.length)
    const first = advanceProgress(start, [0])
    expect(first.progress.next).toBe(1)
    expect(first.newlyPassed).toEqual([0])
    const again = advanceProgress(first.progress, [0])
    expect(again.newlyPassed).toEqual([])
    expect(again.progress).toBe(first.progress)
  })

  it('picks up at the next gate after a rejoin, without failing anything', () => {
    const skipped = all.filter((i) => i !== 3 && i !== 4 && i !== route.notch)
    const { progress } = flyThrough(initialProgress(gates.length), skipped.slice(0, 3))
    expect(progress.next).toBe(3)
    // Off the loop, back on it at gate 5.
    const rejoined = advanceProgress(progress, [5])
    expect(rejoined.progress.next).toBe(6)
    expect(rejoined.progress.passed[5]).toBe(true)
    expect(rejoined.progress.passed[3]).toBe(false)
    // Home through the notch: no lap, no penalty, and the next lap starts clean.
    const home = flyThrough(rejoined.progress, [...skipped.slice(4), route.notch])
    expect(home.lapCompleted).toBe(false)
    expect(home.progress.laps).toBe(0)
    expect(home.progress.inOrder).toBe(true)
    expect(flyThrough(home.progress, all).progress.laps).toBe(1)
  })

  it('does not count a lap when a skipped gate is taken out of order', () => {
    const order = [0, 2, 1, ...all.slice(3)]
    expect(flyThrough(initialProgress(gates.length), order).lapCompleted).toBe(false)
  })

  it('does not count the notch alone as a lap', () => {
    const step = advanceProgress(initialProgress(gates.length), [route.notch])
    expect(step.lapCompleted).toBe(false)
    expect(step.progress.laps).toBe(0)
  })
})

describe('ring reward', () => {
  it('adds a small speed reward without exceeding the flight limit', () => {
    const flight = { speed: 67 }
    expect(applyRingSpeedGain(flight, 68)).toBe(68)
  })
})
