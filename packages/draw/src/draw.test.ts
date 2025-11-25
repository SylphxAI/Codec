import { describe, expect, it } from 'bun:test'
import {
	clear,
	createImage,
	drawCircle,
	drawEllipse,
	drawLine,
	drawPolygon,
	drawRect,
	fillCircle,
	fillEllipse,
	fillGradient,
	fillPolygon,
	fillRect,
	floodFill,
	getPixel,
	setPixel,
} from './primitives'
import type { Color, LinearGradient, Point, RadialGradient } from './types'

describe('Draw', () => {
	describe('pixel operations', () => {
		it('should set and get pixel', () => {
			const img = createImage(4, 4)
			const color: Color = [255, 128, 64, 255]

			setPixel(img, 1, 1, color)
			const result = getPixel(img, 1, 1)

			expect(result).toEqual(color)
		})

		it('should handle out of bounds', () => {
			const img = createImage(4, 4)
			const color: Color = [255, 0, 0, 255]

			// Should not throw
			setPixel(img, -1, -1, color)
			setPixel(img, 100, 100, color)

			// Out of bounds returns transparent
			expect(getPixel(img, -1, -1)).toEqual([0, 0, 0, 0])
		})

		it('should alpha blend', () => {
			const img = createImage(4, 4, [255, 0, 0, 255]) // Red background
			setPixel(img, 1, 1, [0, 255, 0, 128]) // Semi-transparent green

			const result = getPixel(img, 1, 1)
			// Should be blended
			expect(result[0]).toBeLessThan(255) // R reduced
			expect(result[1]).toBeGreaterThan(0) // G increased
		})
	})

	describe('createImage and clear', () => {
		it('should create image with solid color', () => {
			const img = createImage(4, 4, [255, 0, 0, 255])

			expect(img.width).toBe(4)
			expect(img.height).toBe(4)
			expect(getPixel(img, 0, 0)).toEqual([255, 0, 0, 255])
		})

		it('should clear image', () => {
			const img = createImage(4, 4, [255, 0, 0, 255])
			clear(img, [0, 255, 0, 255])

			expect(getPixel(img, 0, 0)).toEqual([0, 255, 0, 255])
		})
	})

	describe('drawLine', () => {
		it('should draw horizontal line', () => {
			const img = createImage(8, 8)
			const color: Color = [255, 0, 0, 255]

			drawLine(img, 0, 4, 7, 4, color)

			// Check line pixels
			expect(getPixel(img, 0, 4)).toEqual(color)
			expect(getPixel(img, 3, 4)).toEqual(color)
			expect(getPixel(img, 7, 4)).toEqual(color)
		})

		it('should draw vertical line', () => {
			const img = createImage(8, 8)
			const color: Color = [0, 255, 0, 255]

			drawLine(img, 4, 0, 4, 7, color)

			expect(getPixel(img, 4, 0)).toEqual(color)
			expect(getPixel(img, 4, 4)).toEqual(color)
		})

		it('should draw diagonal line', () => {
			const img = createImage(8, 8)
			const color: Color = [0, 0, 255, 255]

			drawLine(img, 0, 0, 7, 7, color)

			expect(getPixel(img, 0, 0)).toEqual(color)
			expect(getPixel(img, 4, 4)).toEqual(color)
		})
	})

	describe('drawRect and fillRect', () => {
		it('should draw rectangle outline', () => {
			const img = createImage(8, 8)

			drawRect(img, 1, 1, 4, 4, { stroke: { color: [255, 0, 0, 255] } })

			// Check corners
			expect(getPixel(img, 1, 1)[0]).toBe(255)
			expect(getPixel(img, 4, 1)[0]).toBe(255)
			// Inside should be transparent
			expect(getPixel(img, 2, 2)[3]).toBe(0)
		})

		it('should fill rectangle', () => {
			const img = createImage(8, 8)
			const color: Color = [0, 255, 0, 255]

			fillRect(img, 2, 2, 4, 4, color)

			expect(getPixel(img, 2, 2)).toEqual(color)
			expect(getPixel(img, 5, 5)).toEqual(color)
			// Outside should be transparent
			expect(getPixel(img, 0, 0)[3]).toBe(0)
		})
	})

	describe('drawCircle and fillCircle', () => {
		it('should draw circle outline', () => {
			const img = createImage(16, 16)

			drawCircle(img, 8, 8, 5, { stroke: { color: [255, 0, 0, 255] } })

			// Points on circle
			expect(getPixel(img, 13, 8)[0]).toBe(255) // Right
			expect(getPixel(img, 3, 8)[0]).toBe(255) // Left
		})

		it('should fill circle', () => {
			const img = createImage(16, 16)
			const color: Color = [0, 255, 0, 255]

			fillCircle(img, 8, 8, 4, color)

			// Center should be filled
			expect(getPixel(img, 8, 8)).toEqual(color)
			// Outside should be transparent
			expect(getPixel(img, 0, 0)[3]).toBe(0)
		})
	})

	describe('drawEllipse and fillEllipse', () => {
		it('should draw ellipse outline', () => {
			const img = createImage(16, 16)

			drawEllipse(img, 8, 8, 6, 3, { stroke: { color: [255, 0, 0, 255] } })

			// Check that something was drawn
			let hasRed = false
			for (let i = 0; i < img.data.length; i += 4) {
				if (img.data[i] === 255) {
					hasRed = true
					break
				}
			}
			expect(hasRed).toBe(true)
		})

		it('should fill ellipse', () => {
			const img = createImage(16, 16)
			const color: Color = [0, 0, 255, 255]

			fillEllipse(img, 8, 8, 5, 3, color)

			// Center should be filled
			expect(getPixel(img, 8, 8)).toEqual(color)
		})
	})

	describe('drawPolygon and fillPolygon', () => {
		it('should draw triangle', () => {
			const img = createImage(16, 16)
			const points: Point[] = [
				{ x: 8, y: 2 },
				{ x: 14, y: 12 },
				{ x: 2, y: 12 },
			]

			drawPolygon(img, points, { stroke: { color: [255, 0, 0, 255] } })

			// Should have drawn something
			let hasColor = false
			for (let i = 0; i < img.data.length; i += 4) {
				if (img.data[i] === 255) {
					hasColor = true
					break
				}
			}
			expect(hasColor).toBe(true)
		})

		it('should fill polygon', () => {
			const img = createImage(16, 16)
			const points: Point[] = [
				{ x: 4, y: 4 },
				{ x: 12, y: 4 },
				{ x: 12, y: 12 },
				{ x: 4, y: 12 },
			]
			const color: Color = [0, 255, 0, 255]

			fillPolygon(img, points, color)

			// Inside should be filled
			expect(getPixel(img, 8, 8)).toEqual(color)
		})
	})

	describe('fillGradient', () => {
		it('should fill with linear gradient', () => {
			const img = createImage(8, 8)
			const gradient: LinearGradient = {
				type: 'linear',
				x1: 0,
				y1: 0,
				x2: 7,
				y2: 0,
				stops: [
					{ position: 0, color: [255, 0, 0, 255] },
					{ position: 1, color: [0, 0, 255, 255] },
				],
			}

			fillGradient(img, gradient)

			// Left should be red-ish
			expect(getPixel(img, 0, 4)[0]).toBeGreaterThan(200)
			// Right should be blue-ish
			expect(getPixel(img, 7, 4)[2]).toBeGreaterThan(200)
		})

		it('should fill with radial gradient', () => {
			const img = createImage(16, 16)
			const gradient: RadialGradient = {
				type: 'radial',
				cx: 8,
				cy: 8,
				radius: 8,
				stops: [
					{ position: 0, color: [255, 255, 255, 255] },
					{ position: 1, color: [0, 0, 0, 255] },
				],
			}

			fillGradient(img, gradient)

			// Center should be light
			expect(getPixel(img, 8, 8)[0]).toBeGreaterThan(200)
			// Edge should be dark
			expect(getPixel(img, 0, 0)[0]).toBeLessThan(100)
		})
	})

	describe('floodFill', () => {
		it('should flood fill area', () => {
			const img = createImage(8, 8, [255, 255, 255, 255])

			// Draw a box
			drawRect(img, 2, 2, 4, 4, { stroke: { color: [0, 0, 0, 255] } })

			// Fill inside the box
			floodFill(img, 3, 3, [255, 0, 0, 255])

			// Inside should be red
			expect(getPixel(img, 3, 3)).toEqual([255, 0, 0, 255])
			// Outside should still be white
			expect(getPixel(img, 0, 0)).toEqual([255, 255, 255, 255])
		})

		it('should respect tolerance', () => {
			const img = createImage(8, 8)
			// Fill with slightly different colors
			fillRect(img, 0, 0, 4, 4, [100, 100, 100, 255])
			fillRect(img, 4, 0, 4, 4, [110, 110, 110, 255])

			// Flood fill with high tolerance should fill both
			floodFill(img, 0, 0, [255, 0, 0, 255], 20)

			expect(getPixel(img, 0, 0)).toEqual([255, 0, 0, 255])
			expect(getPixel(img, 5, 0)).toEqual([255, 0, 0, 255])
		})
	})
})
