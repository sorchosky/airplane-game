// Every player-facing string, in one place (#28). Voice: short, second person, a little
// adventurous, no jargon. It's read from a couch ~3 m away, so fewer words beat more detail.

export const copy = {
  title: {
    name: 'Skyborne',
    tagline: 'Spread your arms and take to the sky.',
    start: 'Start',
    howToPlay: 'How to play',
    steps: [
      'Prop your phone sideways and cast it to your TV',
      'Step back and spread your arms like wings',
      'Tilt to turn. Raise your arms to climb, lower them to dive',
    ],
  },

  calibrate: {
    modelLoading: 'Warming up motion tracking…',
    modelError: "Motion tracking didn't load. Check your connection and reload.",
    stepBack: 'Step back until your head and hips are in view',
    comeCloser: 'Come a little closer',
    spreadArms: 'Spread your arms like wings',
    holdSteady: 'Hold steady…',
  },

  hud: {
    spreadArms: 'Spread your arms to fly',
    stepIntoView: 'Step into view',
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
    body: 'Skyborne flies in landscape.',
  },

  error: {
    generic: 'Something went wrong. Give it another go.',
    retry: 'Try again',
    cameraDenied: 'We need your camera to see you fly. Allow it in your browser settings.',
    cameraFailed: "Your camera didn't start. Give it another go.",
  },
} as const
