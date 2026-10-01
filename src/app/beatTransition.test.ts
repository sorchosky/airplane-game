import { describe, expect, it, vi } from 'vitest'
import { createBeatController, type BeatAnimation, type BeatPlayer } from './beatTransition'
import type { Beat } from './frontDoorBeats'

function fakeAnimation() {
  let resolve!: () => void
  const finished = new Promise<void>((r) => (resolve = r))
  const anim = { reverse: vi.fn(), cancel: vi.fn(), finished, resolve }
  return anim satisfies BeatAnimation & { resolve: () => void }
}
type Fake = ReturnType<typeof fakeAnimation>

const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(animated = true) {
  const exits: Fake[] = []
  const enters: Fake[] = []
  const shows: Beat[] = []
  const player: BeatPlayer = {
    exit: () => {
      if (!animated) return null
      const a = fakeAnimation()
      exits.push(a)
      return a
    },
    enter: () => {
      if (!animated) return null
      const a = fakeAnimation()
      enters.push(a)
      return a
    },
  }
  const controller = createBeatController(player, (b) => shows.push(b), 'masthead')
  return { controller, exits, enters, shows }
}

describe('createBeatController', () => {
  it('hard cuts swap immediately when there is nothing to play', () => {
    const { controller, shows } = setup(false)
    controller.go('choose')
    expect(controller.shown()).toBe('choose')
    expect(shows).toEqual(['choose'])
  })

  it('exits the old beat, swaps, then enters the new one', async () => {
    const { controller, exits, enters, shows } = setup()
    controller.go('choose')
    expect(controller.shown()).toBe('masthead')
    expect(exits).toHaveLength(1)
    exits[0]!.resolve()
    await tick()
    expect(shows).toEqual(['choose'])
    expect(enters).toHaveLength(1)
  })

  it('retargets a change mid-exit without a second exit', async () => {
    const { controller, exits, shows } = setup()
    controller.go('choose')
    controller.go('position')
    expect(exits).toHaveLength(1)
    exits[0]!.resolve()
    await tick()
    expect(shows).toEqual(['position'])
  })

  it('reverses an exit when the change goes back, and never swaps', async () => {
    const { controller, exits, shows } = setup()
    controller.go('choose')
    controller.go('masthead')
    expect(exits[0]!.reverse).toHaveBeenCalledTimes(1)
    exits[0]!.resolve()
    await tick()
    expect(shows).toEqual([])
    expect(controller.shown()).toBe('masthead')
  })

  it('reverses a running enter and swaps once it has run back out', async () => {
    const { controller, exits, enters, shows } = setup()
    controller.go('choose')
    exits[0]!.resolve()
    await tick()
    controller.go('masthead')
    expect(enters[0]!.reverse).toHaveBeenCalledTimes(1)
    expect(exits).toHaveLength(1)
    enters[0]!.resolve()
    await tick()
    expect(shows).toEqual(['choose', 'masthead'])
    expect(enters).toHaveLength(2)
  })

  it('ignores a repeat of the current target and cancels on dispose', () => {
    const { controller, exits } = setup()
    controller.go('choose')
    controller.go('choose')
    expect(exits).toHaveLength(1)
    controller.dispose()
    expect(exits[0]!.cancel).toHaveBeenCalled()
  })
})
