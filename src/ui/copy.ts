// Every player-facing string, in one place (#28). Voice: short, second person, a little
// adventurous, no jargon. It's read from a couch ~3 m away, so fewer words beat more detail.

export const copy = {
  title: {
    name: 'Driftwing',
    start: 'Start',
  },

  calibrate: {
    modelLoading: 'Warming up motion tracking…',
    modelErrorTitle: "Motion tracking didn't load",
    modelErrorBody: 'Check your connection, then try again.',
    modelRetry: 'Try again',
    keyboardFallback: 'Fly with the keyboard instead',
    cameraLost: 'Lost the camera. Reconnecting…',
    stepBack: 'Step back until your head and hips are in view',
    comeCloser: 'Come a little closer',
    spreadArms: 'Spread your arms like wings',
    holdSteady: 'Hold steady…',
  },

  hud: {
    spreadArms: 'Spread your arms to fly',
    stepIntoView: 'Step into view',
    cameraLost: 'Lost the camera. Reconnecting…',
    warm: 'Your phone is getting warm',
    clockLabel: 'Time of day',
  },

  pause: {
    title: 'Paused',
    resume: 'Resume',
    recalibrate: 'Recalibrate',
    quit: 'Quit to title',
    gestureHint: 'Tilt to choose. Hold your arms level to pick.',
    stepIntoView: 'Step into view and spread your arms to choose',
    keyboardHint: '← → to choose, Enter to pick, Esc to resume',
  },

  orientation: {
    title: 'Turn your phone sideways',
    body: 'Driftwing flies in landscape.',
  },

  error: {
    generic: 'Something went wrong. Give it another go.',
    retry: 'Try again',
    cameraDenied: 'We need your camera to see you fly. Allow it in your browser settings.',
    cameraFailed: "Your camera didn't start. Give it another go.",
  },

  // `?debug` only; never shown to players.
  debug: {
    record: 'Record pose',
    stopAndSave: 'Stop and save',
  },
} as const
