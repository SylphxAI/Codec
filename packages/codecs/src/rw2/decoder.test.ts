import { describe, expect, test } from 'bun:test'
import { decodeRW2, parseRW2 } from './decoder'
import { encodeRW2 } from './encoder'
import { RW2_MAGIC, RW2_SIGNATURE } from './types'

describe('RW2 Codec', () => {
	test('encode creates valid RW2', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeRW2(image)

		// Check little-endian signature
		expect(encoded[0]).toBe(0x49) // I
		expect(encoded[1]).toBe(0x49) // I

		// Check Panasonic magic number (0x0055)
		expect(encoded[2]).toBe(0x55)
		expect(encoded[3]).toBe(0x00)
	})

	test('encode and decode roundtrip', () => {
		// Create a simple test image
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with distinct colors
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				original.data[idx] = x * 64 // R
				original.data[idx + 1] = y * 64 // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		const encoded = encodeRW2(original)
		const decoded = decodeRW2(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('handles solid color image', () => {
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		const encoded = encodeRW2(original)
		const decoded = decodeRW2(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check values
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(200) // R
			expect(decoded.data[i + 1]).toBe(200) // G
			expect(decoded.data[i + 2]).toBe(200) // B
		}
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeRW2(invalid)).toThrow('Invalid RW2 byte order')
	})

	test('decode throws on invalid magic number', () => {
		const invalid = new Uint8Array([0x49, 0x49, 0x2a, 0x00]) // Standard TIFF
		expect(() => decodeRW2(invalid)).toThrow('Invalid RW2 magic number')
	})

	test('parseRW2 extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeRW2(image)
		const rw2 = parseRW2(encoded)

		expect(rw2.littleEndian).toBe(true)
		expect(rw2.isBigTiff).toBe(false)
		expect(rw2.ifds.length).toBe(1)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeRW2(image)
		const decoded = decodeRW2(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})

	test('preserves image dimensions', () => {
		const sizes = [
			{ width: 1, height: 1 },
			{ width: 16, height: 16 },
			{ width: 32, height: 24 },
			{ width: 100, height: 50 },
		]

		for (const { width, height } of sizes) {
			const image = {
				width,
				height,
				data: new Uint8Array(width * height * 4).fill(150),
			}

			const encoded = encodeRW2(image)
			const decoded = decodeRW2(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
		}
	})

	test('handles images with transparency', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Create pattern with varying alpha
		for (let i = 0; i < image.data.length; i += 4) {
			image.data[i] = 255 // R
			image.data[i + 1] = 128 // G
			image.data[i + 2] = 64 // B
			image.data[i + 3] = (i / 4) * 16 // Varying alpha
		}

		const encoded = encodeRW2(image)
		const decoded = decodeRW2(encoded)

		expect(decoded.width).toBe(image.width)
		expect(decoded.height).toBe(image.height)

		// Check RGB preservation (alpha handling may vary)
		for (let i = 0; i < image.data.length; i += 4) {
			expect(decoded.data[i]).toBe(255) // R
			expect(decoded.data[i + 1]).toBe(128) // G
			expect(decoded.data[i + 2]).toBe(64) // B
		}
	})

	test('magic number constants are correct', () => {
		expect(RW2_SIGNATURE).toBe(0x4949) // 'II'
		expect(RW2_MAGIC).toBe(0x0055) // 85 decimal
	})

	test('handles grayscale-like RGB images', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Create grayscale pattern
		for (let i = 0; i < image.data.length; i += 4) {
			const gray = (i / 4) % 256
			image.data[i] = gray
			image.data[i + 1] = gray
			image.data[i + 2] = gray
			image.data[i + 3] = 255
		}

		const encoded = encodeRW2(image)
		const decoded = decodeRW2(encoded)

		expect(decoded.width).toBe(image.width)
		expect(decoded.height).toBe(image.height)

		// Verify grayscale preservation
		for (let i = 0; i < image.data.length; i += 4) {
			expect(decoded.data[i]).toBe(decoded.data[i + 1])
			expect(decoded.data[i + 1]).toBe(decoded.data[i + 2])
		}
	})
})
