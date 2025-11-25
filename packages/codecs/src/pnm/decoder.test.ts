import { describe, expect, test } from 'bun:test'
import { PbmCodec, PgmCodec, PpmCodec } from './codec'

describe('PNM Codec', () => {
	// Helper to create a simple test image
	const createTestImage = (width: number, height: number) => ({
		width,
		height,
		data: new Uint8Array(width * height * 4).map((_, i) => {
			const pixel = Math.floor(i / 4)
			const channel = i % 4
			if (channel === 3) return 255 // Alpha
			return (pixel * 17 + channel * 50) % 256
		}),
	})

	describe('PPM', () => {
		test('encodes PPM with correct header', () => {
			const image = createTestImage(4, 4)
			const encoded = PpmCodec.encode(image)

			// Check header
			const text = new TextDecoder().decode(encoded.slice(0, 20))
			expect(text.startsWith('P6\n4 4\n255\n')).toBe(true)
		})

		test('encodes RGB data', () => {
			const image = createTestImage(2, 2)
			const encoded = PpmCodec.encode(image)

			// Header: "P6\n2 2\n255\n" = 11 bytes
			const headerEnd = encoded.indexOf(0x0a, encoded.indexOf(0x0a, 3) + 1) + 1
			expect(encoded.length).toBe(headerEnd + 2 * 2 * 3) // 4 pixels * 3 channels
		})

		test('preserves pixel data through encode/decode cycle', () => {
			const original = createTestImage(4, 4)
			const encoded = PpmCodec.encode(original)
			const decoded = PpmCodec.decode(encoded)

			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)

			// Compare RGB values (alpha is always 255)
			for (let i = 0; i < original.data.length; i += 4) {
				expect(decoded.data[i]).toBe(original.data[i]) // R
				expect(decoded.data[i + 1]).toBe(original.data[i + 1]) // G
				expect(decoded.data[i + 2]).toBe(original.data[i + 2]) // B
				expect(decoded.data[i + 3]).toBe(255) // A
			}
		})

		test('handles large image', () => {
			const original = createTestImage(256, 256)
			const encoded = PpmCodec.encode(original)
			const decoded = PpmCodec.decode(encoded)

			expect(decoded.width).toBe(256)
			expect(decoded.height).toBe(256)
		})
	})

	describe('PGM', () => {
		test('encodes PGM with correct header', () => {
			const image = createTestImage(4, 4)
			const encoded = PgmCodec.encode(image)

			const text = new TextDecoder().decode(encoded.slice(0, 20))
			expect(text.startsWith('P5\n4 4\n255\n')).toBe(true)
		})

		test('encodes grayscale data', () => {
			const image = createTestImage(2, 2)
			const encoded = PgmCodec.encode(image)

			// Find header end
			const headerEnd = encoded.indexOf(0x0a, encoded.indexOf(0x0a, 3) + 1) + 1
			expect(encoded.length).toBe(headerEnd + 2 * 2) // 4 pixels * 1 channel
		})

		test('round-trips correctly', () => {
			const original = createTestImage(4, 4)
			const encoded = PgmCodec.encode(original)
			const decoded = PgmCodec.decode(encoded)

			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)

			// Check that all channels are the same (grayscale)
			for (let i = 0; i < decoded.data.length; i += 4) {
				expect(decoded.data[i]).toBe(decoded.data[i + 1])
				expect(decoded.data[i + 1]).toBe(decoded.data[i + 2])
				expect(decoded.data[i + 3]).toBe(255)
			}
		})
	})

	describe('PBM', () => {
		test('encodes PBM with correct header', () => {
			const image = createTestImage(8, 8)
			const encoded = PbmCodec.encode(image)

			const text = new TextDecoder().decode(encoded.slice(0, 10))
			expect(text.startsWith('P4\n8 8\n')).toBe(true)
		})

		test('encodes packed bits', () => {
			const image = createTestImage(8, 1) // 8 pixels = 1 byte
			const encoded = PbmCodec.encode(image)

			// Find header end
			const headerEnd = encoded.indexOf(0x0a, 3) + 1
			expect(encoded.length).toBe(headerEnd + 1) // 8 pixels packed into 1 byte
		})

		test('round-trips correctly', () => {
			const original = {
				width: 8,
				height: 8,
				data: new Uint8Array(8 * 8 * 4).map((_, i) => {
					const pixel = Math.floor(i / 4)
					const channel = i % 4
					if (channel === 3) return 255
					// Create pattern of black and white
					return pixel % 2 === 0 ? 0 : 255
				}),
			}

			const encoded = PbmCodec.encode(original)
			const decoded = PbmCodec.decode(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)

			// Check that pixels are either black (0,0,0) or white (255,255,255)
			for (let i = 0; i < decoded.data.length; i += 4) {
				const r = decoded.data[i]
				expect(r === 0 || r === 255).toBe(true)
				expect(decoded.data[i + 1]).toBe(r)
				expect(decoded.data[i + 2]).toBe(r)
			}
		})

		test('handles non-byte-aligned width', () => {
			const original = {
				width: 5, // Not divisible by 8
				height: 3,
				data: new Uint8Array(5 * 3 * 4).fill(255), // All white
			}
			original.data[3] = 255 // Alpha

			const encoded = PbmCodec.encode(original)
			const decoded = PbmCodec.decode(encoded)

			expect(decoded.width).toBe(5)
			expect(decoded.height).toBe(3)
		})
	})

	describe('ASCII formats', () => {
		test('decodes P1 (ASCII PBM)', () => {
			const ascii = `P1
# Comment
4 2
0 1 0 1
1 0 1 0`
			const data = new TextEncoder().encode(ascii)
			const decoded = PbmCodec.decode(data)

			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(2)

			// First row: white, black, white, black
			expect(decoded.data[0]).toBe(255) // White
			expect(decoded.data[4]).toBe(0) // Black
			expect(decoded.data[8]).toBe(255) // White
			expect(decoded.data[12]).toBe(0) // Black
		})

		test('decodes P2 (ASCII PGM)', () => {
			const ascii = `P2
2 2
255
0 128
255 64`
			const data = new TextEncoder().encode(ascii)
			const decoded = PgmCodec.decode(data)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)

			expect(decoded.data[0]).toBe(0) // First pixel
			expect(decoded.data[4]).toBe(128) // Second pixel
			expect(decoded.data[8]).toBe(255) // Third pixel
			expect(decoded.data[12]).toBe(64) // Fourth pixel
		})

		test('decodes P3 (ASCII PPM)', () => {
			const ascii = `P3
2 2
255
255 0 0   0 255 0
0 0 255   255 255 0`
			const data = new TextEncoder().encode(ascii)
			const decoded = PpmCodec.decode(data)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)

			// Red pixel
			expect(decoded.data[0]).toBe(255)
			expect(decoded.data[1]).toBe(0)
			expect(decoded.data[2]).toBe(0)

			// Green pixel
			expect(decoded.data[4]).toBe(0)
			expect(decoded.data[5]).toBe(255)
			expect(decoded.data[6]).toBe(0)
		})
	})

	describe('edge cases', () => {
		test('handles 1x1 image', () => {
			const original = {
				width: 1,
				height: 1,
				data: new Uint8Array([255, 128, 64, 255]),
			}
			const encoded = PpmCodec.encode(original)
			const decoded = PpmCodec.decode(encoded)

			expect(decoded.width).toBe(1)
			expect(decoded.height).toBe(1)
			expect(decoded.data[0]).toBe(255)
			expect(decoded.data[1]).toBe(128)
			expect(decoded.data[2]).toBe(64)
		})

		test('throws on invalid format', () => {
			const invalid = new TextEncoder().encode('P9\n1 1\n255\n')
			expect(() => PpmCodec.decode(invalid)).toThrow()
		})

		test('handles comments in header', () => {
			const withComments = `P6
# This is a comment
4 # width
4 # height
# maxval follows
255
`
			const data = new Uint8Array(withComments.length + 4 * 4 * 3)
			const headerBytes = new TextEncoder().encode(withComments)
			data.set(headerBytes)
			// Fill with RGB data
			for (let i = headerBytes.length; i < data.length; i++) {
				data[i] = 128
			}

			const decoded = PpmCodec.decode(data)
			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)
		})
	})
})
