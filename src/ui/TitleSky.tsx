import { useEffect, useRef } from 'react'
import { TITLE_SKY_FALLBACK, TITLE_SKY_VERTEX, titleSkyFragment } from './titleSkyShader'

/** Keeps the fill sharp on phones without paying for 3× on a static full-screen shader. */
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

/**
 * Full-screen static cirrus sky behind the title (the Figma storyboard's background). Plain
 * WebGL2 on its own canvas, not React Three Fiber: it's one fragment shader drawn once per
 * resize, with no scene, camera or frame loop. The CSS gradient under it shows if WebGL2 fails.
 */
export function TitleSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false })
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

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
      gl.uniform2f(resolution, width, height)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [])

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
