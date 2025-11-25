import { describe, expect, it } from 'bun:test'
import { WBMPCodec } from './codec'
import { decodeWbmp } from './decoder'
import { encodeWbmp } from './encoder'

describe('WBMP Decoder', () => {
	describe('decodeWbmp', () => {
		it('should decode simple WBMP', () => {
			// 8x2 image: first row all white, second row all black
			const wbmp = new Uint8Array([
				0x00, // Type 0
				0x00, // Fixed header
				0x08, // Width = 8
				0x02, // Height = 2
				0xff, // Row 1: all white
				0x00, // Row 2: all black
			])

			const decoded = decodeWbmp(wbmp)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // First pixel white
			expect(decoded.data[32]).toBe(0) // First pixel of second row black
		})

		it('should handle odd width', () => {
			// 3x2 image
			const wbmp = new Uint8Array([
				0x00, // Type 0
				0x00, // Fixed header
				0x03, // Width = 3
				0x02, // Height = 2
				0xe0, // Row 1: 111xxxxx (3 white pixels)
				0x00, // Row 2: 000xxxxx (3 black pixels)
			])

			const decoded = decodeWbmp(wbmp)

			expect(decoded.width).toBe(3)
			expect(decoded.height).toBe(2)
		})

		it('should handle multi-byte dimensions', () => {
			// Width = 128 (requires 2 bytes: 0x81 0x00)
			const wbmp = new Uint8Array([
				0x00, // Type 0
				0x00, // Fixed header
				0x81,
				0x00, // Width = 128
				0x01, // Height = 1
				...new Array(16).fill(0xff), // All white
			])

			const decoded = decodeWbmp(wbmp)

			expect(decoded.width).toBe(128)
			expect(decoded.height).toBe(1)
		})

		it('should throw for unsupported type', () => {
			const wbmp = new Uint8Array([0x01, 0x00, 0x08, 0x08])
			expect(() => decodeWbmp(wbmp)).toThrow('Unsupported WBMP type')
		})
	})

	describe('encodeWbmp', () => {
		it('should encode with correct header', () => {
			const wbmp = encodeWbmp({
				width: 8,
				height: 4,
				data: new Uint8Array(8 * 4 * 4).fill(255),
			})

			expect(wbmp[0]).toBe(0) // Type 0
			expect(wbmp[1]).toBe(0) // Fixed header
			expect(wbmp[2]).toBe(8) // Width
			expect(wbmp[3]).toBe(4) // Height
		})

		it('should encode white pixels correctly', () => {
			const wbmp = encodeWbmp({
				width: 8,
				height: 1,
				data: new Uint8Array(8 * 1 * 4).fill(255), // All white
			})

			expect(wbmp[4]).toBe(0xff) // All bits set = white
		})

		it('should encode black pixels correctly', () => {
			const data = new Uint8Array(8 * 1 * 4)
			// Set alpha to 255, RGB to 0 (black)
			for (let i = 0; i < 8; i++) {
				data[i * 4 + 3] = 255
			}

			const wbmp = encodeWbmp({ width: 8, height: 1, data })

			expect(wbmp[4]).toBe(0x00) // All bits clear = black
		})
	})

	describe('WBMPCodec', () => {
		it('should detect WBMP files', () => {
			const codec = new WBMPCodec()

			const valid = new Uint8Array([0x00, 0x00, 0x08, 0x08])
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new WBMPCodec()
			expect(codec.name).toBe('WBMP')
			expect(codec.extensions).toContain('.wbmp')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip checkerboard pattern', () => {
			const width = 8
			const height = 8
			const data = new Uint8Array(width * height * 4)

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const isWhite = (x + y) % 2 === 0
					const val = isWhite ? 255 : 0
					const pos = (y * width + x) * 4
					data[pos] = val
					data[pos + 1] = val
					data[pos + 2] = val
					data[pos + 3] = 255
				}
			}

			const original = { width, height, data }
			const encoded = encodeWbmp(original)
			const decoded = decodeWbmp(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const isWhite = (x + y) % 2 === 0
					const pos = (y * width + x) * 4
					expect(decoded.data[pos]).toBe(isWhite ? 255 : 0)
				}
			}
		})

		it('should handle non-multiple-of-8 width', () => {
			const width = 13
			const height = 7
			const data = new Uint8Array(width * height * 4).fill(255)

			const original = { width, height, data }
			const encoded = encodeWbmp(original)
			const decoded = decodeWbmp(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
		})
	})
})
