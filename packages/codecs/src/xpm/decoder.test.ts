import { describe, expect, it } from 'bun:test'
import { XPMCodec } from './codec'
import { decodeXpm } from './decoder'
import { encodeXpm } from './encoder'

describe('XPM Decoder', () => {
	describe('decodeXpm', () => {
		it('should decode simple XPM', () => {
			const xpm = `/* XPM */
static char *image[] = {
"2 2 2 1",
"R\tc #ff0000",
"G\tc #00ff00",
"RG",
"GR"
};`

			const decoded = decodeXpm(new TextEncoder().encode(xpm))

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[4]).toBe(0) // Green pixel R
			expect(decoded.data[5]).toBe(255) // Green pixel G
		})

		it('should handle transparent color', () => {
			const xpm = `/* XPM */
static char *image[] = {
"2 1 2 1",
". c None",
"X c #000000",
".X"
};`

			const decoded = decodeXpm(new TextEncoder().encode(xpm))

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(1)
			expect(decoded.data[3]).toBe(0) // First pixel transparent
			expect(decoded.data[7]).toBe(255) // Second pixel opaque
		})

		it('should handle 2 chars per pixel', () => {
			const xpm = `/* XPM */
static char *image[] = {
"2 2 2 2",
"AA c #ff0000",
"BB c #0000ff",
"AABB",
"BBAA"
};`

			const decoded = decodeXpm(new TextEncoder().encode(xpm))

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // Red
			expect(decoded.data[6]).toBe(255) // Blue
		})

		it('should handle named colors', () => {
			const xpm = `/* XPM */
static char *image[] = {
"2 1 2 1",
"R c red",
"B c blue",
"RB"
};`

			const decoded = decodeXpm(new TextEncoder().encode(xpm))

			expect(decoded.width).toBe(2)
			expect(decoded.data[0]).toBe(255) // red R
			expect(decoded.data[6]).toBe(255) // blue B
		})

		it('should throw for invalid XPM', () => {
			expect(() => decodeXpm(new TextEncoder().encode(''))).toThrow()
		})
	})

	describe('encodeXpm', () => {
		it('should encode with correct header', () => {
			const xpm = encodeXpm({
				width: 2,
				height: 2,
				data: new Uint8Array([
					255,
					0,
					0,
					255, // Red
					0,
					255,
					0,
					255, // Green
					0,
					0,
					255,
					255, // Blue
					255,
					255,
					0,
					255, // Yellow
				]),
			})

			const text = new TextDecoder().decode(xpm)

			expect(text).toContain('/* XPM */')
			expect(text).toContain('2 2')
		})

		it('should encode transparent pixels', () => {
			const xpm = encodeXpm({
				width: 1,
				height: 1,
				data: new Uint8Array([0, 0, 0, 0]),
			})

			const text = new TextDecoder().decode(xpm)
			expect(text).toContain('None')
		})

		it('should use appropriate chars per pixel', () => {
			// Small palette - 1 cpp
			const xpm1 = encodeXpm({
				width: 2,
				height: 1,
				data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
			})

			const text1 = new TextDecoder().decode(xpm1)
			expect(text1).toContain('2 1 2 1') // 1 char per pixel
		})
	})

	describe('XPMCodec', () => {
		it('should detect XPM files', () => {
			const codec = new XPMCodec()

			const valid = new TextEncoder().encode('/* XPM */ blah')
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new XPMCodec()
			expect(codec.name).toBe('XPM')
			expect(codec.extensions).toContain('.xpm')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip simple image', () => {
			const original = {
				width: 3,
				height: 3,
				data: new Uint8Array([
					255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 128,
					128, 128, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
				]),
			}

			const encoded = encodeXpm(original)
			const decoded = decodeXpm(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})

		it('should handle transparency', () => {
			const original = {
				width: 2,
				height: 2,
				data: new Uint8Array([
					255,
					0,
					0,
					255,
					0,
					0,
					0,
					0, // transparent
					0,
					0,
					0,
					0, // transparent
					0,
					0,
					255,
					255,
				]),
			}

			const encoded = encodeXpm(original)
			const decoded = decodeXpm(encoded)

			expect(decoded.data[7]).toBe(0) // transparent alpha
			expect(decoded.data[11]).toBe(0) // transparent alpha
		})

		it('should handle larger images', () => {
			const width = 16
			const height = 16
			const data = new Uint8Array(width * height * 4)

			// Create gradient
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const i = (y * width + x) * 4
					data[i] = (x * 16) % 256
					data[i + 1] = (y * 16) % 256
					data[i + 2] = 0
					data[i + 3] = 255
				}
			}

			const original = { width, height, data }
			const encoded = encodeXpm(original)
			const decoded = decodeXpm(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)

			for (let i = 0; i < data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})
	})
})
