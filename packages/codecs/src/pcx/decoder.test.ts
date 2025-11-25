import { describe, expect, test } from 'bun:test'
import { PcxCodec } from './codec'
import { PCX_SIGNATURE, PcxEncoding, PcxVersion } from './types'

describe('PCX Codec', () => {
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

	// Helper to create image with runs (good for RLE)
	const createRunImage = (width: number, height: number) => ({
		width,
		height,
		data: new Uint8Array(width * height * 4).map((_, i) => {
			const channel = i % 4
			if (channel === 3) return 255
			return 128 // Same color for all pixels
		}),
	})

	describe('encode', () => {
		test('encodes PCX with correct signature', () => {
			const image = createTestImage(4, 4)
			const encoded = PcxCodec.encode(image)

			expect(encoded[0]).toBe(PCX_SIGNATURE)
		})

		test('encodes with version 3.0', () => {
			const image = createTestImage(4, 4)
			const encoded = PcxCodec.encode(image)

			expect(encoded[1]).toBe(PcxVersion.V30)
		})

		test('encodes with RLE compression', () => {
			const image = createTestImage(4, 4)
			const encoded = PcxCodec.encode(image)

			expect(encoded[2]).toBe(PcxEncoding.RLE)
		})

		test('encodes dimensions correctly', () => {
			const image = createTestImage(256, 128)
			const encoded = PcxCodec.encode(image)

			// xMax = width - 1
			const xMax = encoded[8]! | (encoded[9]! << 8)
			expect(xMax).toBe(255)

			// yMax = height - 1
			const yMax = encoded[10]! | (encoded[11]! << 8)
			expect(yMax).toBe(127)
		})

		test('encodes as 24-bit (3 planes)', () => {
			const image = createTestImage(4, 4)
			const encoded = PcxCodec.encode(image)

			expect(encoded[3]).toBe(8) // Bits per pixel
			expect(encoded[65]).toBe(3) // Number of planes
		})

		test('compresses solid color efficiently', () => {
			const image = createRunImage(64, 64)
			const encoded = PcxCodec.encode(image)

			// Solid color should compress well with RLE
			const uncompressedSize = 128 + 64 * 64 * 3
			expect(encoded.length).toBeLessThan(uncompressedSize / 2)
		})
	})

	describe('decode', () => {
		test('decodes encoded PCX', () => {
			const original = createTestImage(8, 8)
			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
			expect(decoded.data.length).toBe(8 * 8 * 4)
		})

		test('preserves RGB data through encode/decode cycle', () => {
			const original = createTestImage(4, 4)
			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			// Compare RGB values (alpha may differ since PCX is 24-bit)
			for (let i = 0; i < original.data.length; i += 4) {
				expect(decoded.data[i]).toBe(original.data[i]) // R
				expect(decoded.data[i + 1]).toBe(original.data[i + 1]) // G
				expect(decoded.data[i + 2]).toBe(original.data[i + 2]) // B
			}
		})

		test('handles solid color image', () => {
			const original = createRunImage(32, 32)
			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			// All pixels should be the same color
			for (let i = 0; i < decoded.data.length; i += 4) {
				expect(decoded.data[i]).toBe(128)
				expect(decoded.data[i + 1]).toBe(128)
				expect(decoded.data[i + 2]).toBe(128)
			}
		})
	})

	describe('edge cases', () => {
		test('handles 1x1 image', () => {
			const original = {
				width: 1,
				height: 1,
				data: new Uint8Array([255, 128, 64, 255]),
			}
			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			expect(decoded.width).toBe(1)
			expect(decoded.height).toBe(1)
			expect(decoded.data[0]).toBe(255)
			expect(decoded.data[1]).toBe(128)
			expect(decoded.data[2]).toBe(64)
		})

		test('handles large image', () => {
			const original = createTestImage(256, 256)
			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			expect(decoded.width).toBe(256)
			expect(decoded.height).toBe(256)
		})

		test('handles odd width (padding)', () => {
			const original = createTestImage(5, 3) // 5 is odd
			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			expect(decoded.width).toBe(5)
			expect(decoded.height).toBe(3)

			// Check original pixels are preserved
			for (let i = 0; i < original.data.length; i += 4) {
				expect(decoded.data[i]).toBe(original.data[i])
				expect(decoded.data[i + 1]).toBe(original.data[i + 1])
				expect(decoded.data[i + 2]).toBe(original.data[i + 2])
			}
		})

		test('throws on invalid PCX', () => {
			expect(() => PcxCodec.decode(new Uint8Array([0, 1, 2]))).toThrow()
		})

		test('throws on bad signature', () => {
			const badData = new Uint8Array(128)
			badData[0] = 0x00 // Wrong signature
			expect(() => PcxCodec.decode(badData)).toThrow('Invalid PCX: bad signature')
		})
	})

	describe('RLE edge cases', () => {
		test('handles bytes that look like RLE markers', () => {
			// Create image with byte values >= 0xC0
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).map((_, i) => {
					const channel = i % 4
					if (channel === 3) return 255
					return 0xc5 // Value >= 0xC0 that must be RLE-encoded
				}),
			}

			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			for (let i = 0; i < original.data.length; i += 4) {
				expect(decoded.data[i]).toBe(0xc5)
				expect(decoded.data[i + 1]).toBe(0xc5)
				expect(decoded.data[i + 2]).toBe(0xc5)
			}
		})

		test('handles alternating pixels (worst case for RLE)', () => {
			const original = {
				width: 8,
				height: 1,
				data: new Uint8Array(8 * 1 * 4).map((_, i) => {
					const pixel = Math.floor(i / 4)
					const channel = i % 4
					if (channel === 3) return 255
					return pixel % 2 === 0 ? 0 : 255
				}),
			}

			const encoded = PcxCodec.encode(original)
			const decoded = PcxCodec.decode(encoded)

			expect(decoded.width).toBe(8)

			// Check alternating pattern preserved
			for (let x = 0; x < 8; x++) {
				const expected = x % 2 === 0 ? 0 : 255
				expect(decoded.data[x * 4]).toBe(expected)
			}
		})
	})
})
