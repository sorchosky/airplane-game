/** A measured box in viewport pixels. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface FlipTransform {
  translateX: number
  translateY: number
  scaleX: number
  scaleY: number
}

/**
 * The inverse transform that makes an element laid out at `last` look like it is still at `first`
 * (FLIP), for a transform-origin of top left. Zero-sized boxes scale by 1 rather than dividing.
 */
export function flipTransform(first: Box, last: Box): FlipTransform {
  return {
    translateX: first.left - last.left,
    translateY: first.top - last.top,
    scaleX: last.width > 0 ? first.width / last.width : 1,
    scaleY: last.height > 0 ? first.height / last.height : 1,
  }
}

export function flipTransformCss(t: FlipTransform): string {
  return `translate(${t.translateX}px, ${t.translateY}px) scale(${t.scaleX}, ${t.scaleY})`
}

export interface FlipOptions {
  duration: number
  easing?: string
  /** Opacity at the start of the move; the end is 1. Omit for transform only. */
  fromOpacity?: number
}

/**
 * Moves `element` from where it was (`first`) to where it now is, animating transform and opacity
 * only. Measure `first` before the layout change and call this after it.
 */
export function flip(element: HTMLElement, first: Box, options: FlipOptions): Animation {
  const rect = element.getBoundingClientRect()
  const from: Keyframe = {
    transform: flipTransformCss(flipTransform(first, rect)),
    transformOrigin: '0 0',
  }
  const to: Keyframe = { transform: 'none', transformOrigin: '0 0' }
  if (options.fromOpacity !== undefined) {
    from.opacity = options.fromOpacity
    to.opacity = 1
  }
  return element.animate([from, to], {
    duration: options.duration,
    easing: options.easing ?? 'cubic-bezier(0.22, 1, 0.36, 1)',
  })
}

/** The attribute that marks a node a beat transition may move between beats. */
export const SHARED_ELEMENT_ATTR = 'data-shared-element'

/** The shared elements the front-door stage knows by name. */
export const SHARED_ELEMENTS = {
  /** The title wordmark; the Choose beat shrinks it into the running head. */
  wordmark: 'wordmark',
} as const

export type SharedElementId = (typeof SHARED_ELEMENTS)[keyof typeof SHARED_ELEMENTS]

/** The node a beat currently shows for `id`, or null when that beat has none. */
export function findSharedElement(
  root: ParentNode | null,
  id: SharedElementId,
): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[${SHARED_ELEMENT_ATTR}="${id}"]`) ?? null
}
