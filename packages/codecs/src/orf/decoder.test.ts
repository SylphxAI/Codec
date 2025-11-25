import { describe, expect, test } from 'bun:test'
import { decodeOrf, parseOrf } from './decoder'
import { encodeOrf } from './encoder'

describe('ORF Codec', () => {
	test('encode creates valid ORF/TIFF structure', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeOrf(image)

		// Check little-endian signature
		expect(encoded[0]).toBe(0x49) // I
		expect(encoded[1]).toBe(0x49) // I

		// Check magic number (TIFF magic for compatibility)
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

		const encoded = encodeOrf(original)
		const decoded = decodeOrf(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('encode and decode with alpha channel', () => {
		const original = {
			width: 3,
			height: 3,
			data: new Uint8Array(3 * 3 * 4),
		}

		// Fill with semi-transparent colors
		for (let i = 0; i < 3 * 3; i++) {
			original.data[i * 4] = 255 // R
			original.data[i * 4 + 1] = 128 // G
			original.data[i * 4 + 2] = 64 // B
			original.data[i * 4 + 3] = 128 // A (semi-transparent)
		}

		const encoded = encodeOrf(original)
		const decoded = decodeOrf(encoded)

		expect(decoded.width).toBe(3)
		expect(decoded.height).toBe(3)

		// Check RGBA values
		for (let i = 0; i < 9; i++) {
			expect(decoded.data[i * 4]).toBe(255) // R
			expect(decoded.data[i * 4 + 1]).toBe(128) // G
			expect(decoded.data[i * 4 + 2]).toBe(64) // B
			expect(decoded.data[i * 4 + 3]).toBe(128) // A
		}
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeOrf(invalid)).toThrow('Invalid ORF byte order')
	})

	test('parseOrf extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeOrf(image)
		const orf = parseOrf(encoded)

		expect(orf.littleEndian).toBe(true)
		expect(orf.isBigTiff).toBe(false)
		expect(orf.ifds.length).toBeGreaterThanOrEqual(1)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeOrf(image)
		const decoded = decodeOrf(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})

	test('handles larger image', () => {
		const width = 32
		const height = 24
		const image = {
			width,
			height,
			data: new Uint8Array(width * height * 4),
		}

		// Create gradient pattern
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = (y * width + x) * 4
				image.data[idx] = Math.floor((x / width) * 255) // R gradient
				image.data[idx + 1] = Math.floor((y / height) * 255) // G gradient
				image.data[idx + 2] = 128 // B constant
				image.data[idx + 3] = 255 // A opaque
			}
		}

		const encoded = encodeOrf(image)
		const decoded = decodeOrf(encoded)

		expect(decoded.width).toBe(width)
		expect(decoded.height).toBe(height)

		// Spot check some pixels
		expect(decoded.data[0]).toBe(0) // Top-left R
		expect(decoded.data[1]).toBe(0) // Top-left G
		expect(decoded.data[(width - 1) * 4]).toBeGreaterThan(200) // Top-right R
		expect(decoded.data[((height - 1) * width) * 4 + 1]).toBeGreaterThan(200) // Bottom-left G
	})

	test('preserves Make and Model tags', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(150),
		}

		const encoded = encodeOrf(image)
		const orf = parseOrf(encoded)

		// Check that tags are present
		const ifd = orf.ifds[0]!
		expect(ifd.entries.size).toBeGreaterThan(0)

		// Make tag should be OLYMPUS
		const makeEntry = ifd.entries.get(271) // Make tag
		expect(makeEntry).toBeDefined()
		expect(makeEntry?.value).toBe('OLYMPUS')
	})

	test('decode handles empty strips gracefully', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array(2 * 2 * 4).fill(0), // All black
		}

		const encoded = encodeOrf(image)
		const decoded = decodeOrf(encoded)

		expect(decoded.width).toBe(2)
		expect(decoded.height).toBe(2)
		// All pixels should be black
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(0) // R
			expect(decoded.data[i + 1]).toBe(0) // G
			expect(decoded.data[i + 2]).toBe(0) // B
		}
	})
})
