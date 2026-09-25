/**
 * Shared mutable state written by `TouchControls`' pointer handlers and read by
 * `keyboardSource`'s single per-frame tick, so touch and keyboard funnel through one writer
 * instead of two loops racing to set the input store.
 */
export const touchTargets = {
  roll: 0,
  pitch: 0,
  toggleActive: false,
}
