import { useEffect, useRef, useState } from 'react'
import { onAudioCaption, type AudioCaptionKey } from '../audio/captions'
import { useAccessibilityStore } from '../app/accessibilityStore'
import { color, space, type } from '../styles/tokens'
import { copy } from './copy'

const SHOW_MS = 1000

const CAPTIONS: Record<AudioCaptionKey, string> = {
  'audio.engaged': copy.captions.engaged,
  'audio.disengaged': copy.captions.disengaged,
  'audio.countdown': copy.captions.countdown,
  'audio.lockIn': copy.captions.lockIn,
  'audio.titleSwell': copy.captions.titleSwell,
  'audio.cloudWhoosh': copy.captions.cloudWhoosh,
  'audio.landmarkWhoosh': copy.captions.landmarkWhoosh,
  'audio.lowPass': copy.captions.lowPass,
  'audio.ring': copy.captions.ring,
}

/** One-second, bottom-centre descriptions for every discrete audio event. */
export function AudioCaptions() {
  const enabled = useAccessibilityStore((s) => s.captions)
  const [caption, setCaption] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!enabled) {
      setCaption(null)
      return
    }
    return onAudioCaption((key) => {
      clearTimeout(timer.current)
      setCaption(CAPTIONS[key])
      timer.current = setTimeout(() => setCaption(null), SHOW_MS)
    })
  }, [enabled])

  useEffect(() => () => clearTimeout(timer.current), [])
  if (!caption) return null
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="audio-caption"
      style={{
        position: 'absolute',
        bottom: space.xxl,
        left: '50%',
        transform: 'translateX(-50%)',
        margin: 0,
        padding: `${space.sm} ${space.lg}`,
        borderRadius: space.sm,
        background: color.surfaceScrim,
        color: color.textPrimary,
        fontFamily: type.fontBody,
        fontSize: type.tvCaption,
        whiteSpace: 'nowrap',
      }}
    >
      {caption}
    </p>
  )
}
