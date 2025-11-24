import { describe, expect, test } from 'bun:test'
import { decodeBmp } from './decoder'
import { encodeBmp } from './encoder'

describe('BMP Decoder', () => {
	test('decode and encode roundtrip', () => {
		// Create a simple 2x2 test image
		const original = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				// Row 0
				255,
				0,
				0,
				255, // Red
				0,
				255,
				0,
				255, // Green
				// Row 1
				0,
				0,
				255,
				255, // Blue
				255,
				255,
				255,
				255, // White
			]),
		}

		// Encode to BMP
		const encoded = encodeBmp(original)

		// Check BMP signature
		expect(encoded[0]).toBe(0x42) // 'B'
		expect(encoded[1]).toBe(0x4d) // 'M'

		// Decode back
		const decoded = decodeBmp(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Verify pixel data
		expect(decoded.data).toEqual(original.data)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeBmp(invalid)).toThrow('Invalid BMP signature')
	})

	test('encode creates valid BMP header', () => {
		const image = {
			width: 10,
			height: 10,
			data: new Uint8Array(10 * 10 * 4),
		}

		const encoded = encodeBmp(image)

		// File signature
		expect(encoded[0]).toBe(0x42)
		expect(encoded[1]).toBe(0x4d)

		// DIB header size at offset 14 (should be 108 for BITMAPV4HEADER)
		const dibSize = encoded[14]! | (encoded[15]! << 8) | (encoded[16]! << 16) | (encoded[17]! << 24)
		expect(dibSize).toBe(108)

		// Width at offset 18
		const width = encoded[18]! | (encoded[19]! << 8) | (encoded[20]! << 16) | (encoded[21]! << 24)
		expect(width).toBe(10)

		// Height at offset 22
		const height = encoded[22]! | (encoded[23]! << 8) | (encoded[24]! << 16) | (encoded[25]! << 24)
		expect(height).toBe(10)
	})

	test('handles various image sizes', () => {
		const sizes = [
			[1, 1],
			[3, 3],
			[7, 5],
			[100, 100],
		]

		for (const [w, h] of sizes) {
			const image = {
				width: w!,
				height: h!,
				data: new Uint8Array(w! * h! * 4).fill(128),
			}

			const encoded = encodeBmp(image)
			const decoded = decodeBmp(encoded)

			expect(decoded.width).toBe(w)
			expect(decoded.height).toBe(h)
			expect(decoded.data.length).toBe(w! * h! * 4)
		}
	})

	test('preserves alpha channel', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([100, 150, 200, 128]), // Semi-transparent pixel
		}

		const encoded = encodeBmp(image)
		const decoded = decodeBmp(encoded)

		expect(decoded.data[0]).toBe(100) // R
		expect(decoded.data[1]).toBe(150) // G
		expect(decoded.data[2]).toBe(200) // B
		expect(decoded.data[3]).toBe(128) // A
	})
})
