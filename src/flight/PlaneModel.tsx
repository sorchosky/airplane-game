import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { DoubleSide, MeshBasicMaterial, type Group, type Mesh } from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useInputStore } from '../input/inputStore'
import { getOutlineMaterial } from '../render/toon'
import { ToonMesh } from '../render/ToonMesh'
import { useToon } from '../render/useToon'
import { color } from '../styles/tokens'
import { useFlightStore } from './flightStore'
import { buildPlaneGeometry } from './planeGeometry'
import {
  NEUTRAL_DEFLECTIONS,
  createArticulation,
  dampDeflections,
  propSpinRate,
  showPropDisc,
  targetDeflections,
} from './planeRig'

/** Opacity of the prop blur disc: a hint of motion, not a solid plate. */
const PROP_DISC_OPACITY = 0.28

// Outline hulls are decoration: never let them catch raycasts meant for the plane.
const noRaycast = () => undefined

interface PlaneModelProps {
  /** Freezes the prop and control surfaces, matching the paused simulation. */
  paused?: boolean
}

/**
 * The procedural Cessna-style plane (geometry in `planeGeometry.ts`), toon-shaded and outlined.
 * Control surfaces follow `inputStore` and the prop follows `flightStore` airspeed, read inside
 * `useFrame` so nothing re-renders at frame rate.
 *
 * Draw calls: body, stripe, metal and prop blades each draw once plus an outline hull; the glass
 * band draws once, un-outlined. At cruise the blades swap for the disc (one call), so 8 in
 * flight and 9 in a climb.
 */
export function PlaneModel({ paused = false }: PlaneModelProps) {
  const geometry = useMemo(() => buildPlaneGeometry(), [])
  // The stripe mesh's surfaces move, so it can't use `ToonMesh`, whose outline hull is a static
  // copy. It gets its own hull, articulated in step with the mesh.
  const stripeHull = useMemo(() => toCreasedNormals(geometry.stripe, Math.PI), [geometry])
  const articulations = useMemo(
    () => [
      createArticulation(geometry.stripe, geometry.hinges),
      createArticulation(stripeHull, geometry.hinges),
    ],
    [geometry, stripeHull],
  )
  const stripeMaterial = useToon(color.planeStripe)
  const outlineMaterial = useMemo(() => getOutlineMaterial(), [])
  const discMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: color.planeMetal,
        transparent: true,
        opacity: PROP_DISC_OPACITY,
        depthWrite: false,
        side: DoubleSide,
        // Double-sided transparent materials otherwise draw twice (back faces, then front).
        forceSinglePass: true,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      stripeHull.dispose()
      discMaterial.dispose()
    },
    [geometry, stripeHull, discMaterial],
  )

  const propRef = useRef<Group>(null)
  const bladesRef = useRef<Group>(null)
  const discRef = useRef<Mesh>(null)
  const rig = useRef({
    deflections: { ...NEUTRAL_DEFLECTIONS },
    target: { ...NEUTRAL_DEFLECTIONS },
    discShowing: false,
  })

  useFrame((_frameState, delta) => {
    if (paused) return
    const input = useInputStore.getState().current
    const { state, params } = useFlightStore.getState()

    const { deflections, target } = rig.current
    targetDeflections(input, state, params.turnGravity, undefined, target)
    dampDeflections(deflections, target, delta)
    for (const articulation of articulations) articulation.apply(deflections)

    const discShowing = showPropDisc(state.speed, params.cruiseSpeed, rig.current.discShowing)
    rig.current.discShowing = discShowing
    if (bladesRef.current) bladesRef.current.visible = !discShowing
    if (discRef.current) discRef.current.visible = discShowing
    // Spins clockwise seen from the cockpit, like a Lycoming. Wrapped so it never loses precision.
    if (propRef.current) {
      const angle = propRef.current.rotation.z - propSpinRate(state.speed) * delta
      propRef.current.rotation.z = angle % (Math.PI * 2)
    }
  })

  return (
    <group>
      <ToonMesh color={color.planeBody} castShadow>
        <primitive object={geometry.body} attach="geometry" />
      </ToonMesh>
      <ToonMesh color={color.planeMetal} castShadow>
        <primitive object={geometry.metal} attach="geometry" />
      </ToonMesh>
      <ToonMesh color={color.planeGlass} outline={false}>
        <primitive object={geometry.glass} attach="geometry" />
      </ToonMesh>
      <mesh geometry={geometry.stripe} material={stripeMaterial} castShadow>
        <mesh geometry={stripeHull} material={outlineMaterial} raycast={noRaycast} />
      </mesh>
      <group ref={propRef} position={geometry.propHub}>
        <group ref={bladesRef}>
          <ToonMesh color={color.planeMetal} castShadow>
            <primitive object={geometry.blades} attach="geometry" />
          </ToonMesh>
        </group>
        <mesh
          ref={discRef}
          geometry={geometry.disc}
          material={discMaterial}
          visible={false}
          raycast={noRaycast}
        />
      </group>
    </group>
  )
}
