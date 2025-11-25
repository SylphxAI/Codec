/**
 * Image filters
 */

import type { ImageData } from '@sylphx/codec-core'
import { convolve, convolveSeparable, createBoxKernel, createGaussianKernel } from './convolve'
import type {
	BlurOptions,
	DenoiseOptions,
	EdgeDetectOptions,
	EmbossOptions,
	Kernel,
	SharpenOptions,
} from './types'

/**
 * Apply blur filter
 */
export function blur(image: ImageData, options: BlurOptions = {}): ImageData {
	const { radius = 1, type = 'gaussian' } = options

	const kernel = type === 'gaussian' ? createGaussianKernel(radius) : createBoxKernel(radius)

	return convolveSeparable(image, kernel, kernel)
}

/**
 * Apply Gaussian blur
 */
export function gaussianBlur(image: ImageData, radius = 1): ImageData {
	return blur(image, { radius, type: 'gaussian' })
}

/**
 * Apply box blur
 */
export function boxBlur(image: ImageData, radius = 1): ImageData {
	return blur(image, { radius, type: 'box' })
}

/**
 * Apply sharpen filter
 */
export function sharpen(image: ImageData, options: SharpenOptions = {}): ImageData {
	const { amount = 50, radius = 1 } = options

	// Unsharp mask: original + amount * (original - blurred)
	const blurred = gaussianBlur(image, radius)
	const factor = amount / 100

	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	for (let i = 0; i < data.length; i += 4) {
		output[i] = clamp(data[i]! + factor * (data[i]! - blurred.data[i]!))
		output[i + 1] = clamp(data[i + 1]! + factor * (data[i + 1]! - blurred.data[i + 1]!))
		output[i + 2] = clamp(data[i + 2]! + factor * (data[i + 2]! - blurred.data[i + 2]!))
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Detect edges in an image
 */
export function edgeDetect(image: ImageData, options: EdgeDetectOptions = {}): ImageData {
	const { algorithm = 'sobel', threshold } = options

	let result: ImageData

	switch (algorithm) {
		case 'sobel':
			result = sobelEdge(image)
			break
		case 'prewitt':
			result = prewittEdge(image)
			break
		case 'laplacian':
			result = laplacianEdge(image)
			break
		case 'canny':
			result = cannyEdge(image)
			break
	}

	// Apply threshold if specified
	if (threshold !== undefined) {
		const { width, height, data } = result
		const output = new Uint8Array(data.length)

		for (let i = 0; i < data.length; i += 4) {
			const gray = data[i]!
			const value = gray >= threshold ? 255 : 0
			output[i] = value
			output[i + 1] = value
			output[i + 2] = value
			output[i + 3] = data[i + 3]!
		}

		return { width, height, data: output }
	}

	return result
}

function sobelEdge(image: ImageData): ImageData {
	const sobelX: Kernel = {
		width: 3,
		height: 3,
		data: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
		divisor: 1,
	}
	const sobelY: Kernel = {
		width: 3,
		height: 3,
		data: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
		divisor: 1,
	}

	const gx = convolve(image, sobelX)
	const gy = convolve(image, sobelY)

	return combineGradients(gx, gy)
}

function prewittEdge(image: ImageData): ImageData {
	const prewittX: Kernel = {
		width: 3,
		height: 3,
		data: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
		divisor: 1,
	}
	const prewittY: Kernel = {
		width: 3,
		height: 3,
		data: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
		divisor: 1,
	}

	const gx = convolve(image, prewittX)
	const gy = convolve(image, prewittY)

	return combineGradients(gx, gy)
}

function laplacianEdge(image: ImageData): ImageData {
	const laplacian: Kernel = {
		width: 3,
		height: 3,
		data: [0, -1, 0, -1, 4, -1, 0, -1, 0],
		divisor: 1,
		offset: 128,
	}

	return convolve(image, laplacian)
}

function cannyEdge(image: ImageData): ImageData {
	// Simplified Canny: Gaussian blur + Sobel
	const blurred = gaussianBlur(image, 1)
	return sobelEdge(blurred)
}

function combineGradients(gx: ImageData, gy: ImageData): ImageData {
	const { width, height } = gx
	const output = new Uint8Array(gx.data.length)

	for (let i = 0; i < gx.data.length; i += 4) {
		const rx = gx.data[i]! - 128
		const ry = gy.data[i]! - 128
		const magnitude = Math.sqrt(rx * rx + ry * ry)

		const value = clamp(magnitude)
		output[i] = value
		output[i + 1] = value
		output[i + 2] = value
		output[i + 3] = gx.data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Apply emboss effect
 */
export function emboss(image: ImageData, options: EmbossOptions = {}): ImageData {
	const { angle = 135, strength = 1 } = options

	// Calculate kernel based on angle
	const rad = (angle * Math.PI) / 180
	const dx = Math.round(Math.cos(rad) * strength)
	const dy = Math.round(Math.sin(rad) * strength)

	// Simple emboss kernel
	const kernel: Kernel = {
		width: 3,
		height: 3,
		data: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
		divisor: 1,
		offset: 128,
	}

	// Adjust kernel based on direction
	if (dx < 0) {
		// Flip horizontally
		kernel.data = [0, -1, -2, 1, 1, -1, 2, 1, 0]
	}
	if (dy < 0) {
		// Flip vertically
		kernel.data = kernel.data.slice().reverse()
	}

	return convolve(image, kernel)
}

/**
 * Apply noise reduction
 */
export function denoise(image: ImageData, options: DenoiseOptions = {}): ImageData {
	const { algorithm = 'median', radius = 1 } = options

	switch (algorithm) {
		case 'median':
			return medianFilter(image, radius)
		case 'bilateral':
			return bilateralFilter(image, radius)
	}
}

function medianFilter(image: ImageData, radius: number): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)
	const windowSize = (radius * 2 + 1) ** 2

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const rValues: number[] = []
			const gValues: number[] = []
			const bValues: number[] = []

			for (let ky = -radius; ky <= radius; ky++) {
				for (let kx = -radius; kx <= radius; kx++) {
					const px = Math.max(0, Math.min(width - 1, x + kx))
					const py = Math.max(0, Math.min(height - 1, y + ky))
					const idx = (py * width + px) * 4

					rValues.push(data[idx]!)
					gValues.push(data[idx + 1]!)
					bValues.push(data[idx + 2]!)
				}
			}

			rValues.sort((a, b) => a - b)
			gValues.sort((a, b) => a - b)
			bValues.sort((a, b) => a - b)

			const mid = Math.floor(windowSize / 2)
			const dstIdx = (y * width + x) * 4

			output[dstIdx] = rValues[mid]!
			output[dstIdx + 1] = gValues[mid]!
			output[dstIdx + 2] = bValues[mid]!
			output[dstIdx + 3] = data[dstIdx + 3]!
		}
	}

	return { width, height, data: output }
}

function bilateralFilter(image: ImageData, radius: number): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const spatialSigma = radius / 2
	const rangeSigma = 30

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const centerIdx = (y * width + x) * 4
			const centerR = data[centerIdx]!
			const centerG = data[centerIdx + 1]!
			const centerB = data[centerIdx + 2]!

			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumWeight = 0

			for (let ky = -radius; ky <= radius; ky++) {
				for (let kx = -radius; kx <= radius; kx++) {
					const px = Math.max(0, Math.min(width - 1, x + kx))
					const py = Math.max(0, Math.min(height - 1, y + ky))
					const idx = (py * width + px) * 4

					const r = data[idx]!
					const g = data[idx + 1]!
					const b = data[idx + 2]!

					// Spatial weight
					const spatialDist = Math.sqrt(kx * kx + ky * ky)
					const spatialWeight = Math.exp(
						-(spatialDist * spatialDist) / (2 * spatialSigma * spatialSigma)
					)

					// Range weight (color similarity)
					const colorDist = Math.sqrt((r - centerR) ** 2 + (g - centerG) ** 2 + (b - centerB) ** 2)
					const rangeWeight = Math.exp(-(colorDist * colorDist) / (2 * rangeSigma * rangeSigma))

					const weight = spatialWeight * rangeWeight
					sumR += r * weight
					sumG += g * weight
					sumB += b * weight
					sumWeight += weight
				}
			}

			output[centerIdx] = clamp(sumR / sumWeight)
			output[centerIdx + 1] = clamp(sumG / sumWeight)
			output[centerIdx + 2] = clamp(sumB / sumWeight)
			output[centerIdx + 3] = data[centerIdx + 3]!
		}
	}

	return { width, height, data: output }
}

/**
 * Apply custom kernel
 */
export function customFilter(image: ImageData, kernel: Kernel): ImageData {
	return convolve(image, kernel)
}

function clamp(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}
