import { describe, expect, test } from 'bun:test'
import { decodeCR2, parseCR2 } from './decoder'
import { encodeCR2 } from './encoder'

describe('CR2 Codec', () => {
	test('encode creates valid CR2', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeCR2(image)

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
		const encoded = encodeCR2(original, { quality: 100 })
		const decoded = decodeCR2(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('encode and decode roundtrip (with compression)', () => {
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Create a pattern with some repetition (helps RLE)
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				const idx = (y * 8 + x) * 4
				const pattern = (x + y) % 3
				original.data[idx] = pattern * 100 // R
				original.data[idx + 1] = pattern * 80 // G
				original.data[idx + 2] = pattern * 60 // B
				original.data[idx + 3] = 255 // A
			}
		}

		// Use default compression
		const encoded = encodeCR2(original)
		const decoded = decodeCR2(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check values match (with some tolerance for compression artifacts)
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(original.data[i]) // R
			expect(decoded.data[i + 1]).toBe(original.data[i + 1]) // G
			expect(decoded.data[i + 2]).toBe(original.data[i + 2]) // B
		}
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeCR2(invalid)).toThrow('Invalid CR2 signature')
	})

	test('parseCR2 extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeCR2(image)
		const cr2 = parseCR2(encoded)

		expect(cr2.littleEndian).toBe(true)
		expect(cr2.ifds.length).toBe(1)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeCR2(image)
		const decoded = decodeCR2(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})

	test('handles large image', () => {
		const image = {
			width: 64,
			height: 64,
			data: new Uint8Array(64 * 64 * 4),
		}

		// Create gradient
		for (let y = 0; y < 64; y++) {
			for (let x = 0; x < 64; x++) {
				const idx = (y * 64 + x) * 4
				image.data[idx] = (x * 255) / 63 // R gradient
				image.data[idx + 1] = (y * 255) / 63 // G gradient
				image.data[idx + 2] = 128 // B constant
				image.data[idx + 3] = 255 // A
			}
		}

		const encoded = encodeCR2(image)
		const decoded = decodeCR2(encoded)

		expect(decoded.width).toBe(64)
		expect(decoded.height).toBe(64)

		// Verify corners
		expect(decoded.data[0]).toBe(0) // Top-left R
		expect(decoded.data[1]).toBe(0) // Top-left G

		const bottomRight = (64 * 64 - 1) * 4
		expect(decoded.data[bottomRight]).toBe(255) // Bottom-right R
		expect(decoded.data[bottomRight + 1]).toBe(255) // Bottom-right G
	})

	test('handles monochrome image', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// All pixels same gray value
		for (let i = 0; i < 4 * 4; i++) {
			image.data[i * 4] = 127
			image.data[i * 4 + 1] = 127
			image.data[i * 4 + 2] = 127
			image.data[i * 4 + 3] = 255
		}

		const encoded = encodeCR2(image, { quality: 50 }) // Use compression
		const decoded = decodeCR2(encoded)

		expect(decoded.width).toBe(4)
		expect(decoded.height).toBe(4)

		// All pixels should be the same
		for (let i = 0; i < 4 * 4 * 4; i += 4) {
			expect(decoded.data[i]).toBe(127)
			expect(decoded.data[i + 1]).toBe(127)
			expect(decoded.data[i + 2]).toBe(127)
		}
	})

	test('preserves exact pixel values without alpha', () => {
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

		const encoded = encodeCR2(image, { quality: 100 })
		const decoded = decodeCR2(encoded)

		expect(decoded.width).toBe(2)
		expect(decoded.height).toBe(2)

		// Verify each pixel
		expect(decoded.data[0]).toBe(255) // Red R
		expect(decoded.data[1]).toBe(0) // Red G
		expect(decoded.data[2]).toBe(0) // Red B

		expect(decoded.data[4]).toBe(0) // Green R
		expect(decoded.data[5]).toBe(255) // Green G
		expect(decoded.data[6]).toBe(0) // Green B

		expect(decoded.data[8]).toBe(0) // Blue R
		expect(decoded.data[9]).toBe(0) // Blue G
		expect(decoded.data[10]).toBe(255) // Blue B

		expect(decoded.data[12]).toBe(255) // White R
		expect(decoded.data[13]).toBe(255) // White G
		expect(decoded.data[14]).toBe(255) // White B
	})

	test('decode throws on missing image data', () => {
		// Create minimal CR2 header with no image strips
		const minimal = new Uint8Array([
			0x49, 0x49, // Little-endian
			0x2a, 0x00, // Magic 42
			0x08, 0x00, 0x00, 0x00, // IFD offset
			0x00, 0x00, // 0 entries
			0x00, 0x00, 0x00, 0x00, // No next IFD
		])

		expect(() => decodeCR2(minimal)).toThrow('No image data strips found')
	})

	test('handles different quality settings', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(200),
		}

		// Quality 100 (no compression)
		const encoded100 = encodeCR2(image, { quality: 100 })
		const decoded100 = decodeCR2(encoded100)
		expect(decoded100.data.every((v, i) => i % 4 === 3 || v === 200)).toBe(true)

		// Quality 50 (currently same as 100 since we use uncompressed format)
		const encoded50 = encodeCR2(image, { quality: 50 })
		const decoded50 = decodeCR2(encoded50)
		expect(decoded50.data.every((v, i) => i % 4 === 3 || v === 200)).toBe(true)

		// Both should produce valid CR2 files
		expect(encoded100.length).toBeGreaterThan(0)
		expect(encoded50.length).toBeGreaterThan(0)
	})
})
