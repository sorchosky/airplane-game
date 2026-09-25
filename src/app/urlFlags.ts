// Small URL-flag reader shared across dev/testing entry points. #9 adds the
// full `?input=` source selection; this ticket only needs to know whether
// keyboard mode is requested, to skip the camera permission probe.

export function isKeyboardInputMode(): boolean {
  return new URLSearchParams(window.location.search).get('input') === 'keyboard'
}
