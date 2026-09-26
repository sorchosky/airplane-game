// Every player-facing string, in one place (#28). Voice: short, second person, a little
// adventurous, no jargon. It's read from a couch ~3 m away, so fewer words beat more detail.

export const copy = {
  title: {
    name: 'Driftwing',
    start: 'Start',
    tagline: 'Fly with your arms. Cast to a TV.',
    // Screen-reader text for the looping pose demonstration under Start.
    demoLabel: 'Arms out to fly, lean to turn, raise your arms to climb',
  },

  // Storyboard frame 01: shown while the browser's camera prompt is open, and again if it's denied.
  cameraAsk: {
    body: 'We need your camera to see you fly. Nothing leaves your phone.',
    denied: 'Allow the camera in your browser settings',
    retry: 'Try again',
  },

  calibrate: {
    modelLoading: 'Warming up motion tracking…',
    modelErrorTitle: "Motion tracking didn't load",
    modelErrorBody: 'Check your connection, then try again.',
    modelRetry: 'Try again',
    keyboardFallback: 'Fly with the keyboard instead',
    cameraLost: 'Lost the camera. Reconnecting…',
    // One line per failing check (storyboard frame 02); the target silhouette does the rest.
    stepIntoView: 'Step into view',
    stepBack: 'Step back',
    comeCloser: 'Come closer',
    spreadArms: 'Spread your arms like wings',
    holdSteady: 'Hold…',
    // Caption for the lock-in chime, when captions are on.
    lockedCaption: 'Locked',
  },

  hud: {
    spreadArms: 'Spread your arms to fly',
    stepIntoView: 'Step into view',
    cameraLost: 'Lost the camera. Reconnecting…',
    warm: 'Your phone is getting warm',
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
