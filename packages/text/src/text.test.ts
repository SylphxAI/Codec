import { describe, expect, it } from 'bun:test'
import {
	createTextLabel,
	drawText,
	getBuiltinFont,
	getDefaultFont,
	measureText,
	renderText,
} from './index'

describe('Text Package', () => {
	describe('getBuiltinFont', () => {
		it('should return a valid font', () => {
			const font = getBuiltinFont()

			expect(font.name).toBe('Built-in 8x8')
			expect(font.size).toBe(8)
			expect(font.lineHeight).toBe(10)
			expect(font.glyphs.size).toBeGreaterThan(0)
		})

		it('should have ASCII printable characters', () => {
			const font = getBuiltinFont()

			// Check for letters
			expect(font.glyphs.has(65)).toBe(true) // A
			expect(font.glyphs.has(97)).toBe(true) // a
			expect(font.glyphs.has(90)).toBe(true) // Z
			expect(font.glyphs.has(122)).toBe(true) // z

			// Check for numbers
			expect(font.glyphs.has(48)).toBe(true) // 0
			expect(font.glyphs.has(57)).toBe(true) // 9

			// Check for space
			expect(font.glyphs.has(32)).toBe(true)
		})

		it('should have default glyph', () => {
			const font = getBuiltinFont()
			expect(font.defaultGlyph).toBeDefined()
		})
	})

	describe('getDefaultFont', () => {
		it('should return cached font', () => {
			const font1 = getDefaultFont()
			const font2 = getDefaultFont()
			expect(font1).toBe(font2)
		})
	})

	describe('measureText', () => {
		it('should measure single line', () => {
			const font = getDefaultFont()
			const metrics = measureText('Hello', font)

			expect(metrics.width).toBe(40) // 5 chars * 8 pixels
			expect(metrics.height).toBe(10) // line height
			expect(metrics.lines).toBe(1)
		})

		it('should measure multiple lines', () => {
			const font = getDefaultFont()
			const metrics = measureText('Hello\nWorld', font)

			expect(metrics.lines).toBe(2)
			expect(metrics.height).toBe(20) // 2 * line height
		})

		it('should handle empty string', () => {
			const font = getDefaultFont()
			const metrics = measureText('', font)

			expect(metrics.width).toBe(0)
			expect(metrics.lines).toBe(1)
		})

		it('should respect letter spacing', () => {
			const font = getDefaultFont()
			const metrics = measureText('AB', font, { letterSpacing: 2 })

			// 2 chars * 8 + 1 space * 2 = 18
			expect(metrics.width).toBe(18)
		})

		it('should word wrap', () => {
			const font = getDefaultFont()
			const metrics = measureText('Hello World', font, { wrapWidth: 50 })

			expect(metrics.lines).toBe(2)
		})
	})

	describe('renderText', () => {
		it('should render text to image', () => {
			const image = renderText('Hi')

			expect(image.width).toBe(16) // 2 chars * 8
			expect(image.height).toBe(10) // line height
			expect(image.data.length).toBe(16 * 10 * 4)
		})

		it('should render with custom color', () => {
			const image = renderText('X', getDefaultFont(), { color: [255, 0, 0] })

			// Find a pixel that should be red (part of the X glyph)
			let foundRed = false
			for (let i = 0; i < image.data.length; i += 4) {
				if (image.data[i] === 255 && image.data[i + 1] === 0 && image.data[i + 2] === 0) {
					foundRed = true
					break
				}
			}
			expect(foundRed).toBe(true)
		})

		it('should render with background color', () => {
			const image = renderText('A', getDefaultFont(), {
				backgroundColor: [255, 255, 255, 255],
			})

			// Check first pixel for white background
			expect(image.data[0]).toBe(255)
			expect(image.data[1]).toBe(255)
			expect(image.data[2]).toBe(255)
			expect(image.data[3]).toBe(255)
		})

		it('should render multiple lines', () => {
			const image = renderText('A\nB')

			expect(image.height).toBe(20) // 2 lines
		})

		it('should handle alignment', () => {
			const font = getDefaultFont()

			// Center alignment should work
			const centered = renderText('Hi', font, { wrapWidth: 100, align: 'center' })
			expect(centered.width).toBe(100)

			// Right alignment should work
			const right = renderText('Hi', font, { wrapWidth: 100, align: 'right' })
			expect(right.width).toBe(100)
		})
	})

	describe('drawText', () => {
		it('should draw text onto existing image', () => {
			// Create a white image
			const width = 32
			const height = 16
			const data = new Uint8Array(width * height * 4)
			for (let i = 0; i < data.length; i += 4) {
				data[i] = 255
				data[i + 1] = 255
				data[i + 2] = 255
				data[i + 3] = 255
			}

			const result = drawText({ width, height, data }, 'Hi', getDefaultFont(), {
				x: 0,
				y: 0,
				color: [0, 0, 0],
			})

			expect(result.width).toBe(width)
			expect(result.height).toBe(height)

			// Should have some black pixels now
			let hasBlack = false
			for (let i = 0; i < result.data.length; i += 4) {
				if (result.data[i] === 0 && result.data[i + 1] === 0 && result.data[i + 2] === 0) {
					hasBlack = true
					break
				}
			}
			expect(hasBlack).toBe(true)
		})

		it('should not modify original image', () => {
			const width = 16
			const height = 16
			const data = new Uint8Array(width * height * 4)
			data.fill(255)

			const original = { width, height, data }
			drawText(original, 'X', getDefaultFont(), { x: 0, y: 0 })

			// Original should still be all white
			expect(original.data[0]).toBe(255)
		})

		it('should clip to image bounds', () => {
			const width = 8
			const height = 8
			const data = new Uint8Array(width * height * 4)

			// Draw text at negative position - should not crash
			const result = drawText({ width, height, data }, 'X', getDefaultFont(), {
				x: -4,
				y: -4,
			})

			expect(result.width).toBe(width)
			expect(result.height).toBe(height)
		})
	})

	describe('createTextLabel', () => {
		it('should create label with padding', () => {
			const label = createTextLabel('Hi', getDefaultFont(), { padding: 4 })

			// Text is 16 wide + 4*2 padding = 24
			expect(label.width).toBe(24)
			// Line height is 10 + 4*2 padding = 18
			expect(label.height).toBe(18)
		})

		it('should have background color', () => {
			const label = createTextLabel('X', getDefaultFont(), {
				padding: 2,
				backgroundColor: [200, 200, 200, 255],
			})

			// First pixel should be background color
			expect(label.data[0]).toBe(200)
			expect(label.data[1]).toBe(200)
			expect(label.data[2]).toBe(200)
		})

		it('should have default white background', () => {
			const label = createTextLabel('A', getDefaultFont())

			// Should have some white pixels (background)
			let hasWhite = false
			for (let i = 0; i < label.data.length; i += 4) {
				if (
					label.data[i] === 255 &&
					label.data[i + 1] === 255 &&
					label.data[i + 2] === 255
				) {
					hasWhite = true
					break
				}
			}
			expect(hasWhite).toBe(true)
		})
	})

	describe('glyph rendering', () => {
		it('should render recognizable characters', () => {
			const font = getDefaultFont()

			// Render 'H' and check that it has pixels
			const h = renderText('H', font, { color: [255, 255, 255] })

			let pixelCount = 0
			for (let i = 0; i < h.data.length; i += 4) {
				if (h.data[i] === 255 && h.data[i + 3] === 255) {
					pixelCount++
				}
			}

			// 'H' should have a reasonable number of pixels
			expect(pixelCount).toBeGreaterThan(10)
			expect(pixelCount).toBeLessThan(50)
		})

		it('should use default glyph for unknown characters', () => {
			const font = getDefaultFont()

			// Unicode character not in font
			const image = renderText('你', font, { color: [255, 0, 0] })

			// Should render something (the default glyph)
			let hasRed = false
			for (let i = 0; i < image.data.length; i += 4) {
				if (image.data[i] === 255 && image.data[i + 1] === 0) {
					hasRed = true
					break
				}
			}
			expect(hasRed).toBe(true)
		})
	})
})
