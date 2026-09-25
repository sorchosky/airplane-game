// Copies the MediaPipe Tasks Vision WASM runtime from node_modules into
// public/mediapipe/wasm so the pose service loads it from our own origin
// instead of a third-party CDN. Runs on `postinstall`, so `npm install` /
// `npm ci` (locally, in CI and on Vercel) always leave it in sync with the
// installed package version. The output is gitignored.
//
// Only the classic (non-module) SIMD and no-SIMD builds are copied, since
// those are the two `FilesetResolver.forVisionTasks(basePath)` chooses from.
// The pose model (`public/mediapipe/pose_landmarker_lite.task`) is not in the
// npm package and is committed to the repo instead.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const target = join(root, 'public', 'mediapipe', 'wasm')

const FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

if (!existsSync(source)) {
  console.warn(`[copy-mediapipe-wasm] ${source} not found, skipping`)
  process.exit(0)
}

mkdirSync(target, { recursive: true })
for (const file of FILES) {
  copyFileSync(join(source, file), join(target, file))
}
console.log(`[copy-mediapipe-wasm] copied ${FILES.length} files to public/mediapipe/wasm`)
