export interface ControlInput {
  roll: number // -1 (bank left) .. 1 (bank right)
  pitch: number // -1 (dive) .. 1 (climb)
  active: boolean // false = autopilot takes over
  boost?: boolean // arms swept back (or Shift): asks for a burst of speed, flight decides; absent = false
  confidence: number // 0..1, from pose; keyboard reports 1
  source: 'keyboard' | 'pose' | 'replay'
}

export const NEUTRAL_INPUT: ControlInput = {
  roll: 0,
  pitch: 0,
  active: false,
  boost: false,
  confidence: 1,
  source: 'keyboard',
}
