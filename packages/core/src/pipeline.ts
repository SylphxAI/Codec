import type { Backend, Context, ImageData } from './types'

/**
 * Transform function type
 */
export type Transform<T> = (input: T, ctx: Context) => T

/**
 * Async transform function type
 */
export type AsyncTransform<T> = (input: T, ctx: Context) => T | Promise<T>

/**
 * Pipe multiple transforms together (sync)
 */
export function pipe<T>(...transforms: Transform<T>[]): Transform<T> {
	return (input: T, ctx: Context): T => {
		return transforms.reduce((acc, fn) => fn(acc, ctx), input)
	}
}

/**
 * Pipe multiple transforms together (async)
 */
export function pipeAsync<T>(...transforms: AsyncTransform<T>[]): AsyncTransform<T> {
	return async (input: T, ctx: Context): Promise<T> => {
		let result = input
		for (const fn of transforms) {
			result = await fn(result, ctx)
		}
		return result
	}
}

/**
 * Compose transforms (right to left)
 */
export function compose<T>(...transforms: Transform<T>[]): Transform<T> {
	return pipe(...transforms.reverse())
}

/**
 * Map over image pixels
 */
export function mapPixels(
	fn: (
		r: number,
		g: number,
		b: number,
		a: number,
		x: number,
		y: number
	) => [number, number, number, number]
): Transform<ImageData> {
	return (image: ImageData, _ctx: Context): ImageData => {
		const { width, height, data } = image
		const output = new Uint8Array(data.length)

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = (y * width + x) * 4
				const [r, g, b, a] = fn(data[idx]!, data[idx + 1]!, data[idx + 2]!, data[idx + 3]!, x, y)
				output[idx] = r
				output[idx + 1] = g
				output[idx + 2] = b
				output[idx + 3] = a
			}
		}

		return { width, height, data: output }
	}
}

/**
 * Detect best available backend
 */
export async function detectBackend(): Promise<Backend> {
	// Try to load WASM
	try {
		// Dynamic import to check if WASM is available
		const wasmSupported = typeof WebAssembly !== 'undefined'
		if (wasmSupported) {
			// TODO: Actually load and verify WASM module
			return 'wasm'
		}
	} catch {
		// WASM not available
	}
	return 'js'
}

/**
 * Create context with auto-detected backend
 */
export async function createContext(backend?: Backend): Promise<Context> {
	return {
		backend: backend ?? (await detectBackend()),
	}
}

/**
 * Run transform with context
 */
export async function run<T>(
	input: T,
	transform: AsyncTransform<T>,
	backend?: Backend
): Promise<T> {
	const ctx = await createContext(backend)
	return transform(input, ctx)
}
