/**
 * WASM module loader with automatic fallback
 *
 * Provides seamless integration between TypeScript and WASM backends.
 * Falls back to pure TS when WASM is unavailable.
 */

/** WASM module interface */
export interface WasmModule {
	/** Module version */
	version(): string
	/** Check if threading is available */
	has_threads(): boolean

	// BMP codec
	bmp_decode(data: Uint8Array): Uint8Array | null
	bmp_encode(data: Uint8Array, width: number, height: number, bitsPerPixel: number): Uint8Array | null

	// Future codecs will be added here
}

/** WASM loading state */
type LoadState = 'unloaded' | 'loading' | 'loaded' | 'failed'

let wasmModule: WasmModule | null = null
let loadState: LoadState = 'unloaded'
let loadPromise: Promise<WasmModule | null> | null = null

/**
 * Load WASM module
 * Returns null if loading fails (will use TS fallback)
 */
export async function loadWasm(): Promise<WasmModule | null> {
	if (loadState === 'loaded') return wasmModule
	if (loadState === 'failed') return null
	if (loadState === 'loading' && loadPromise) return loadPromise

	loadState = 'loading'

	loadPromise = (async () => {
		try {
			// Try to import the WASM module
			// In production, this would be the compiled .wasm file
			const wasm = await import('../pkg/mconv_wasm')
			await wasm.default()

			wasmModule = wasm as unknown as WasmModule
			loadState = 'loaded'

			console.log(`[mconv] WASM loaded: v${wasmModule.version()}, threads: ${wasmModule.has_threads()}`)
			return wasmModule
		} catch (e) {
			loadState = 'failed'
			console.warn('[mconv] WASM unavailable, using pure TypeScript:', e)
			return null
		}
	})()

	return loadPromise
}

/**
 * Check if WASM is available
 */
export function isWasmAvailable(): boolean {
	return loadState === 'loaded' && wasmModule !== null
}

/**
 * Get WASM module (sync)
 * Returns null if not loaded
 */
export function getWasm(): WasmModule | null {
	return wasmModule
}

/**
 * Create a codec that uses WASM when available, falls back to TS
 */
export function createHybridCodec<T>(config: {
	name: string
	wasmDecode?: (wasm: WasmModule, data: Uint8Array) => T | null
	wasmEncode?: (wasm: WasmModule, input: T) => Uint8Array | null
	tsDecode: (data: Uint8Array) => T
	tsEncode: (input: T) => Uint8Array
}): {
	decode: (data: Uint8Array) => T
	encode: (input: T) => Uint8Array
	isAccelerated: () => boolean
} {
	const { name, wasmDecode, wasmEncode, tsDecode, tsEncode } = config

	return {
		decode: (data: Uint8Array): T => {
			if (wasmDecode && wasmModule) {
				const result = wasmDecode(wasmModule, data)
				if (result !== null) return result
				console.warn(`[${name}] WASM decode failed, falling back to TS`)
			}
			return tsDecode(data)
		},

		encode: (input: T): Uint8Array => {
			if (wasmEncode && wasmModule) {
				const result = wasmEncode(wasmModule, input)
				if (result !== null) return result
				console.warn(`[${name}] WASM encode failed, falling back to TS`)
			}
			return tsEncode(input)
		},

		isAccelerated: () => {
			return wasmModule !== null && (!!wasmDecode || !!wasmEncode)
		},
	}
}

/**
 * Performance benchmark for WASM vs TS
 */
export async function benchmark(
	name: string,
	wasmFn: () => void,
	tsFn: () => void,
	iterations = 100
): Promise<{ wasm: number; ts: number; speedup: number }> {
	// Warmup
	for (let i = 0; i < 10; i++) {
		wasmFn()
		tsFn()
	}

	// Benchmark WASM
	const wasmStart = performance.now()
	for (let i = 0; i < iterations; i++) {
		wasmFn()
	}
	const wasmTime = performance.now() - wasmStart

	// Benchmark TS
	const tsStart = performance.now()
	for (let i = 0; i < iterations; i++) {
		tsFn()
	}
	const tsTime = performance.now() - tsStart

	const speedup = tsTime / wasmTime

	console.log(
		`[${name}] WASM: ${wasmTime.toFixed(2)}ms, TS: ${tsTime.toFixed(2)}ms, Speedup: ${speedup.toFixed(2)}x`
	)

	return { wasm: wasmTime, ts: tsTime, speedup }
}
