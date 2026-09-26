import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FLIGHT_PARAMS, createInitialFlightState, step } from '../flight/flightModel'
import { LatencyProbe, createLatencySummary } from './latencyProbe'

const deg = (d: number) => (d * Math.PI) / 180

describe('LatencyProbe', () => {
  it('records every hop for a pose-driven input', () => {
    const probe = new LatencyProbe()
    probe.markCameraFrame(1000, 1040, true)
    probe.markDetect(1050, 1075)
    probe.markInput(0.5, 1083)
    // Bank hasn't moved yet.
    probe.markFrame(0, 1090)
    expect(probe.isArmed).toBe(true)
    probe.markFrame(deg(0.2), 1107)
    expect(probe.isArmed).toBe(true)
    probe.markFrame(deg(0.6), 1123)
    expect(probe.isArmed).toBe(false)

    const s = probe.summarize(createLatencySummary())
    expect(s.count).toBe(1)
    expect(s.cameraStampReal).toBe(true)
    expect(s.p50.wait).toBe(50)
    expect(s.p50.infer).toBe(25)
    expect(s.p50.handoff).toBe(8)
    expect(s.p50.respond).toBe(40)
    expect(s.p50.total).toBe(123)
  })

  it('falls back to the callback time when the camera has no capture stamp', () => {
    const probe = new LatencyProbe()
    probe.markCameraFrame(Number.NaN, 2000, false)
    probe.markDetect(2010, 2030)
    probe.markInput(0.5, 2035)
    probe.markFrame(deg(1), 2050)
    const s = probe.summarize(createLatencySummary())
    expect(s.cameraStampReal).toBe(false)
    expect(s.p50.wait).toBe(10)
    expect(s.p50.total).toBe(50)
  })

  it('records only the response hop for keyboard input (no detection)', () => {
    const probe = new LatencyProbe()
    probe.markInput(0.5, 100)
    probe.markFrame(deg(1), 116)
    const s = probe.summarize(createLatencySummary())
    expect(s.count).toBe(1)
    expect(s.p50.respond).toBe(16)
    expect(s.p50.wait).toBe(0)
    expect(s.p50.total).toBe(0)
  })

  it('ignores small input changes and does not double-arm', () => {
    const probe = new LatencyProbe()
    probe.markInput(0.05, 0)
    expect(probe.isArmed).toBe(false)
    probe.markInput(0.5, 10)
    probe.markInput(0.9, 20)
    probe.markFrame(deg(1), 30)
    const s = probe.summarize(createLatencySummary())
    expect(s.count).toBe(1)
    expect(s.p50.respond).toBe(20)
  })

  it('drops a sample whose input never moved the plane', () => {
    const probe = new LatencyProbe({
      rollThreshold: 0.1,
      bankThreshold: deg(0.5),
      timeoutMs: 100,
      ringSize: 4,
    })
    probe.markInput(0.5, 0)
    probe.markFrame(0, 50)
    probe.markFrame(0, 150)
    expect(probe.isArmed).toBe(false)
    expect(probe.summarize(createLatencySummary()).count).toBe(0)
  })

  it('does not attribute a stale detection to a later keyboard-style input', () => {
    const probe = new LatencyProbe()
    probe.markCameraFrame(0, 0, true)
    probe.markDetect(5, 20)
    probe.markInput(0.5, 30)
    probe.markFrame(deg(1), 40)
    // A second input with no new detection: still counted as coming from the same stale frame?
    // No: the detection end (20) is before this input (500) and the sample already used it, but
    // the probe only knows "newer than now", so it attributes it. Guard by resetting stamps.
    probe.markDetect(Number.NaN, Number.NaN)
    probe.markInput(-0.5, 500)
    probe.markFrame(-deg(1), 510)
    const s = probe.summarize(createLatencySummary())
    expect(s.count).toBe(2)
    // Only the first sample had camera hops, so p95 of total is from one sample.
    expect(s.p95.total).toBe(40)
  })

  it('keeps p50 and p95 over a ring of samples', () => {
    const probe = new LatencyProbe({
      rollThreshold: 0.1,
      bankThreshold: deg(0.5),
      timeoutMs: 1000,
      ringSize: 8,
    })
    let t = 0
    let roll = 0
    for (let i = 1; i <= 8; i++) {
      roll = roll > 0 ? -0.5 : 0.5
      probe.markInput(roll, t)
      probe.markFrame(deg(i % 2 === 0 ? 1 : -1), t + i * 10)
      t += 1000
    }
    const s = probe.summarize(createLatencySummary())
    expect(s.count).toBe(8)
    expect(s.p50.respond).toBe(40)
    expect(s.p95.respond).toBe(80)
  })

  it('measures the real flight model: a 0.1 roll step becomes a visible bank in ~60 ms', () => {
    // Simulated 60 Hz chain, keyboard input, current spring constants. This is the "respond"
    // hop of docs/perf.md, independent of hardware.
    const probe = new LatencyProbe()
    let flight = createInitialFlightState(DEFAULT_FLIGHT_PARAMS, new Vector3(0, 120, 0))
    const dt = 1 / 60
    let nowMs = 0
    const idle = { roll: 0, pitch: 0, active: true, confidence: 1, source: 'keyboard' as const }
    const tilt = { ...idle, roll: 0.1 }
    for (let i = 0; i < 30; i++) {
      flight = step(flight, idle, dt, DEFAULT_FLIGHT_PARAMS)
      nowMs += dt * 1000
      probe.markFrame(flight.bank, nowMs)
    }
    probe.markInput(tilt.roll, nowMs)
    let frames = 0
    while (probe.isArmed && frames < 120) {
      flight = step(flight, tilt, dt, DEFAULT_FLIGHT_PARAMS)
      nowMs += dt * 1000
      frames += 1
      probe.markFrame(flight.bank, nowMs)
    }
    const s = probe.summarize(createLatencySummary())
    expect(s.count).toBe(1)
    // 5° commanded, critically damped 0.35 s spring: 0.5° takes a handful of frames.
    expect(frames).toBeGreaterThanOrEqual(3)
    expect(frames).toBeLessThanOrEqual(6)
    expect(s.p50.respond).toBeCloseTo(frames * (1000 / 60), 3)
  })
})
