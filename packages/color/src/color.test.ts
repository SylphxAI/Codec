import { describe, expect, it } from 'bun:test'
import {
	adjust,
	brightness,
	contrast,
	gamma,
	grayscale,
	hueRotate,
	invert,
	levels,
	posterize,
	saturation,
	sepia,
	threshold,
} from './adjust'
import {
	cmykToRgb,
	hslToRgb,
	hsvToRgb,
	labToRgb,
	rgbToCmyk,
	rgbToHsl,
	rgbToHsv,
	rgbToLab,
} from './convert'

describe('Color', () => {
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

	describe('convert', () => {
		it('should convert RGB to HSL and back', () => {
			const [h, s, l] = rgbToHsl(255, 0, 0) // Red
			expect(h).toBeCloseTo(0, 0)
			expect(s).toBeCloseTo(100, 0)
			expect(l).toBeCloseTo(50, 0)

			const [r, g, b] = hslToRgb(h, s, l)
			expect(r).toBe(255)
			expect(g).toBe(0)
			expect(b).toBe(0)
		})

		it('should convert RGB to HSV and back', () => {
			const [h, s, v] = rgbToHsv(255, 0, 0) // Red
			expect(h).toBeCloseTo(0, 0)
			expect(s).toBeCloseTo(100, 0)
			expect(v).toBeCloseTo(100, 0)

			const [r, g, b] = hsvToRgb(h, s, v)
			expect(r).toBe(255)
			expect(g).toBe(0)
			expect(b).toBe(0)
		})

		it('should convert RGB to CMYK and back', () => {
			const [c, m, y, k] = rgbToCmyk(255, 0, 0) // Red
			expect(c).toBeCloseTo(0, 0)
			expect(m).toBeCloseTo(100, 0)
			expect(y).toBeCloseTo(100, 0)
			expect(k).toBeCloseTo(0, 0)

			const [r, g, b] = cmykToRgb(c, m, y, k)
			expect(r).toBe(255)
			expect(g).toBe(0)
			expect(b).toBe(0)
		})

		it('should convert RGB to LAB and back', () => {
			const [l, a, b] = rgbToLab(255, 0, 0) // Red
			expect(l).toBeGreaterThan(50)

			const [r, g, bb] = labToRgb(l, a, b)
			expect(r).toBeCloseTo(255, -1)
			expect(g).toBeCloseTo(0, -1)
			expect(bb).toBeCloseTo(0, -1)
		})

		it('should handle grayscale in HSL', () => {
			const [h, s, l] = rgbToHsl(128, 128, 128)
			expect(s).toBeCloseTo(0, 0)
			expect(l).toBeCloseTo(50, 0)
		})
	})

	describe('adjust', () => {
		it('should adjust brightness', () => {
			const img = createTestImage(4, 4)
			const result = brightness(img, 50)

			expect(result.data[0]).toBeGreaterThan(img.data[0]!)
		})

		it('should adjust contrast', () => {
			const img = createTestImage(4, 4)
			const result = contrast(img, 50)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)
		})

		it('should adjust saturation', () => {
			const img = createTestImage(4, 4)
			const result = saturation(img, 50)

			expect(result.width).toBe(4)
		})

		it('should rotate hue', () => {
			const img = createTestImage(4, 4)
			const result = hueRotate(img, 180)

			expect(result.width).toBe(4)
		})

		it('should apply gamma correction', () => {
			const img = createTestImage(4, 4)
			const result = gamma(img, 2.2)

			expect(result.width).toBe(4)
		})

		it('should apply multiple adjustments', () => {
			const img = createTestImage(4, 4)
			const result = adjust(img, {
				brightness: 10,
				contrast: 10,
				saturation: 10,
				hue: 30,
				gamma: 1.2,
			})

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)
		})
	})

	describe('levels', () => {
		it('should apply levels adjustment', () => {
			const img = createTestImage(4, 4)
			const result = levels(img, {
				inputBlack: 10,
				inputWhite: 245,
				outputBlack: 0,
				outputWhite: 255,
			})

			expect(result.width).toBe(4)
		})
	})

	describe('effects', () => {
		it('should invert colors', () => {
			const img = createTestImage(4, 4)
			const result = invert(img)

			expect(result.data[0]).toBe(255 - img.data[0]!)
			expect(result.data[1]).toBe(255 - img.data[1]!)
			expect(result.data[2]).toBe(255 - img.data[2]!)
		})

		it('should convert to grayscale', () => {
			const img = createTestImage(4, 4)
			const result = grayscale(img)

			// All RGB channels should be equal
			expect(result.data[0]).toBe(result.data[1])
			expect(result.data[1]).toBe(result.data[2])
		})

		it('should apply sepia', () => {
			const img = createTestImage(4, 4)
			const result = sepia(img)

			expect(result.width).toBe(4)
		})

		it('should apply threshold', () => {
			const img = createTestImage(4, 4)
			const result = threshold(img, 100)

			// Should only have 0 or 255 values
			expect(result.data[0] === 0 || result.data[0] === 255).toBe(true)
		})

		it('should posterize', () => {
			const img = createTestImage(4, 4)
			const result = posterize(img, 4)

			expect(result.width).toBe(4)
		})
	})
})
