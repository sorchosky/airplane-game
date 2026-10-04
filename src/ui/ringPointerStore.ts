import { Matrix4, Vector3 } from 'three'

/** Stable, mutable frame data shared from the R3F course to the DOM HUD without React renders. */
export const ringPointerFrame = {
  viewProjection: new Matrix4(),
  nextRing: new Vector3(),
  ready: false,
}
