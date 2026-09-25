import { useThree, type ThreeElements } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { BufferGeometry, ColorRepresentation, Mesh } from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getOutlineMaterial, setOutlineViewportHeight, type OutlineMaterialOptions } from './toon'
import { useToon } from './useToon'

type MeshProps = Omit<ThreeElements['mesh'], 'material' | 'ref' | 'children'>

export interface ToonMeshProps extends MeshProps {
  color: ColorRepresentation
  /** Soft fresnel rim light. See `createToonMaterial`. */
  rim?: boolean
  /** Inverted-hull outline. `true` uses the token color and default weight. */
  outline?: boolean | OutlineMaterialOptions
  /** The geometry element, e.g. `<boxGeometry args={[1, 1, 1]} />`. */
  children: ReactNode
}

// Outline hulls are decoration: never let them catch raycasts meant for the mesh itself.
const noRaycast = () => undefined

/**
 * A mesh with the shared toon material and, by default, an inverted-hull outline: a second draw
 * of the same shape, pushed out along smoothed normals and drawn back-faces only.
 *
 * ```tsx
 * <ToonMesh color={color.planeBody}><boxGeometry args={[1, 0.6, 2.4]} /></ToonMesh>
 * ```
 */
export function ToonMesh({
  color,
  rim = false,
  outline = true,
  children,
  ...props
}: ToonMeshProps) {
  const material = useToon(color, rim)
  const outlineOptions = outline === true ? undefined : outline || undefined
  const outlineColor = outlineOptions?.color
  const outlineThickness = outlineOptions?.thickness
  const outlineMaxPixels = outlineOptions?.maxPixels
  const outlineMaterial = useMemo(
    () =>
      outline === false
        ? null
        : getOutlineMaterial({
            color: outlineColor,
            thickness: outlineThickness,
            maxPixels: outlineMaxPixels,
          }),
    [outline, outlineColor, outlineThickness, outlineMaxPixels],
  )

  const meshRef = useRef<Mesh>(null)
  const hullRef = useRef<Mesh>(null)
  // The smoothed-normal copy the hull draws, and the mesh geometry it was built from.
  const hullGeometry = useRef<{ source: BufferGeometry; smoothed: BufferGeometry } | null>(null)
  const viewportHeight = useThree((state) => state.size.height)

  useEffect(() => setOutlineViewportHeight(viewportHeight), [viewportHeight])

  // Runs after every render: the geometry child may have been recreated (new args), or the
  // outline toggled, in which case the hull needs fresh smoothed normals. Hard-edged normals (a
  // box) would split the hull at every crease and leave gaps in the line.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    const hull = hullRef.current
    const current = hullGeometry.current
    if (current && (!hull || !mesh || current.source !== mesh.geometry)) {
      current.smoothed.dispose()
      hullGeometry.current = null
    }
    if (!mesh || !hull || hullGeometry.current) return
    const smoothed = toCreasedNormals(mesh.geometry, Math.PI)
    // Drops the empty placeholder geometry R3F gave the hull mesh (a no-op on one already freed).
    hull.geometry.dispose()
    hull.geometry = smoothed
    hullGeometry.current = { source: mesh.geometry, smoothed }
  })

  useEffect(
    () => () => {
      hullGeometry.current?.smoothed.dispose()
      hullGeometry.current = null
    },
    [],
  )

  return (
    <mesh ref={meshRef} material={material} {...props}>
      {children}
      {outlineMaterial && <mesh ref={hullRef} material={outlineMaterial} raycast={noRaycast} />}
    </mesh>
  )
}
