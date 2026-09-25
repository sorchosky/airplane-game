/**
 * Typed stub. The real replay source lands in #19 (pose record/replay), which reads a recorded
 * pose fixture via the `?replay=<fixture>` flag and writes `ControlInput` with
 * `source: 'replay'`.
 */
export function useReplaySource(): void {
  // Not implemented yet. Selecting `?input=replay` currently leaves the input at NEUTRAL_INPUT.
}
