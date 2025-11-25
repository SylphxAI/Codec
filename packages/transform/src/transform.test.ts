import { describe, expect, it } from 'bun:test'
import { autoCrop, crop, extend } from './crop'
import { flip, flipHorizontal, flipVertical } from './flip'
import { resize } from './resize'
import { rotate, rotate90, rotate180, rotate270 } from './rotate'

describe('Transform', () => {
	// Helper to create test image
	function createTestImage(
		width: number,
		height: number,
		fill?: number
	): {
		width: number
		height: number
		data: Uint8Array
	} {
		const data = new Uint8Array(width * height * 4)
		if (fill !== undefined) {
			data.fill(fill)
		} else {
			// Create gradient pattern for testing
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4
					data[idx] = x * 10 // R
					data[idx + 1] = y * 10 // G
					data[idx + 2] = 128 // B
					data[idx + 3] = 255 // A
				}
			}
		}
		return { width, height, data }
	}

	describe('resize', () => {
		it('should resize with nearest neighbor', () => {
			const img = createTestImage(4, 4)
			const result = resize(img, 8, 8, { method: 'nearest' })

			expect(result.width).toBe(8)
			expect(result.height).toBe(8)
			expect(result.data.length).toBe(8 * 8 * 4)
		})

		it('should resize with bilinear interpolation', () => {
			const img = createTestImage(4, 4)
			const result = resize(img, 8, 8, { method: 'bilinear' })

			expect(result.width).toBe(8)
			expect(result.height).toBe(8)
		})

		it('should resize with bicubic interpolation', () => {
			const img = createTestImage(4, 4)
			const result = resize(img, 8, 8, { method: 'bicubic' })

			expect(result.width).toBe(8)
			expect(result.height).toBe(8)
		})

		it('should resize with lanczos interpolation', () => {
			const img = createTestImage(4, 4)
			const result = resize(img, 8, 8, { method: 'lanczos' })

			expect(result.width).toBe(8)
			expect(result.height).toBe(8)
		})

		it('should downscale', () => {
			const img = createTestImage(8, 8)
			const result = resize(img, 4, 4)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)
		})

		it('should preserve aspect ratio', () => {
			const img = createTestImage(8, 4) // 2:1 aspect ratio
			const result = resize(img, 10, 10, { preserveAspectRatio: true })

			expect(result.width).toBe(10)
			expect(result.height).toBe(10)
			// The actual image should be letterboxed
		})
	})

	describe('crop', () => {
		it('should crop image', () => {
			const img = createTestImage(10, 10)
			const result = crop(img, { x: 2, y: 2, width: 5, height: 5 })

			expect(result.width).toBe(5)
			expect(result.height).toBe(5)
		})

		it('should throw for invalid crop bounds', () => {
			const img = createTestImage(10, 10)

			expect(() => crop(img, { x: 8, y: 0, width: 5, height: 5 })).toThrow()
			expect(() => crop(img, { x: -1, y: 0, width: 5, height: 5 })).toThrow()
		})

		it('should preserve pixel values', () => {
			const img = createTestImage(10, 10)
			const result = crop(img, { x: 0, y: 0, width: 2, height: 2 })

			// First pixel should match
			expect(result.data[0]).toBe(img.data[0])
			expect(result.data[1]).toBe(img.data[1])
			expect(result.data[2]).toBe(img.data[2])
			expect(result.data[3]).toBe(img.data[3])
		})
	})

	describe('autoCrop', () => {
		it('should auto-crop solid border', () => {
			// Create image with black border
			const img = createTestImage(10, 10, 0)
			// Fill center with white
			for (let y = 2; y < 8; y++) {
				for (let x = 2; x < 8; x++) {
					const idx = (y * 10 + x) * 4
					img.data[idx] = 255
					img.data[idx + 1] = 255
					img.data[idx + 2] = 255
					img.data[idx + 3] = 255
				}
			}

			const result = autoCrop(img, { backgroundColor: [0, 0, 0, 0] })

			expect(result.bounds.x).toBe(2)
			expect(result.bounds.y).toBe(2)
			expect(result.bounds.width).toBe(6)
			expect(result.bounds.height).toBe(6)
		})
	})

	describe('extend', () => {
		it('should extend canvas with padding', () => {
			const img = createTestImage(4, 4, 255)
			const result = extend(img, { top: 2, right: 2, bottom: 2, left: 2 }, [0, 0, 0, 255])

			expect(result.width).toBe(8)
			expect(result.height).toBe(8)

			// Corner should be fill color
			expect(result.data[0]).toBe(0)
			// Center should be original
			const centerIdx = (2 * 8 + 2) * 4
			expect(result.data[centerIdx]).toBe(255)
		})
	})

	describe('rotate', () => {
		it('should rotate 90 degrees', () => {
			const img = createTestImage(4, 2)
			const result = rotate90(img)

			expect(result.width).toBe(2)
			expect(result.height).toBe(4)
		})

		it('should rotate 180 degrees', () => {
			const img = createTestImage(4, 4)
			const result = rotate180(img)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)

			// First pixel becomes last
			const lastIdx = (3 * 4 + 3) * 4
			expect(result.data[lastIdx]).toBe(img.data[0])
		})

		it('should rotate 270 degrees', () => {
			const img = createTestImage(4, 2)
			const result = rotate270(img)

			expect(result.width).toBe(2)
			expect(result.height).toBe(4)
		})

		it('should rotate arbitrary angle', () => {
			const img = createTestImage(10, 10, 128)
			const result = rotate(img, { angle: 45 })

			// Canvas should expand to fit rotated image
			expect(result.width).toBeGreaterThan(10)
			expect(result.height).toBeGreaterThan(10)
		})

		it('should handle 0 degree rotation', () => {
			const img = createTestImage(4, 4)
			const result = rotate(img, { angle: 0 })

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)
		})
	})

	describe('flip', () => {
		it('should flip horizontally', () => {
			const img = createTestImage(4, 4)
			const result = flipHorizontal(img)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)

			// First column becomes last
			expect(result.data[(0 * 4 + 3) * 4]).toBe(img.data[(0 * 4 + 0) * 4])
		})

		it('should flip vertically', () => {
			const img = createTestImage(4, 4)
			const result = flipVertical(img)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)

			// First row becomes last
			expect(result.data[(3 * 4 + 0) * 4]).toBe(img.data[(0 * 4 + 0) * 4])
		})

		it('should flip both directions', () => {
			const img = createTestImage(4, 4)
			const result = flip(img, 'both')

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)

			// First pixel becomes last
			const lastIdx = (3 * 4 + 3) * 4
			expect(result.data[lastIdx]).toBe(img.data[0])
		})
	})
})
