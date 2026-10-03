import { describe, expect, it } from 'vitest'
import { CellCache } from './cellCache'
import type { CellRef } from './scatter'

const cell = (x: number): CellRef => ({ x, z: 0, key: `${x},0`, distance: x })

describe('CellCache', () => {
  it('builds wanted cells a few per call within its budget', () => {
    let clock = 0
    const built: string[] = []
    const cache = new CellCache(
      (c) => {
        clock += 1
        built.push(c.key)
        return c.x
      },
      100,
      () => clock,
    )
    cache.want([cell(0), cell(1), cell(2), cell(3)])
    expect(cache.work(2)).toBe(false)
    expect(built).toEqual(['0,0', '1,0'])
    expect(cache.work(10)).toBe(true)
    expect(cache.wantedData()).toEqual([0, 1, 2, 3])
  })

  it('always makes progress, even with no budget', () => {
    const cache = new CellCache(
      (c) => c.x,
      100,
      () => 0,
    )
    cache.want([cell(0), cell(1)])
    cache.work(0)
    expect(cache.size).toBeGreaterThan(0)
  })

  it('keeps unwanted cells until the limit, then drops the oldest', () => {
    const cache = new CellCache(
      (c) => c.x,
      3,
      () => 0,
    )
    cache.want([cell(0), cell(1)])
    cache.work(Infinity)
    cache.want([cell(2), cell(3)])
    cache.work(Infinity)
    expect(cache.size).toBe(3)
    expect(cache.wantedData()).toEqual([2, 3])
    // 0 was evicted as the oldest unwanted cell, 1 survived and needs no rebuild.
    let rebuilt = 0
    const counting = new CellCache(
      (c) => {
        rebuilt++
        return c.x
      },
      3,
      () => 0,
    )
    counting.want([cell(0), cell(1)])
    counting.work(Infinity)
    counting.want([cell(2), cell(3)])
    counting.work(Infinity)
    counting.want([cell(1), cell(2), cell(3)])
    counting.work(Infinity)
    expect(rebuilt).toBe(4)
  })

  it('rekey moves cached cells to new keys without rebuilding them (#177)', () => {
    let rebuilt = 0
    const cache = new CellCache(
      (c) => {
        rebuilt++
        return { x: c.x }
      },
      10,
      () => 0,
    )
    cache.want([cell(0), cell(1)])
    cache.work(Infinity)
    cache.rekey((_key, data) => {
      data.x += 5
      return cell(data.x).key
    })
    cache.want([cell(5), cell(6)])
    expect(cache.work(Infinity)).toBe(true)
    expect(rebuilt).toBe(2)
    expect(cache.wantedData()).toEqual([{ x: 5 }, { x: 6 }])
  })
})
