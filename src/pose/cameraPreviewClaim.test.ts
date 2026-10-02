import { afterEach, describe, expect, it } from 'vitest'
import { claimVideo, getVideo } from './cameraService'

function host(): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('claimVideo (#197)', () => {
  const releases: Array<() => void> = []
  const claim = (el: HTMLElement) => {
    const release = claimVideo(el)
    releases.push(release)
    return release
  }

  afterEach(() => {
    releases.splice(0).forEach((release) => release())
    document.body.replaceChildren()
  })

  it('shows the video, mirrored, in the claiming host', () => {
    const a = host()
    claim(a)
    expect(getVideo().parentElement).toBe(a)
    expect(getVideo().style.transform).toBe('scaleX(-1)')
    expect(getVideo().style.opacity).toBe('1')
  })

  it('keeps the video in the newer host when the older one releases late', () => {
    const calibrate = host()
    const wings = host()
    const releaseCalibrate = claim(calibrate)
    claim(wings)
    releaseCalibrate()
    expect(getVideo().parentElement).toBe(wings)
    expect(getVideo().style.opacity).toBe('1')
  })

  it('hands the video back to the older host when the newer one releases first', () => {
    const calibrate = host()
    const wings = host()
    claim(calibrate)
    const releaseWings = claim(wings)
    releaseWings()
    expect(getVideo().parentElement).toBe(calibrate)
    expect(getVideo().style.width).toBe('100%')
  })

  it('returns the video off-screen when the last host releases, and a second release is a no-op', () => {
    const a = host()
    const release = claim(a)
    release()
    expect(getVideo().parentElement).toBe(document.body)
    expect(getVideo().style.opacity).toBe('0')
    expect(getVideo().style.width).toBe('1px')
    const b = host()
    claim(b)
    release()
    expect(getVideo().parentElement).toBe(b)
  })
})
