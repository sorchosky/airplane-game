import type { CellRef } from './scatter'

/**
 * Builds and caches per-cell data (a foliage chunk's trees, a grass tile's cards) a few at a time,
 * so a chunk crossing never costs one long frame. Pure TS; the clock is injectable for tests.
 *
 * `want` names the cells needed now, nearest first. `work` builds missing ones until its time
 * budget is spent, and reports whether everything wanted is ready. Cells no longer wanted stay
 * cached (flying back is free) until the cache passes `limit`, then the oldest go first.
 */
export class CellCache<T> {
  private readonly cache = new Map<string, T>()
  private wanted: readonly CellRef[] = []
  private wantedKeys = new Set<string>()

  constructor(
    private readonly build: (cell: CellRef) => T,
    private readonly limit: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  want(cells: readonly CellRef[]): void {
    this.wanted = cells
    this.wantedKeys = new Set(cells.map((cell) => cell.key))
  }

  /** Builds missing wanted cells for up to `budgetMs`. Always builds at least one. */
  work(budgetMs: number): boolean {
    const start = this.now()
    let built = 0
    for (const cell of this.wanted) {
      if (this.cache.has(cell.key)) continue
      if (built > 0 && this.now() - start >= budgetMs) return false
      this.cache.set(cell.key, this.build(cell))
      built++
    }
    this.evict()
    return true
  }

  /** The wanted cells' data, nearest first. Only complete once `work` has returned true. */
  wantedData(): T[] {
    const out: T[] = []
    for (const cell of this.wanted) {
      const data = this.cache.get(cell.key)
      if (data !== undefined) out.push(data)
    }
    return out
  }

  get size(): number {
    return this.cache.size
  }

  clear(): void {
    this.cache.clear()
  }

  private evict(): void {
    if (this.cache.size <= this.limit) return
    // Maps iterate in insertion order, so this drops the oldest cells that aren't wanted.
    for (const key of this.cache.keys()) {
      if (this.cache.size <= this.limit) return
      if (!this.wantedKeys.has(key)) this.cache.delete(key)
    }
  }
}
