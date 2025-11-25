import { describe, expect, it } from 'bun:test'
import { XBMCodec } from './codec'
import { decodeXbm } from './decoder'
import { encodeXbm } from './encoder'

describe('XBM Decoder', () => {
	describe('decodeXbm', () => {
		it('should decode simple XBM', () => {
			const xbm = `#define test_width 8
#define test_height 2
static unsigned char test_bits[] = {
   0x00, 0xff,
   0xaa, 0x55
};`

			const decoded = decodeXbm(new TextEncoder().encode(xbm))

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(2)
			// First row: 0x00 = all white, 0xff = all black (but only 8 pixels)
			expect(decoded.data[0]).toBe(255) // white
			expect(decoded.data[4]).toBe(255) // white
		})

		it('should handle odd width', () => {
			const xbm = `#define test_width 3
#define test_height 2
static unsigned char test_bits[] = {
   0x05, 0x02
};`

			const decoded = decodeXbm(new TextEncoder().encode(xbm))

			expect(decoded.width).toBe(3)
			expect(decoded.height).toBe(2)
		})

		it('should throw for invalid XBM', () => {
			expect(() => decodeXbm(new TextEncoder().encode(''))).toThrow()
			expect(() => decodeXbm(new TextEncoder().encode('#define test_width 8'))).toThrow()
		})

		it('should handle LSB bit ordering', () => {
			// 0x01 = bit 0 set = first pixel black
			const xbm = `#define test_width 8
#define test_height 1
static unsigned char test_bits[] = {
   0x01
};`

			const decoded = decodeXbm(new TextEncoder().encode(xbm))

			expect(decoded.data[0]).toBe(0) // First pixel black (bit 0 = 1)
			expect(decoded.data[4]).toBe(255) // Second pixel white (bit 1 = 0)
		})
	})

	describe('encodeXbm', () => {
		it('should encode with correct header', () => {
			const xbm = encodeXbm(
				{
					width: 8,
					height: 4,
					data: new Uint8Array(8 * 4 * 4).fill(255),
				},
				{ name: 'test' }
			)

			const text = new TextDecoder().decode(xbm)

			expect(text).toContain('#define test_width 8')
			expect(text).toContain('#define test_height 4')
			expect(text).toContain('static unsigned char test_bits[]')
		})

		it('should use threshold for conversion', () => {
			// Create image with gradient
			const width = 8
			const height = 1
			const data = new Uint8Array(width * height * 4)

			for (let x = 0; x < width; x++) {
				const val = (x * 32) % 256
				data[x * 4] = val
				data[x * 4 + 1] = val
				data[x * 4 + 2] = val
				data[x * 4 + 3] = 255
			}

			const xbm = encodeXbm({ width, height, data }, { threshold: 128 })
			const text = new TextDecoder().decode(xbm)

			expect(text).toContain('0x')
		})
	})

	describe('XBMCodec', () => {
		it('should detect XBM files', () => {
			const codec = new XBMCodec()

			const valid = new TextEncoder().encode('#define img_width 10\n#define img_height 10')
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new XBMCodec()
			expect(codec.name).toBe('XBM')
			expect(codec.extensions).toContain('.xbm')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip black and white image', () => {
			// Create checkerboard pattern
			const width = 8
			const height = 8
			const data = new Uint8Array(width * height * 4)

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const isBlack = (x + y) % 2 === 0
					const val = isBlack ? 0 : 255
					const pos = (y * width + x) * 4
					data[pos] = val
					data[pos + 1] = val
					data[pos + 2] = val
					data[pos + 3] = 255
				}
			}

			const original = { width, height, data }
			const encoded = encodeXbm(original)
			const decoded = decodeXbm(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)

			// Check pattern preserved
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const isBlack = (x + y) % 2 === 0
					const pos = (y * width + x) * 4
					expect(decoded.data[pos]).toBe(isBlack ? 0 : 255)
				}
			}
		})

		it('should handle non-multiple-of-8 width', () => {
			const width = 10
			const height = 5
			const data = new Uint8Array(width * height * 4)

			// All white
			for (let i = 0; i < width * height; i++) {
				data[i * 4] = 255
				data[i * 4 + 1] = 255
				data[i * 4 + 2] = 255
				data[i * 4 + 3] = 255
			}

			const original = { width, height, data }
			const encoded = encodeXbm(original)
			const decoded = decodeXbm(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
		})
	})
})
