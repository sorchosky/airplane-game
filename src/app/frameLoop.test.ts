import { describe, expect, it, vi } from 'vitest'
import { FRAME_PRIORITY, createFrameLoop, type FrameScheduler } from './frameLoop'

function fakeScheduler() {
  const pending = new Map<number, (nowMs: number) => void>()
  let nextHandle = 1
  const scheduler: FrameScheduler = {
    request: vi.fn((callback) => {
      const handle = nextHandle++
      pending.set(handle, callback)
      return handle
    }),
    cancel: vi.fn((handle: number) => {
      pending.delete(handle)
    }),
  }
  const flush = (nowMs: number) => {
    const callbacks = [...pending.values()]
    pending.clear()
    for (const callback of callbacks) callback(nowMs)
  }
  return { scheduler, flush, pending }
}

describe('createFrameLoop', () => {
  it('requests one frame for any number of jobs and runs them in priority order', () => {
    const { scheduler, flush } = fakeScheduler()
    const loop = createFrameLoop(scheduler)
    const order: string[] = []
    loop.add(() => order.push('audio'), FRAME_PRIORITY.audio)
    loop.add(() => order.push('control'), FRAME_PRIORITY.control)
    loop.add(() => order.push('input-a'), FRAME_PRIORITY.input)
    loop.add(() => order.push('input-b'), FRAME_PRIORITY.input)
    expect(scheduler.request).toHaveBeenCalledTimes(1)

    flush(16)
    expect(order).toEqual(['input-a', 'input-b', 'control', 'audio'])
    // The next frame was requested once, after the jobs ran.
    expect(scheduler.request).toHaveBeenCalledTimes(2)
  })

  it('passes the frame time and the delta since the previous frame', () => {
    const { scheduler, flush } = fakeScheduler()
    const loop = createFrameLoop(scheduler)
    const seen: Array<[number, number]> = []
    loop.add((now, delta) => seen.push([now, delta]), 0)
    flush(100)
    flush(116.5)
    expect(seen).toEqual([
      [100, 0],
      [116.5, 16.5],
    ])
  })

  it('stops requesting frames once the last job is removed', () => {
    const { scheduler, flush } = fakeScheduler()
    const loop = createFrameLoop(scheduler)
    const remove = loop.add(() => undefined, 0)
    flush(0)
    remove()
    expect(loop.size).toBe(0)
    expect(scheduler.cancel).toHaveBeenCalledTimes(1)
    // Re-adding starts a fresh loop with a fresh delta.
    const deltas: number[] = []
    loop.add((_now, delta) => deltas.push(delta), 0)
    flush(500)
    expect(deltas).toEqual([0])
  })

  it('lets a job remove itself mid-frame without skipping the next job', () => {
    const { scheduler, flush } = fakeScheduler()
    const loop = createFrameLoop(scheduler)
    const order: string[] = []
    const removeFirst = loop.add(() => {
      order.push('first')
      removeFirst()
    }, 0)
    loop.add(() => order.push('second'), 0)
    flush(0)
    expect(order).toEqual(['first', 'second'])
    expect(loop.size).toBe(1)
  })

  it('tick runs the jobs without the scheduler', () => {
    const loop = createFrameLoop(fakeScheduler().scheduler)
    let ran = 0
    loop.add(() => {
      ran += 1
    }, 0)
    loop.tick(0)
    loop.tick(16)
    expect(ran).toBe(2)
  })
})
