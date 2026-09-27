import { useMemo } from 'react'
import type { ColorRepresentation } from 'three'
import { createToonMaterial, type ToonMaterialOptions } from './toon'

/**
 * Cached toon material for a color, for meshes that manage their own geometry or outline. Most
 * meshes want `<ToonMesh>` instead, which adds the outline too.
 */
export function useToon(
  color: ColorRepresentation,
  rim = false,
  {
    specular = false,
    vertexColors = false,
  }: Pick<ToonMaterialOptions, 'specular' | 'vertexColors'> = {},
) {
  return useMemo(
    () => createToonMaterial({ color, rim, specular, vertexColors }),
    [color, rim, specular, vertexColors],
  )
}
