export interface ControlInput {
  roll: number // -1 (bank left) .. 1 (bank right)
  pitch: number // -1 (dive) .. 1 (climb)
  active: boolean // false = autopilot takes over
  confidence: number // 0..1, from pose; keyboard reports 1
  source: 'keyboard' | 'pose' | 'replay'
}

export const NEUTRAL_INPUT: ControlInput = {
  roll: 0,
  pitch: 0,
  active: false,
  confidence: 1,
  source: 'keyboard',
}
