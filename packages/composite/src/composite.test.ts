import { describe, expect, it } from 'bun:test'
import { blendComponent, getBlendFunction, isComponentBlendMode } from './blend'
import {
	applyMask,
	chromaKey,
	composite,
	flattenLayers,
	premultiplyAlpha,
	unpremultiplyAlpha,
} from './composite'
import type { Layer } from './types'

describe('Composite', () => {
	// Helper to create test image
	function createSolidImage(
		width: number,
		height: number,
		r: number,
		g: number,
		b: number,
		a = 255
	): { width: number; height: number; data: Uint8Array } {
		const data = new Uint8Array(width * height * 4)
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = r
			data[i * 4 + 1] = g
			data[i * 4 + 2] = b
			data[i * 4 + 3] = a
		}
		return { width, height, data }
	}

	describe('blend functions', () => {
		it('should return blend function for each mode', () => {
			const modes = [
				'normal',
				'multiply',
				'screen',
				'overlay',
				'darken',
				'lighten',
				'colorDodge',
				'colorBurn',
				'hardLight',
				'softLight',
				'difference',
				'exclusion',
			] as const

			for (const mode of modes) {
				const fn = getBlendFunction(mode)
				expect(typeof fn).toBe('function')
			}
		})

		it('should correctly apply normal blend', () => {
			const fn = getBlendFunction('normal')
			expect(fn(100, 200)).toBe(200)
		})

		it('should correctly apply multiply blend', () => {
			const fn = getBlendFunction('multiply')
			expect(fn(255, 255)).toBe(255)
			expect(fn(0, 255)).toBe(0)
			expect(fn(128, 128)).toBeCloseTo(64, 0)
		})

		it('should correctly apply screen blend', () => {
			const fn = getBlendFunction('screen')
			expect(fn(0, 0)).toBe(0)
			expect(fn(255, 255)).toBe(255)
		})

		it('should identify component blend modes', () => {
			expect(isComponentBlendMode('hue')).toBe(true)
			expect(isComponentBlendMode('saturation')).toBe(true)
			expect(isComponentBlendMode('color')).toBe(true)
			expect(isComponentBlendMode('luminosity')).toBe(true)
			expect(isComponentBlendMode('normal')).toBe(false)
			expect(isComponentBlendMode('multiply')).toBe(false)
		})

		it('should blend component modes', () => {
			const result = blendComponent(255, 0, 0, 0, 255, 0, 'hue')
			expect(result).toHaveLength(3)
		})
	})

	describe('composite', () => {
		it('should composite with normal blend mode', () => {
			const base = createSolidImage(4, 4, 255, 0, 0)
			const overlay = createSolidImage(2, 2, 0, 255, 0)

			const result = composite(base, overlay, { x: 1, y: 1 })

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)

			// Check overlaid area
			const idx = (1 * 4 + 1) * 4
			expect(result.data[idx]).toBe(0) // Green overlay
			expect(result.data[idx + 1]).toBe(255)
		})

		it('should handle opacity', () => {
			const base = createSolidImage(4, 4, 255, 0, 0)
			const overlay = createSolidImage(4, 4, 0, 255, 0)

			const result = composite(base, overlay, { opacity: 0.5 })

			// Should be mix of red and green
			expect(result.data[0]).toBeCloseTo(128, -1)
			expect(result.data[1]).toBeCloseTo(128, -1)
		})

		it('should apply multiply blend mode', () => {
			const base = createSolidImage(4, 4, 200, 200, 200)
			const overlay = createSolidImage(4, 4, 128, 128, 128)

			const result = composite(base, overlay, { blendMode: 'multiply' })

			expect(result.width).toBe(4)
		})

		it('should handle out of bounds overlay', () => {
			const base = createSolidImage(4, 4, 255, 0, 0)
			const overlay = createSolidImage(2, 2, 0, 255, 0)

			// Overlay partially outside
			const result = composite(base, overlay, { x: 3, y: 3 })

			expect(result.width).toBe(4)
		})
	})

	describe('flattenLayers', () => {
		it('should flatten multiple layers', () => {
			const layers: Layer[] = [
				{ image: createSolidImage(4, 4, 255, 0, 0) },
				{ image: createSolidImage(2, 2, 0, 255, 0), x: 1, y: 1 },
			]

			const result = flattenLayers(layers, 4, 4)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)
		})

		it('should respect layer visibility', () => {
			const layers: Layer[] = [
				{ image: createSolidImage(4, 4, 255, 0, 0) },
				{ image: createSolidImage(4, 4, 0, 255, 0), visible: false },
			]

			const result = flattenLayers(layers, 4, 4)

			// Should only have red (first layer)
			expect(result.data[0]).toBe(255)
			expect(result.data[1]).toBe(0)
		})

		it('should apply layer opacity', () => {
			const layers: Layer[] = [
				{ image: createSolidImage(4, 4, 255, 0, 0) },
				{ image: createSolidImage(4, 4, 0, 255, 0), opacity: 0.5 },
			]

			const result = flattenLayers(layers, 4, 4)

			// Should be mix
			expect(result.data[0]).toBeCloseTo(128, -1)
		})

		it('should apply layer blend modes', () => {
			const layers: Layer[] = [
				{ image: createSolidImage(4, 4, 200, 200, 200) },
				{ image: createSolidImage(4, 4, 128, 128, 128), blendMode: 'multiply' },
			]

			const result = flattenLayers(layers, 4, 4)

			expect(result.width).toBe(4)
		})
	})

	describe('applyMask', () => {
		it('should apply grayscale mask', () => {
			const image = createSolidImage(4, 4, 255, 0, 0)
			const mask = createSolidImage(4, 4, 128, 128, 128)

			const result = applyMask(image, mask)

			// Alpha should be ~128
			expect(result.data[3]).toBeCloseTo(128, 0)
		})

		it('should make fully white mask transparent', () => {
			const image = createSolidImage(4, 4, 255, 0, 0)
			const mask = createSolidImage(4, 4, 0, 0, 0)

			const result = applyMask(image, mask)

			// Alpha should be 0
			expect(result.data[3]).toBe(0)
		})
	})

	describe('chromaKey', () => {
		it('should key out green color', () => {
			const image = createSolidImage(4, 4, 0, 255, 0)

			const result = chromaKey(image, [0, 255, 0], 30)

			// Should be transparent
			expect(result.data[3]).toBe(0)
		})

		it('should keep non-key colors', () => {
			const image = createSolidImage(4, 4, 255, 0, 0)

			const result = chromaKey(image, [0, 255, 0], 30)

			// Should be opaque
			expect(result.data[3]).toBe(255)
		})

		it('should handle tolerance', () => {
			const image = createSolidImage(4, 4, 0, 200, 0) // Close to green

			const result = chromaKey(image, [0, 255, 0], 60)

			// Should be partially transparent
			expect(result.data[3]).toBeLessThan(255)
		})
	})

	describe('alpha operations', () => {
		it('should premultiply alpha', () => {
			const image = createSolidImage(4, 4, 200, 100, 50, 128)

			const result = premultiplyAlpha(image)

			expect(result.data[0]).toBeCloseTo(100, 0) // 200 * 0.5
			expect(result.data[1]).toBeCloseTo(50, 0) // 100 * 0.5
			expect(result.data[2]).toBeCloseTo(25, 0) // 50 * 0.5
			expect(result.data[3]).toBe(128) // Alpha unchanged
		})

		it('should unpremultiply alpha', () => {
			const image = createSolidImage(4, 4, 100, 50, 25, 128)

			const result = unpremultiplyAlpha(image)

			// Allow small rounding differences
			expect(result.data[0]).toBeGreaterThanOrEqual(198)
			expect(result.data[0]).toBeLessThanOrEqual(201)
			expect(result.data[1]).toBeGreaterThanOrEqual(98)
			expect(result.data[1]).toBeLessThanOrEqual(101)
			expect(result.data[2]).toBeGreaterThanOrEqual(48)
			expect(result.data[2]).toBeLessThanOrEqual(51)
			expect(result.data[3]).toBe(128)
		})

		it('should handle zero alpha in unpremultiply', () => {
			const image = createSolidImage(4, 4, 100, 50, 25, 0)

			const result = unpremultiplyAlpha(image)

			expect(result.data[0]).toBe(0)
			expect(result.data[1]).toBe(0)
			expect(result.data[2]).toBe(0)
		})
	})
})
