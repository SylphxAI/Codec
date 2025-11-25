import { describe, expect, test } from 'bun:test'
import { decodeArw, parseArw } from './decoder'
import { encodeArw } from './encoder'

describe('ARW Codec', () => {
	test('encode creates valid ARW/TIFF', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeArw(image)

		// Check little-endian signature
		expect(encoded[0]).toBe(0x49) // I
		expect(encoded[1]).toBe(0x49) // I

		// Check magic number
		expect(encoded[2]).toBe(42)
		expect(encoded[3]).toBe(0)
	})

	test('encode and decode roundtrip (uncompressed)', () => {
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

		// Encode without compression
		const encoded = encodeArw(original, { quality: 100 })
		const decoded = decodeArw(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match (ignore alpha as we may drop it)
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('encode and decode roundtrip (PackBits)', () => {
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		// Use default compression
		const encoded = encodeArw(original)
		const decoded = decodeArw(encoded)

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
		expect(() => decodeArw(invalid)).toThrow('Invalid ARW byte order')
	})

	test('parseArw extracts structure and metadata', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeArw(image)
		const arw = parseArw(encoded)

		expect(arw.littleEndian).toBe(true)
		expect(arw.isBigTiff).toBe(false)
		expect(arw.ifds.length).toBeGreaterThanOrEqual(1)

		// Check Sony metadata
		expect(arw.make).toBe('Sony')
		expect(arw.model).toBe('ILCE-7M3')
		expect(arw.software).toBe('mconv')
		expect(arw.datetime).toBeDefined()
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeArw(image)
		const decoded = decodeArw(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})

	test('handles large image', () => {
		const width = 64
		const height = 64
		const image = {
			width,
			height,
			data: new Uint8Array(width * height * 4),
		}

		// Create gradient pattern
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = (y * width + x) * 4
				image.data[idx] = Math.floor((x / width) * 255) // R
				image.data[idx + 1] = Math.floor((y / height) * 255) // G
				image.data[idx + 2] = 128 // B
				image.data[idx + 3] = 255 // A
			}
		}

		const encoded = encodeArw(image)
		const decoded = decodeArw(encoded)

		expect(decoded.width).toBe(width)
		expect(decoded.height).toBe(height)

		// Spot check some pixels (allow small tolerance for compression artifacts)
		expect(decoded.data[0]).toBeLessThan(10) // Top-left R (near 0)
		expect(decoded.data[(width - 1) * 4]).toBeGreaterThan(230) // Top-right R (near 255)
		expect(decoded.data[((height - 1) * width) * 4 + 1]).toBeGreaterThan(230) // Bottom-left G (near 255)
	})

	test('preserves alpha channel', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				// Row 1
				255,
				0,
				0,
				255, // Red, opaque
				0,
				255,
				0,
				128, // Green, semi-transparent
				// Row 2
				0,
				0,
				255,
				64, // Blue, more transparent
				255,
				255,
				0,
				0, // Yellow, fully transparent
			]),
		}

		const encoded = encodeArw(image)
		const decoded = decodeArw(encoded)

		expect(decoded.width).toBe(2)
		expect(decoded.height).toBe(2)

		// Check first pixel (red, opaque)
		expect(decoded.data[0]).toBe(255)
		expect(decoded.data[1]).toBe(0)
		expect(decoded.data[2]).toBe(0)
		expect(decoded.data[3]).toBe(255)

		// Check second pixel (green, semi-transparent)
		expect(decoded.data[4]).toBe(0)
		expect(decoded.data[5]).toBe(255)
		expect(decoded.data[6]).toBe(0)
		expect(decoded.data[7]).toBe(128)
	})

	test('handles grayscale-like images', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with grayscale values
		for (let i = 0; i < image.data.length; i += 4) {
			const gray = (i / 4) * 16
			image.data[i] = gray // R
			image.data[i + 1] = gray // G
			image.data[i + 2] = gray // B
			image.data[i + 3] = 255 // A
		}

		const encoded = encodeArw(image)
		const decoded = decodeArw(encoded)

		expect(decoded.width).toBe(4)
		expect(decoded.height).toBe(4)

		// Check that grayscale values are preserved
		for (let i = 0; i < 16; i++) {
			const idx = i * 4
			expect(decoded.data[idx]).toBe(decoded.data[idx + 1])
			expect(decoded.data[idx + 1]).toBe(decoded.data[idx + 2])
		}
	})
})
