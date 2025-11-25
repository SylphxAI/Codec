import { describe, expect, test } from 'bun:test'
import { decodePef, parsePef } from './decoder'
import { encodePef } from './encoder'

describe('PEF Codec', () => {
	test('encode creates valid PEF', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodePef(image)

		// Check little-endian signature
		expect(encoded[0]).toBe(0x49) // I
		expect(encoded[1]).toBe(0x49) // I

		// Check magic number (TIFF/PEF uses 42)
		expect(encoded[2]).toBe(42)
		expect(encoded[3]).toBe(0)
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

		const encoded = encodePef(original)
		const decoded = decodePef(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match (ignore alpha as we may drop it)
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('handles grayscale image', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Create gradient
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				const gray = (y * 8 + x) * 4
				const idx = (y * 8 + x) * 4
				image.data[idx] = gray
				image.data[idx + 1] = gray
				image.data[idx + 2] = gray
				image.data[idx + 3] = 255
			}
		}

		const encoded = encodePef(image)
		const decoded = decodePef(encoded)

		expect(decoded.width).toBe(8)
		expect(decoded.height).toBe(8)

		// Verify gradient is preserved
		for (let i = 0; i < 8 * 8; i++) {
			const expected = i * 4
			expect(decoded.data[i * 4]).toBe(expected) // R
			expect(decoded.data[i * 4 + 1]).toBe(expected) // G
			expect(decoded.data[i * 4 + 2]).toBe(expected) // B
		}
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodePef(invalid)).toThrow('Invalid PEF byte order')
	})

	test('decode throws on invalid magic number', () => {
		const invalid = new Uint8Array([0x49, 0x49, 0x00, 0x00]) // Valid signature, invalid magic
		expect(() => decodePef(invalid)).toThrow('Invalid PEF magic number')
	})

	test('parsePef extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodePef(image)
		const pef = parsePef(encoded)

		expect(pef.littleEndian).toBe(true)
		expect(pef.ifds.length).toBeGreaterThanOrEqual(1)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodePef(image)
		const decoded = decodePef(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})

	test('handles images with alpha channel', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				255, 0, 0, 255, // Red, full alpha
				0, 255, 0, 128, // Green, half alpha
				0, 0, 255, 64, // Blue, quarter alpha
				255, 255, 0, 0, // Yellow, no alpha
			]),
		}

		const encoded = encodePef(image)
		const decoded = decodePef(encoded)

		expect(decoded.width).toBe(2)
		expect(decoded.height).toBe(2)

		// Check RGB values (alpha may be preserved or not)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[4]).toBe(0) // R
		expect(decoded.data[5]).toBe(255) // G
	})

	test('handles large image dimensions', () => {
		const width = 64
		const height = 48
		const image = {
			width,
			height,
			data: new Uint8Array(width * height * 4),
		}

		// Fill with pattern
		for (let i = 0; i < width * height; i++) {
			image.data[i * 4] = (i % 256) // R
			image.data[i * 4 + 1] = ((i * 2) % 256) // G
			image.data[i * 4 + 2] = ((i * 3) % 256) // B
			image.data[i * 4 + 3] = 255 // A
		}

		const encoded = encodePef(image)
		const decoded = decodePef(encoded)

		expect(decoded.width).toBe(width)
		expect(decoded.height).toBe(height)
		expect(decoded.data.length).toBe(width * height * 4)
	})

	test('throws on empty data', () => {
		const empty = new Uint8Array(0)
		expect(() => decodePef(empty)).toThrow()
	})

	test('parsePef identifies multiple IFDs', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		const encoded = encodePef(image)
		const pef = parsePef(encoded)

		// At minimum, should have one IFD
		expect(pef.ifds.length).toBeGreaterThanOrEqual(1)

		// Check that first IFD has expected tags
		const firstIFD = pef.ifds[0]!
		expect(firstIFD.entries.size).toBeGreaterThan(0)
	})
})
