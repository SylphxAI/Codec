import { describe, expect, test } from 'bun:test'
import { decodeWebP } from './decoder'
import { encodeWebP } from './encoder'

describe('WebP Codec', () => {
	test('encode creates valid WebP', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		const encoded = encodeWebP(image)

		// Check RIFF signature
		expect(encoded[0]).toBe(0x52) // R
		expect(encoded[1]).toBe(0x49) // I
		expect(encoded[2]).toBe(0x46) // F
		expect(encoded[3]).toBe(0x46) // F

		// Check WEBP signature
		expect(encoded[8]).toBe(0x57) // W
		expect(encoded[9]).toBe(0x45) // E
		expect(encoded[10]).toBe(0x42) // B
		expect(encoded[11]).toBe(0x50) // P
	})

	test('encode includes VP8L chunk', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				255,
				0,
				0,
				255, // Red
				0,
				255,
				0,
				255, // Green
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

		const encoded = encodeWebP(image)

		// Find VP8L chunk (0x56503834 = 'VP8L')
		let foundVP8L = false
		for (let i = 12; i < encoded.length - 4; i++) {
			if (
				encoded[i] === 0x56 &&
				encoded[i + 1] === 0x50 &&
				encoded[i + 2] === 0x38 &&
				encoded[i + 3] === 0x4c
			) {
				foundVP8L = true
				break
			}
		}

		expect(foundVP8L).toBe(true)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeWebP(invalid)).toThrow('Invalid WebP signature')
	})

	test('decode throws on non-WEBP RIFF', () => {
		// Valid RIFF but not WEBP
		const notWebP = new Uint8Array([
			0x52,
			0x49,
			0x46,
			0x46, // RIFF
			0x00,
			0x00,
			0x00,
			0x00, // Size
			0x41,
			0x56,
			0x49,
			0x20, // AVI (not WEBP)
		])
		expect(() => decodeWebP(notWebP)).toThrow('not a WEBP file')
	})

	test('handles small image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 0, 0, 255]), // Red pixel
		}

		const encoded = encodeWebP(image)

		// Should produce valid WebP
		expect(encoded.length).toBeGreaterThan(12)
		expect(encoded[0]).toBe(0x52) // R
	})

	// Note: Full roundtrip test is complex due to VP8L decoding complexity
	// This will be expanded as the decoder is refined
})
