import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVideo } from '../pose/cameraService'
import { CameraPreview } from './CameraPreview'

// The calibrate frame's preview unmounts after its exit, once the wings preview has mounted (#197).
describe('CameraPreview handoff (#197)', () => {
  let roots: Root[] = []

  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    // jsdom has no 2D canvas; PoseOverlay skips drawing without one.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    act(() => roots.forEach((root) => root.unmount()))
    roots = []
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function mount(variant: 'corner' | 'calibrate'): Root {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<CameraPreview variant={variant} />))
    roots.push(root)
    return root
  }

  it('keeps the video in the second preview when the first unmounts after it mounts', () => {
    const calibrate = mount('calibrate')
    mount('corner')
    const previews = document.querySelectorAll('[data-testid="camera-preview"]')
    expect(getVideo().parentElement).toBe(previews[1])

    act(() => calibrate.unmount())
    roots = roots.filter((root) => root !== calibrate)

    const [remaining] = document.querySelectorAll('[data-testid="camera-preview"]')
    expect(getVideo().parentElement).toBe(remaining)
    expect(getVideo().style.opacity).toBe('1')
  })
  it('hands the video back to the first preview when the second unmounts first', () => {
    mount('calibrate')
    const corner = mount('corner')

    act(() => corner.unmount())
    roots = roots.filter((root) => root !== corner)

    const [remaining] = document.querySelectorAll('[data-testid="camera-preview"]')
    expect(getVideo().parentElement).toBe(remaining)
    expect(getVideo().style.opacity).toBe('1')
  })
})
