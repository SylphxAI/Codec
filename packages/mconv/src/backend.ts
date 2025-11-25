import type { Backend } from '@sylphx/codec-core'

/**
 * Current backend preference
 */
let currentBackend: Backend | 'auto' = 'auto'

/**
 * Cached detected backend
 */
let detectedBackend: Backend | null = null

/**
 * WASM module instance
 */
let wasmModule: unknown = null

/**
 * Check if WASM is supported
 */
function isWasmSupported(): boolean {
	try {
		if (typeof WebAssembly !== 'object') return false
		// Check for basic WASM support
		const module = new WebAssembly.Module(
			new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
		)
		return module instanceof WebAssembly.Module
	} catch {
		return false
	}
}

/**
 * Try to load WASM module
 */
async function loadWasmModule(): Promise<boolean> {
	if (wasmModule) return true

	try {
		// Dynamic import of WASM package
		const wasm = await import('@mconv/wasm')
		await wasm.default?.()
		wasmModule = wasm
		return true
	} catch {
		return false
	}
}

/**
 * Detect the best available backend
 */
export async function detectBackend(): Promise<Backend> {
	if (detectedBackend) return detectedBackend

	if (isWasmSupported()) {
		const loaded = await loadWasmModule()
		if (loaded) {
			detectedBackend = 'wasm'
			return 'wasm'
		}
	}

	detectedBackend = 'js'
	return 'js'
}

/**
 * Get current backend
 */
export async function getBackend(): Promise<Backend> {
	if (currentBackend === 'auto') {
		return detectBackend()
	}
	return currentBackend
}

/**
 * Set backend preference
 */
export function setBackend(backend: Backend | 'auto'): void {
	currentBackend = backend
	if (backend !== 'auto') {
		detectedBackend = null // Reset detection
	}
}

/**
 * Get WASM module if loaded
 */
export function getWasmModule(): unknown {
	return wasmModule
}

/**
 * Check if WASM is currently active
 */
export async function isWasmActive(): Promise<boolean> {
	const backend = await getBackend()
	return backend === 'wasm'
}
