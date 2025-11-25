import { describe, expect, test } from 'bun:test'
import { decodeFlif } from './decoder'
import { encodeFlif } from './encoder'

describe('FLIF Codec', () => {
	test('encode and decode roundtrip', () => {
		// Create a simple 2x2 test image
		const original = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				// Row 0
				255, 0, 0, 255, // Red
				0, 255, 0, 255, // Green
				// Row 1
				0, 0, 255, 255, // Blue
				255, 255, 255, 255, // White
			]),
		}

		// Encode to FLIF
		const encoded = encodeFlif(original)

		// Check FLIF signature
		expect(encoded[0]).toBe(0x46) // 'F'
		expect(encoded[1]).toBe(0x4c) // 'L'
		expect(encoded[2]).toBe(0x49) // 'I'
		expect(encoded[3]).toBe(0x46) // 'F'

		// Decode back
		const decoded = decodeFlif(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Verify pixel data
		expect(decoded.data).toEqual(original.data)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
		expect(() => decodeFlif(invalid)).toThrow('Invalid FLIF signature')
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

			const encoded = encodeFlif(image)
			const decoded = decodeFlif(encoded)

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

		const encoded = encodeFlif(image)
		const decoded = decodeFlif(encoded)

		expect(decoded.data[0]).toBe(100) // R
		expect(decoded.data[1]).toBe(150) // G
		expect(decoded.data[2]).toBe(200) // B
		expect(decoded.data[3]).toBe(128) // A
	})

	test('handles opaque images without alpha', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				255, 0, 0, 255, // Red, fully opaque
				0, 255, 0, 255, // Green, fully opaque
				0, 0, 255, 255, // Blue, fully opaque
				255, 255, 0, 255, // Yellow, fully opaque
			]),
		}

		const encoded = encodeFlif(image)
		const decoded = decodeFlif(encoded)

		expect(decoded.width).toBe(2)
		expect(decoded.height).toBe(2)
		expect(decoded.data.length).toBe(16)

		// All pixels should have full alpha
		for (let i = 3; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(255)
		}
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
		const encoded = encodeFlif(image)
		const decoded = decodeFlif(encoded)

		expect(decoded.width).toBe(width)
		expect(decoded.height).toBe(height)
		expect(decoded.data).toEqual(data)
	})

	test('encodes with interlaced mode by default', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		const encoded = encodeFlif(image)

		// Check format byte (5th byte)
		const formatByte = encoded[4]!

		// Bit 4 should be set for interlaced
		expect((formatByte & 0x10) !== 0).toBe(true)
	})

	test('encodes without interlaced when specified', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		const encoded = encodeFlif(image, { interlaced: false })

		// Check format byte (5th byte)
		const formatByte = encoded[4]!

		// Bit 4 should not be set for non-interlaced
		expect((formatByte & 0x10) === 0).toBe(true)
	})

	test('handles checkerboard pattern', () => {
		const width = 4
		const height = 4
		const data = new Uint8Array(width * height * 4)

		// Create checkerboard
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = (y * width + x) * 4
				const isBlack = (x + y) % 2 === 0
				const color = isBlack ? 0 : 255
				data[idx] = color
				data[idx + 1] = color
				data[idx + 2] = color
				data[idx + 3] = 255
			}
		}

		const image = { width, height, data }
		const encoded = encodeFlif(image)
		const decoded = decodeFlif(encoded)

		expect(decoded.width).toBe(width)
		expect(decoded.height).toBe(height)
		expect(decoded.data).toEqual(data)
	})
})
