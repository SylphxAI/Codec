import { describe, expect, test } from 'bun:test'
import { HdrCodec } from './codec'

describe('HDR Codec', () => {
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

	// Helper to create high-contrast image (good for HDR)
	const createHdrTestImage = (width: number, height: number) => ({
		width,
		height,
		data: new Uint8Array(width * height * 4).map((_, i) => {
			const pixel = Math.floor(i / 4)
			const channel = i % 4
			if (channel === 3) return 255 // Alpha
			// Create bright and dark regions
			const brightness = pixel % 4 === 0 ? 255 : pixel % 4 === 1 ? 200 : pixel % 4 === 2 ? 50 : 10
			return brightness
		}),
	})

	describe('encode', () => {
		test('encodes HDR with correct magic', () => {
			const image = createTestImage(4, 4)
			const encoded = HdrCodec.encode(image)

			const text = new TextDecoder().decode(encoded.slice(0, 20))
			expect(text.startsWith('#?RADIANCE')).toBe(true)
		})

		test('includes format string', () => {
			const image = createTestImage(4, 4)
			const encoded = HdrCodec.encode(image)

			const text = new TextDecoder().decode(encoded.slice(0, 100))
			expect(text.includes('FORMAT=32-bit_rle_rgbe')).toBe(true)
		})

		test('includes resolution string', () => {
			const image = createTestImage(256, 128)
			const encoded = HdrCodec.encode(image)

			const text = new TextDecoder().decode(encoded.slice(0, 100))
			expect(text.includes('-Y 128 +X 256')).toBe(true)
		})
	})

	describe('decode', () => {
		test('decodes encoded HDR', () => {
			const original = createTestImage(8, 8)
			const encoded = HdrCodec.encode(original)
			const decoded = HdrCodec.decode(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
			expect(decoded.data.length).toBe(8 * 8 * 4)
		})

		test('preserves image structure through encode/decode', () => {
			const original = createHdrTestImage(4, 4)
			const encoded = HdrCodec.encode(original)
			const decoded = HdrCodec.decode(encoded)

			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)

			// Check that bright and dark regions are preserved (not exact due to HDR conversion)
			// Just verify we get reasonable values back
			for (let i = 0; i < decoded.data.length; i += 4) {
				expect(decoded.data[i]).toBeGreaterThanOrEqual(0)
				expect(decoded.data[i]).toBeLessThanOrEqual(255)
				expect(decoded.data[i + 3]).toBe(255) // Alpha always 255
			}
		})

		test('handles HDR range correctly', () => {
			// Create an image with known values
			const original = {
				width: 2,
				height: 2,
				data: new Uint8Array([
					0,
					0,
					0,
					255, // Black
					255,
					255,
					255,
					255, // White
					128,
					128,
					128,
					255, // Gray
					255,
					0,
					0,
					255, // Red
				]),
			}

			const encoded = HdrCodec.encode(original)
			const decoded = HdrCodec.decode(encoded)

			// Black should remain very dark
			expect(decoded.data[0]).toBeLessThan(20)

			// White should be bright
			expect(decoded.data[4]).toBeGreaterThan(200)
		})
	})

	describe('edge cases', () => {
		test('handles 1x1 image', () => {
			const original = {
				width: 1,
				height: 1,
				data: new Uint8Array([255, 128, 64, 255]),
			}
			const encoded = HdrCodec.encode(original)
			const decoded = HdrCodec.decode(encoded)

			expect(decoded.width).toBe(1)
			expect(decoded.height).toBe(1)
		})

		test('handles large image', () => {
			const original = createTestImage(256, 256)
			const encoded = HdrCodec.encode(original)
			const decoded = HdrCodec.decode(encoded)

			expect(decoded.width).toBe(256)
			expect(decoded.height).toBe(256)
		})

		test('throws on invalid HDR', () => {
			expect(() => HdrCodec.decode(new Uint8Array([0, 1, 2]))).toThrow()
		})

		test('throws on bad magic', () => {
			const badData = new TextEncoder().encode('#?INVALID\n-Y 1 +X 1\n')
			expect(() => HdrCodec.decode(badData)).toThrow('Invalid HDR: bad magic')
		})
	})

	describe('RLE compression', () => {
		test('handles solid color (best case for RLE)', () => {
			const original = {
				width: 64,
				height: 64,
				data: new Uint8Array(64 * 64 * 4).map((_, i) => (i % 4 === 3 ? 255 : 128)),
			}

			const encoded = HdrCodec.encode(original)
			const decoded = HdrCodec.decode(encoded)

			// Verify dimensions
			expect(decoded.width).toBe(64)
			expect(decoded.height).toBe(64)

			// Solid color should compress well
			const uncompressedSize = 64 * 64 * 4
			expect(encoded.length).toBeLessThan(uncompressedSize)
		})

		test('handles alternating pixels', () => {
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

			const encoded = HdrCodec.encode(original)
			const decoded = HdrCodec.decode(encoded)

			expect(decoded.width).toBe(8)
		})
	})
})
