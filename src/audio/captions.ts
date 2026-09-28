/** X5 subscribes here to render localized sound captions; audio can be muted independently. */
export type AudioCaptionKey =
  | 'audio.engaged'
  | 'audio.disengaged'
  | 'audio.countdown'
  | 'audio.lockIn'
  | 'audio.titleSwell'
  | 'audio.cloudWhoosh'
  | 'audio.landmarkWhoosh'
  | 'audio.lowPass'
  | 'audio.ring'

export type CaptionListener = (key: AudioCaptionKey) => void
const listeners = new Set<CaptionListener>()

export function onAudioCaption(listener: CaptionListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitAudioCaption(key: AudioCaptionKey): void {
  for (const listener of listeners) listener(key)
}
