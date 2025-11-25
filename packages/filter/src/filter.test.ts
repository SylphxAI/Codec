import { describe, expect, it } from 'bun:test'
import { convolve, convolveSeparable, createBoxKernel, createGaussianKernel } from './convolve'
import {
	blur,
	boxBlur,
	customFilter,
	denoise,
	edgeDetect,
	emboss,
	gaussianBlur,
	sharpen,
} from './filters'
import type { Kernel } from './types'

describe('Filter', () => {
	// Helper to create test image
	function createTestImage(
		width: number,
		height: number
	): {
		width: number
		height: number
		data: Uint8Array
	} {
		const data = new Uint8Array(width * height * 4)
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = 128 // R
			data[i * 4 + 1] = 64 // G
			data[i * 4 + 2] = 192 // B
			data[i * 4 + 3] = 255 // A
		}
		return { width, height, data }
	}

	// Create gradient image for edge detection tests
	function createGradientImage(
		width: number,
		height: number
	): {
		width: number
		height: number
		data: Uint8Array
	} {
		const data = new Uint8Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				const value = Math.round((x / (width - 1)) * 255)
				data[i] = value
				data[i + 1] = value
				data[i + 2] = value
				data[i + 3] = 255
			}
		}
		return { width, height, data }
	}

	describe('convolve', () => {
		it('should apply identity kernel', () => {
			const img = createTestImage(4, 4)
			const identity: Kernel = {
				width: 3,
				height: 3,
				data: [0, 0, 0, 0, 1, 0, 0, 0, 0],
			}

			const result = convolve(img, identity)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)
			expect(result.data[0]).toBe(img.data[0])
		})

		it('should handle edge clamping', () => {
			const img = createTestImage(4, 4)
			const kernel: Kernel = {
				width: 3,
				height: 3,
				data: [1, 1, 1, 1, 1, 1, 1, 1, 1],
			}

			const result = convolve(img, kernel, 'clamp')
			expect(result.width).toBe(4)
		})

		it('should handle edge wrapping', () => {
			const img = createTestImage(4, 4)
			const kernel: Kernel = {
				width: 3,
				height: 3,
				data: [1, 1, 1, 1, 1, 1, 1, 1, 1],
			}

			const result = convolve(img, kernel, 'wrap')
			expect(result.width).toBe(4)
		})
	})

	describe('kernels', () => {
		it('should create Gaussian kernel', () => {
			const kernel = createGaussianKernel(2)

			expect(kernel.length).toBe(5)
			// Sum should be approximately 1
			const sum = kernel.reduce((a, b) => a + b, 0)
			expect(sum).toBeCloseTo(1, 5)
			// Center should be highest
			expect(kernel[2]!).toBeGreaterThan(kernel[0]!)
		})

		it('should create box kernel', () => {
			const kernel = createBoxKernel(2)

			expect(kernel.length).toBe(5)
			expect(kernel[0]).toBe(1)
			expect(kernel[4]).toBe(1)
		})
	})

	describe('blur', () => {
		it('should apply Gaussian blur', () => {
			const img = createTestImage(8, 8)
			const result = gaussianBlur(img, 1)

			expect(result.width).toBe(8)
			expect(result.height).toBe(8)
		})

		it('should apply box blur', () => {
			const img = createTestImage(8, 8)
			const result = boxBlur(img, 1)

			expect(result.width).toBe(8)
		})

		it('should apply blur with options', () => {
			const img = createTestImage(8, 8)
			const result = blur(img, { radius: 2, type: 'gaussian' })

			expect(result.width).toBe(8)
		})
	})

	describe('sharpen', () => {
		it('should sharpen image', () => {
			const img = createTestImage(8, 8)
			const result = sharpen(img, { amount: 50 })

			expect(result.width).toBe(8)
		})

		it('should handle different sharpening amounts', () => {
			const img = createTestImage(8, 8)
			const mild = sharpen(img, { amount: 25 })
			const strong = sharpen(img, { amount: 100 })

			expect(mild.width).toBe(8)
			expect(strong.width).toBe(8)
		})
	})

	describe('edge detection', () => {
		it('should detect edges with Sobel', () => {
			const img = createGradientImage(8, 8)
			const result = edgeDetect(img, { algorithm: 'sobel' })

			expect(result.width).toBe(8)
		})

		it('should detect edges with Prewitt', () => {
			const img = createGradientImage(8, 8)
			const result = edgeDetect(img, { algorithm: 'prewitt' })

			expect(result.width).toBe(8)
		})

		it('should detect edges with Laplacian', () => {
			const img = createGradientImage(8, 8)
			const result = edgeDetect(img, { algorithm: 'laplacian' })

			expect(result.width).toBe(8)
		})

		it('should apply threshold to edges', () => {
			const img = createGradientImage(8, 8)
			const result = edgeDetect(img, { algorithm: 'sobel', threshold: 50 })

			// Should only have 0 or 255 values
			for (let i = 0; i < result.data.length; i += 4) {
				expect(result.data[i] === 0 || result.data[i] === 255).toBe(true)
			}
		})
	})

	describe('emboss', () => {
		it('should apply emboss effect', () => {
			const img = createTestImage(8, 8)
			const result = emboss(img)

			expect(result.width).toBe(8)
		})

		it('should handle different angles', () => {
			const img = createTestImage(8, 8)
			const result = emboss(img, { angle: 45 })

			expect(result.width).toBe(8)
		})
	})

	describe('denoise', () => {
		it('should apply median filter', () => {
			const img = createTestImage(8, 8)
			// Add some noise
			img.data[20] = 255

			const result = denoise(img, { algorithm: 'median', radius: 1 })

			expect(result.width).toBe(8)
		})

		it('should apply bilateral filter', () => {
			const img = createTestImage(8, 8)
			const result = denoise(img, { algorithm: 'bilateral', radius: 1 })

			expect(result.width).toBe(8)
		})
	})

	describe('custom filter', () => {
		it('should apply custom kernel', () => {
			const img = createTestImage(8, 8)
			const kernel: Kernel = {
				width: 3,
				height: 3,
				data: [0, -1, 0, -1, 5, -1, 0, -1, 0],
			}

			const result = customFilter(img, kernel)

			expect(result.width).toBe(8)
		})
	})

	describe('separable convolution', () => {
		it('should produce similar results to non-separable', () => {
			const img = createTestImage(8, 8)
			const kernel = createBoxKernel(1)

			const sep = convolveSeparable(img, kernel, kernel)

			expect(sep.width).toBe(8)
		})
	})
})
