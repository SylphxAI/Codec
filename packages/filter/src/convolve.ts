/**
 * Convolution operations
 */

import type { ImageData } from '@mconv/core'
import type { EdgeMode, Kernel } from './types'

/**
 * Apply a convolution kernel to an image
 */
export function convolve(
	image: ImageData,
	kernel: Kernel,
	edgeMode: EdgeMode = 'clamp'
): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const kw = kernel.width
	const kh = kernel.height
	const kHalfW = Math.floor(kw / 2)
	const kHalfH = Math.floor(kh / 2)

	// Calculate divisor if not provided
	let divisor = kernel.divisor
	if (divisor === undefined) {
		divisor = 0
		for (const v of kernel.data) {
			divisor += v
		}
		if (divisor === 0) divisor = 1
	}

	const offset = kernel.offset ?? 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sumR = 0
			let sumG = 0
			let sumB = 0

			for (let ky = 0; ky < kh; ky++) {
				for (let kx = 0; kx < kw; kx++) {
					const px = x + kx - kHalfW
					const py = y + ky - kHalfH

					const [sx, sy] = handleEdge(px, py, width, height, edgeMode)
					const kValue = kernel.data[ky * kw + kx]!

					const srcIdx = (sy * width + sx) * 4
					sumR += data[srcIdx]! * kValue
					sumG += data[srcIdx + 1]! * kValue
					sumB += data[srcIdx + 2]! * kValue
				}
			}

			const dstIdx = (y * width + x) * 4
			output[dstIdx] = clamp(sumR / divisor + offset)
			output[dstIdx + 1] = clamp(sumG / divisor + offset)
			output[dstIdx + 2] = clamp(sumB / divisor + offset)
			output[dstIdx + 3] = data[dstIdx + 3]! // Preserve alpha
		}
	}

	return { width, height, data: output }
}

/**
 * Apply separable convolution (faster for separable kernels)
 */
export function convolveSeparable(
	image: ImageData,
	horizontalKernel: number[],
	verticalKernel: number[],
	edgeMode: EdgeMode = 'clamp'
): ImageData {
	// First pass: horizontal
	const temp = convolveHorizontal(image, horizontalKernel, edgeMode)
	// Second pass: vertical
	return convolveVertical(temp, verticalKernel, edgeMode)
}

function convolveHorizontal(image: ImageData, kernel: number[], edgeMode: EdgeMode): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)
	const kSize = kernel.length
	const kHalf = Math.floor(kSize / 2)

	let divisor = 0
	for (const v of kernel) divisor += v
	if (divisor === 0) divisor = 1

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sumR = 0
			let sumG = 0
			let sumB = 0

			for (let k = 0; k < kSize; k++) {
				const px = x + k - kHalf
				const [sx] = handleEdge(px, y, width, height, edgeMode)
				const kValue = kernel[k]!

				const srcIdx = (y * width + sx) * 4
				sumR += data[srcIdx]! * kValue
				sumG += data[srcIdx + 1]! * kValue
				sumB += data[srcIdx + 2]! * kValue
			}

			const dstIdx = (y * width + x) * 4
			output[dstIdx] = clamp(sumR / divisor)
			output[dstIdx + 1] = clamp(sumG / divisor)
			output[dstIdx + 2] = clamp(sumB / divisor)
			output[dstIdx + 3] = data[dstIdx + 3]!
		}
	}

	return { width, height, data: output }
}

function convolveVertical(image: ImageData, kernel: number[], edgeMode: EdgeMode): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)
	const kSize = kernel.length
	const kHalf = Math.floor(kSize / 2)

	let divisor = 0
	for (const v of kernel) divisor += v
	if (divisor === 0) divisor = 1

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sumR = 0
			let sumG = 0
			let sumB = 0

			for (let k = 0; k < kSize; k++) {
				const py = y + k - kHalf
				const [, sy] = handleEdge(x, py, width, height, edgeMode)
				const kValue = kernel[k]!

				const srcIdx = (sy * width + x) * 4
				sumR += data[srcIdx]! * kValue
				sumG += data[srcIdx + 1]! * kValue
				sumB += data[srcIdx + 2]! * kValue
			}

			const dstIdx = (y * width + x) * 4
			output[dstIdx] = clamp(sumR / divisor)
			output[dstIdx + 1] = clamp(sumG / divisor)
			output[dstIdx + 2] = clamp(sumB / divisor)
			output[dstIdx + 3] = data[dstIdx + 3]!
		}
	}

	return { width, height, data: output }
}

function handleEdge(
	x: number,
	y: number,
	width: number,
	height: number,
	mode: EdgeMode
): [number, number] {
	let sx = x
	let sy = y

	switch (mode) {
		case 'clamp':
			sx = Math.max(0, Math.min(width - 1, x))
			sy = Math.max(0, Math.min(height - 1, y))
			break
		case 'wrap':
			sx = ((x % width) + width) % width
			sy = ((y % height) + height) % height
			break
		case 'mirror':
			if (x < 0) sx = -x - 1
			else if (x >= width) sx = 2 * width - x - 1
			if (y < 0) sy = -y - 1
			else if (y >= height) sy = 2 * height - y - 1
			sx = Math.max(0, Math.min(width - 1, sx))
			sy = Math.max(0, Math.min(height - 1, sy))
			break
		case 'zero':
			if (x < 0 || x >= width || y < 0 || y >= height) {
				return [0, 0] // Will return zero
			}
			break
	}

	return [sx, sy]
}

function clamp(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * Create a Gaussian kernel
 */
export function createGaussianKernel(radius: number, sigma?: number): number[] {
	const size = radius * 2 + 1
	const s = sigma ?? radius / 3
	const kernel: number[] = []
	let sum = 0

	for (let i = 0; i < size; i++) {
		const x = i - radius
		const g = Math.exp(-(x * x) / (2 * s * s))
		kernel.push(g)
		sum += g
	}

	// Normalize
	for (let i = 0; i < size; i++) {
		kernel[i] = kernel[i]! / sum
	}

	return kernel
}

/**
 * Create a box kernel (uniform)
 */
export function createBoxKernel(radius: number): number[] {
	const size = radius * 2 + 1
	return new Array(size).fill(1)
}
