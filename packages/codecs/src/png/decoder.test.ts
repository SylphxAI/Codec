import { describe, expect, test } from 'bun:test'
import { decodePng } from './decoder'
import { encodePng } from './encoder'

describe('PNG Codec', () => {
	test('encode and decode roundtrip', () => {
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

		// Encode to PNG
		const encoded = encodePng(original)

		// Check PNG signature
		expect(encoded[0]).toBe(137)
		expect(encoded[1]).toBe(80) // 'P'
		expect(encoded[2]).toBe(78) // 'N'
		expect(encoded[3]).toBe(71) // 'G'

		// Decode back
		const decoded = decodePng(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Verify pixel data
		expect(decoded.data).toEqual(original.data)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
		expect(() => decodePng(invalid)).toThrow('Invalid PNG signature')
	})

	test('handles various image sizes', () => {
		const sizes = [
			[1, 1],
			[3, 3],
			[7, 5],
			[16, 16],
		]

		for (const [w, h] of sizes) {
			const image = {
				width: w!,
				height: h!,
				data: new Uint8Array(w! * h! * 4).fill(128),
			}

			const encoded = encodePng(image)
			const decoded = decodePng(encoded)

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

		const encoded = encodePng(image)
		const decoded = decodePng(encoded)

		expect(decoded.data[0]).toBe(100) // R
		expect(decoded.data[1]).toBe(150) // G
		expect(decoded.data[2]).toBe(200) // B
		expect(decoded.data[3]).toBe(128) // A
	})

	test('gradient image roundtrip', () => {
		const width = 8
		const height = 8
		const data = new Uint8Array(width * height * 4)

		// Create gradient
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = (y * width + x) * 4
				data[idx] = Math.floor((x / (width - 1)) * 255) // R
				data[idx + 1] = Math.floor((y / (height - 1)) * 255) // G
				data[idx + 2] = 128 // B
				data[idx + 3] = 255 // A
			}
		}

		const image = { width, height, data }
		const encoded = encodePng(image)
		const decoded = decodePng(encoded)

		expect(decoded.width).toBe(width)
		expect(decoded.height).toBe(height)
		expect(decoded.data).toEqual(data)
	})
})
