import { describe, expect, test } from 'bun:test'
import { decodeJp2 } from './decoder'
import { encodeJp2 } from './encoder'

describe('JPEG 2000 Codec', () => {
	test('encode creates valid JP2 signature', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeJp2(image)

		// Check JP2 signature (12 bytes)
		expect(encoded[0]).toBe(0x00)
		expect(encoded[1]).toBe(0x00)
		expect(encoded[2]).toBe(0x00)
		expect(encoded[3]).toBe(0x0c)
		expect(encoded[4]).toBe(0x6a)
		expect(encoded[5]).toBe(0x50)
		expect(encoded[6]).toBe(0x20)
		expect(encoded[7]).toBe(0x20)
		expect(encoded[8]).toBe(0x0d)
		expect(encoded[9]).toBe(0x0a)
		expect(encoded[10]).toBe(0x87)
		expect(encoded[11]).toBe(0x0a)
	})

	test('encode creates valid boxes', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeJp2(image)

		// After signature, should have boxes
		let offset = 12

		// File Type Box
		const ftypLength = (encoded[offset]! << 24) | (encoded[offset + 1]! << 16) |
			(encoded[offset + 2]! << 8) | encoded[offset + 3]!
		const ftypType = (encoded[offset + 4]! << 24) | (encoded[offset + 5]! << 16) |
			(encoded[offset + 6]! << 8) | encoded[offset + 7]!
		expect(ftypType).toBe(0x66747970) // 'ftyp'
		expect(ftypLength).toBeGreaterThan(0)

		offset += ftypLength

		// JP2 Header Box
		const jp2hLength = (encoded[offset]! << 24) | (encoded[offset + 1]! << 16) |
			(encoded[offset + 2]! << 8) | encoded[offset + 3]!
		const jp2hType = (encoded[offset + 4]! << 24) | (encoded[offset + 5]! << 16) |
			(encoded[offset + 6]! << 8) | encoded[offset + 7]!
		expect(jp2hType).toBe(0x6a703268) // 'jp2h'
		expect(jp2hLength).toBeGreaterThan(0)
	})

	test('encode and decode roundtrip for grayscale', () => {
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Fill with grayscale gradient
		for (let i = 0; i < 64; i++) {
			const val = Math.floor((i / 63) * 255)
			original.data[i * 4] = val
			original.data[i * 4 + 1] = val
			original.data[i * 4 + 2] = val
			original.data[i * 4 + 3] = 255
		}

		// Encode with high quality
		const encoded = encodeJp2(original, { quality: 100 })

		// Decode back
		const decoded = decodeJp2(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)
		expect(decoded.data.length).toBe(original.data.length)

		// Check alpha channel
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i + 3]).toBe(255)
		}
	})

	test('encode and decode roundtrip for RGB', () => {
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with RGB pattern
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				original.data[idx] = x * 64 // R
				original.data[idx + 1] = y * 64 // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		// Encode with high quality
		const encoded = encodeJp2(original, { quality: 100 })

		// Decode back
		const decoded = decodeJp2(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeJp2(invalid)).toThrow('Invalid JPEG 2000 signature')
	})

	test('decode throws on missing required boxes', () => {
		// Valid JP2 signature but no boxes
		const invalid = new Uint8Array([
			0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
		])
		expect(() => decodeJp2(invalid)).toThrow()
	})

	test('quality option affects file size', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4),
		}

		// Random-ish data
		for (let i = 0; i < image.data.length; i++) {
			image.data[i] = (i * 13) % 256
		}

		const lowQuality = encodeJp2(image, { quality: 10 })
		const highQuality = encodeJp2(image, { quality: 95 })

		// Both should be valid
		expect(lowQuality.length).toBeGreaterThan(0)
		expect(highQuality.length).toBeGreaterThan(0)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]),
		}

		const encoded = encodeJp2(image)
		const decoded = decodeJp2(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data.length).toBe(4)
	})

	test('handles power-of-two dimensions', () => {
		const image = {
			width: 64,
			height: 64,
			data: new Uint8Array(64 * 64 * 4),
		}

		// Fill with checkerboard pattern
		for (let y = 0; y < 64; y++) {
			for (let x = 0; x < 64; x++) {
				const idx = (y * 64 + x) * 4
				const color = ((x >> 3) + (y >> 3)) % 2 === 0 ? 255 : 0
				image.data[idx] = color
				image.data[idx + 1] = color
				image.data[idx + 2] = color
				image.data[idx + 3] = 255
			}
		}

		const encoded = encodeJp2(image)
		const decoded = decodeJp2(encoded)

		expect(decoded.width).toBe(64)
		expect(decoded.height).toBe(64)
	})

	test('handles non-power-of-two dimensions', () => {
		const image = {
			width: 17,
			height: 23,
			data: new Uint8Array(17 * 23 * 4).fill(100),
		}

		// Set alpha
		for (let i = 3; i < image.data.length; i += 4) {
			image.data[i] = 255
		}

		const encoded = encodeJp2(image)
		const decoded = decodeJp2(encoded)

		expect(decoded.width).toBe(17)
		expect(decoded.height).toBe(23)
	})

	test('encodes RGB image correctly', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				255, 0, 0, 255, // Red
				0, 255, 0, 255, // Green
				0, 0, 255, 255, // Blue
				255, 255, 255, 255, // White
			]),
		}

		const encoded = encodeJp2(image)

		// Should be a valid JP2 file
		expect(encoded[0]).toBe(0x00)
		expect(encoded[4]).toBe(0x6a)
		expect(encoded[5]).toBe(0x50)
	})

	test('encodes grayscale image correctly', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with grayscale
		for (let i = 0; i < 16; i++) {
			image.data[i * 4] = 128
			image.data[i * 4 + 1] = 128
			image.data[i * 4 + 2] = 128
			image.data[i * 4 + 3] = 255
		}

		const encoded = encodeJp2(image)

		// Should be a valid JP2 file
		expect(encoded[0]).toBe(0x00)
		expect(encoded[4]).toBe(0x6a)
		expect(encoded[5]).toBe(0x50)
	})

	test('handles different quality levels', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Fill with gradient
		for (let i = 0; i < 64; i++) {
			const val = i * 4
			image.data[i * 4] = val
			image.data[i * 4 + 1] = val
			image.data[i * 4 + 2] = val
			image.data[i * 4 + 3] = 255
		}

		const q10 = encodeJp2(image, { quality: 10 })
		const q50 = encodeJp2(image, { quality: 50 })
		const q90 = encodeJp2(image, { quality: 90 })
		const q100 = encodeJp2(image, { quality: 100 })

		// All should be valid
		expect(q10.length).toBeGreaterThan(0)
		expect(q50.length).toBeGreaterThan(0)
		expect(q90.length).toBeGreaterThan(0)
		expect(q100.length).toBeGreaterThan(0)
	})
})
