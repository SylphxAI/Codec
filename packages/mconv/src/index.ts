/**
 * mconv - Pure TypeScript/WASM image and video conversion library
 *
 * Zero external dependencies. Supports WASM acceleration with JS fallback.
 */

// Re-export core types and utilities
export * from '@sylphx/codec-core'

// Re-export codecs
export * from '@sylphx/codec'

// Main API
export { convert } from './convert'
export { loadImage, saveImage } from './image'
export { getBackend, setBackend } from './backend'
