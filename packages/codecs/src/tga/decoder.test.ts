import { describe, expect, test } from 'bun:test'
import { TgaCodec } from './codec'
import { TgaImageType } from './types'

describe('TGA Codec', () => {
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

	// Helper to create image with alpha
	const createAlphaImage = (width: number, height: number) => ({
		width,
		height,
		data: new Uint8Array(width * height * 4).map((_, i) => {
			const pixel = Math.floor(i / 4)
			const channel = i % 4
			if (channel === 3) return pixel % 2 === 0 ? 128 : 255 // Varying alpha
			return (pixel * 17 + channel * 50) % 256
		}),
	})

	describe('encode', () => {
		test('encodes 24-bit true color TGA', () => {
			const image = createTestImage(4, 4)
			const encoded = TgaCodec.encode(image)

			// Check header
			expect(encoded[0]).toBe(0) // ID length
			expect(encoded[1]).toBe(0) // Color map type
			expect(encoded[2]).toBe(TgaImageType.TrueColorRLE) // Image type (RLE by default)
			expect(encoded[12]).toBe(4) // Width low byte
			expect(encoded[13]).toBe(0) // Width high byte
			expect(encoded[14]).toBe(4) // Height low byte
			expect(encoded[15]).toBe(0) // Height high byte
			expect(encoded[16]).toBe(24) // Pixel depth (no alpha detected)
		})

		test('encodes 32-bit true color TGA with alpha', () => {
			const image = createAlphaImage(4, 4)
			const encoded = TgaCodec.encode(image)

			expect(encoded[16]).toBe(32) // Pixel depth with alpha
			expect(encoded[17] & 0x0f).toBe(8) // 8 alpha bits
		})

		test('encodes uncompressed TGA when quality=100', () => {
			const image = createTestImage(4, 4)
			const encoded = TgaCodec.encode(image, { quality: 100 })

			expect(encoded[2]).toBe(TgaImageType.TrueColor) // Uncompressed
		})

		test('encodes RLE compressed TGA by default', () => {
			const image = createTestImage(4, 4)
			const encoded = TgaCodec.encode(image)

			expect(encoded[2]).toBe(TgaImageType.TrueColorRLE) // RLE compressed
		})
	})

	describe('decode', () => {
		test('decodes uncompressed TGA', () => {
			const original = createTestImage(8, 8)
			const encoded = TgaCodec.encode(original, { quality: 100 }) // Uncompressed
			const decoded = TgaCodec.decode(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
			expect(decoded.data.length).toBe(8 * 8 * 4)
		})

		test('decodes RLE compressed TGA', () => {
			const original = createTestImage(8, 8)
			const encoded = TgaCodec.encode(original) // RLE compressed
			const decoded = TgaCodec.decode(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
		})

		test('preserves pixel data through encode/decode cycle', () => {
			const original = createTestImage(4, 4)
			const encoded = TgaCodec.encode(original, { quality: 100 }) // Uncompressed for exact match
			const decoded = TgaCodec.decode(encoded)

			// Compare RGB values (alpha may differ for 24-bit)
			for (let i = 0; i < original.data.length; i += 4) {
				expect(decoded.data[i]).toBe(original.data[i]) // R
				expect(decoded.data[i + 1]).toBe(original.data[i + 1]) // G
				expect(decoded.data[i + 2]).toBe(original.data[i + 2]) // B
			}
		})

		test('preserves alpha through encode/decode cycle', () => {
			const original = createAlphaImage(4, 4)
			const encoded = TgaCodec.encode(original)
			const decoded = TgaCodec.decode(encoded)

			// Compare all channels including alpha
			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
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
			const encoded = TgaCodec.encode(original)
			const decoded = TgaCodec.decode(encoded)

			expect(decoded.width).toBe(1)
			expect(decoded.height).toBe(1)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(128) // G
			expect(decoded.data[2]).toBe(64) // B
		})

		test('handles large image', () => {
			const original = createTestImage(256, 256)
			const encoded = TgaCodec.encode(original)
			const decoded = TgaCodec.decode(encoded)

			expect(decoded.width).toBe(256)
			expect(decoded.height).toBe(256)
		})

		test('throws on invalid TGA', () => {
			expect(() => TgaCodec.decode(new Uint8Array([0, 1, 2]))).toThrow()
		})

		test('throws on zero dimensions', () => {
			// Create TGA header with zero width
			const invalidTga = new Uint8Array(18)
			invalidTga[2] = TgaImageType.TrueColor
			// Width and height are at bytes 12-15, leaving them as 0

			expect(() => TgaCodec.decode(invalidTga)).toThrow('Invalid TGA dimensions')
		})
	})
})
