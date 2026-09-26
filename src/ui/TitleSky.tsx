import { type Ref, useEffect, useImperativeHandle, useRef } from 'react'
import {
  finalTitleSkyFrame,
  introDuration,
  shouldDrawFrame,
  titleSkyFrame,
  type TitleSkyFrame,
} from '../app/screens/titleIntro'
import { TITLE_SKY_FALLBACK, TITLE_SKY_VERTEX, titleSkyFragment } from './titleSkyShader'

/** Keeps the fill sharp on phones without paying for 3× on a full-screen shader. */
const MAX_PIXEL_RATIO = 2

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader | null {
  const shader = gl.createShader(kind)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('TitleSky shader failed to compile', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export interface TitleSkyHandle {
  /** The current frame as an image URL, for the Start hand-off's still. Null if nothing drew. */
  snapshot: () => string | null
}

interface TitleSkyProps {
  /** `performance.now()` when the intro started, or null to show the settled frame. */
  introStart: number | null
  ref?: Ref<TitleSkyHandle>
}

/**
 * Full-screen cirrus sky behind the title (the Figma storyboard's background). Plain WebGL2 on
 * its own canvas, not React Three Fiber: it's one fragment shader, with no scene or camera. While
 * the intro plays it redraws at up to 30 fps (the cirrus drifts and a light crosses with the
 * band); after that, or with no intro, it holds the settled frame and redraws only on resize. The
 * CSS gradient under it shows if WebGL2 fails.
 */
export function TitleSky({ introStart, ref }: TitleSkyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawnRef = useRef(false)

  useImperativeHandle(
    ref,
    () => ({
      snapshot: () => {
        const canvas = canvasRef.current
        if (!canvas || !drawnRef.current) return null
        try {
          return canvas.toDataURL('image/jpeg', 0.9)
        } catch {
          return null
        }
      },
    }),
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    // `preserveDrawingBuffer` keeps the last frame readable for the hand-off snapshot; the canvas
    // is idle once the intro ends, so the extra copy costs nothing then.
    const gl = canvas?.getContext('webgl2', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    })
    if (!canvas || !gl) return

    const vertex = compile(gl, gl.VERTEX_SHADER, TITLE_SKY_VERTEX)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, titleSkyFragment())
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('TitleSky program failed to link', gl.getProgramInfoLog(program))
      return
    }

    // One triangle that covers the whole viewport.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.useProgram(program)
    const resolution = gl.getUniformLocation(program, 'resolution')
    const driftLocation = gl.getUniformLocation(program, 'drift')
    const lightLocation = gl.getUniformLocation(program, 'light')
    let frame: TitleSkyFrame = introStart === null ? finalTitleSkyFrame() : titleSkyFrame(0)

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      // Only on a real resize: assigning the size reallocates the drawing buffer, even unchanged.
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
      gl.uniform2f(resolution, width, height)
      gl.uniform1f(driftLocation, frame.drift)
      gl.uniform2f(lightLocation, frame.lightX, frame.light)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      drawnRef.current = true
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)

    let raf = 0
    if (introStart !== null) {
      let lastDraw = -Infinity
      const tick = (now: number) => {
        const t = now - introStart
        if (t >= introDuration()) {
          // Settle on the exact final frame, then stop; only resizes redraw from here.
          frame = finalTitleSkyFrame()
          draw()
          return
        }
        if (shouldDrawFrame(now, lastDraw)) {
          lastDraw = now
          frame = titleSkyFrame(t)
          draw()
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [introStart])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        background: TITLE_SKY_FALLBACK,
      }}
    />
  )
}
