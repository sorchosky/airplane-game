/**
 * Typed stub. The real pose source lands in #16 (gesture interpreter) and #13/#14 (camera and
 * MediaPipe pose service), which write `ControlInput` with `source: 'pose'`.
 */
export function usePoseSource(): void {
  // Not implemented yet. Selecting `?input=pose` currently leaves the input at NEUTRAL_INPUT.
}
