/**
 * mconv - Pure TypeScript/WASM image and video conversion library
 *
 * Zero external dependencies. Supports WASM acceleration with JS fallback.
 */

// Re-export core types and utilities
export * from '@mconv/core'

// Re-export codecs
export * from '@mconv/codecs'

// Main API
export { convert } from './convert'
export { loadImage, saveImage } from './image'
export { getBackend, setBackend } from './backend'
